import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, HostListener, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, Observable, Subscription } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { CatalogI18nService } from '../../core/catalog-i18n.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { LoadingIndicatorComponent } from '../../shared/loading-indicator.component';
import { TooltipDirective } from '../../shared/tooltip.directive';
import { SearchIconComponent } from './search-icon.component';
import { SEARCH_KINDS, SearchKind } from './catalog-search.models';
import { EMPTY_SEARCH_VIEW, sameViewConfiguration, SearchView, SearchViewConfiguration, SearchViewsApiService, SearchViewWrite, SharedSearchView } from './search-views-api.service';

type DialogMode = 'create' | 'edit' | 'share' | 'delete' | 'inbox' | 'review';

@Component({selector: 'daca-search-views', standalone: true,
  imports: [FormsModule, DatePipe, SearchIconComponent, LoadingIndicatorComponent, TooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './search-views.component.html', styleUrl: './search-views.component.css',
})
export class SearchViewsComponent {
  readonly configuration = input.required<SearchViewConfiguration>();
  readonly activeId = input<string | null>(null);
  readonly sharedViewId = input<string | null>(null);
  readonly organizations = input<readonly string[]>([]);
  readonly organizationLabels = input<ReadonlyMap<string, string>>(new Map());
  readonly domains = input<readonly {id: string; label: string}[]>([]);
  readonly applied = output<SearchView | null>();
  readonly activeLoaded = output<SearchView>();
  readonly sharedClosed = output<void>();
  readonly i18n = inject(CatalogI18nService);
  readonly identity = inject(DemoIdentityService);
  private readonly api = inject(SearchViewsApiService);
  private readonly catalog = inject(CatalogApiService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  readonly views = signal<readonly SearchView[]>([]);
  readonly incoming = signal<readonly SharedSearchView[]>([]);
  readonly selected = computed(() => this.views().find(view => view.id === this.activeId()) ?? null);
  readonly modified = computed(() => !!this.selected() && !sameViewConfiguration(this.selected()!.configuration, this.configuration()));
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly error = signal('');
  readonly notice = signal('');
  readonly busy = signal(false);
  readonly dialogMode = signal<DialogMode | null>(null);
  readonly editing = signal<SearchView | null>(null);
  readonly shared = signal<SharedSearchView | null>(null);
  readonly personQuery = signal('');
  readonly recipients = signal<ReadonlySet<string>>(new Set());
  readonly people = computed(() => {
    const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
    const query = normalize(this.personQuery().trim());
    return this.identity.users().filter(person => person.id !== this.identity.userId()
      && (!query || normalize([person.displayName, person.organization, person.id].join(' ')).includes(query)));
  });
  readonly kinds = SEARCH_KINDS;
  form: SearchViewWrite = {name: '', description: '', configuration: {...EMPTY_SEARCH_VIEW}};
  message = '';
  adoptedName = '';
  private requests = new Subscription();
  private inboxRequest?: Subscription;
  private shareRequest?: Subscription;
  private trigger: HTMLElement | null = null;

  constructor() {
    effect(() => { this.identity.userId(); untracked(() => this.load(true)); });
    effect(() => { const id = this.sharedViewId(); this.identity.userId(); if (id) untracked(() => this.review(id)); });
    effect(() => {
      const mode = this.dialogMode(), dialog = this.dialog()?.nativeElement;
      if (mode && dialog && !dialog.open) { dialog.showModal(); (dialog.querySelector<HTMLElement>('input:not([type=checkbox])') ?? dialog.querySelector<HTMLElement>('button'))?.focus(); }
    });
    const refresh = () => { if (document.visibilityState === 'visible' && !this.loading() && !this.dialogMode()) this.refreshInbox(); };
    const timer = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer); window.removeEventListener('focus', refresh);
      this.requests.unsubscribe(); this.inboxRequest?.unsubscribe(); this.shareRequest?.unsubscribe();
    });
  }

  load(identityChanged = false): void {
    this.requests.unsubscribe(); this.requests = new Subscription(); this.inboxRequest?.unsubscribe(); this.shareRequest?.unsubscribe();
    if (identityChanged) {
      this.dialogMode.set(null); this.shared.set(null); this.editing.set(null); this.busy.set(false); this.notice.set(''); this.error.set('');
      this.recipients.set(new Set()); this.form = {name:'',description:'',configuration:{...EMPTY_SEARCH_VIEW}}; this.message=''; this.adoptedName='';
    }
    this.views.set([]); this.incoming.set([]); this.loading.set(true); this.loadError.set('');
    const actor = this.identity.userId();
    this.requests.add(forkJoin({views: this.api.list(), incoming: this.api.inbox()}).subscribe({
      next: result => {
        if (actor !== this.identity.userId()) return;
        this.views.set(result.views); this.incoming.set(result.incoming); this.loading.set(false);
        const active = this.selected();
        if (active) this.activeLoaded.emit(active);
        else if (this.activeId()) { this.applied.emit(null); this.notice.set(this.i18n.t('viewUnavailable')); }
      }, error: () => { if (actor === this.identity.userId()) { this.loading.set(false); this.loadError.set(this.i18n.t('viewsError')); } },
    }));
  }

  private refreshInbox(): void {
    const actor = this.identity.userId(); this.inboxRequest?.unsubscribe();
    this.inboxRequest = this.api.inbox().subscribe({next: items => {
      if (actor !== this.identity.userId()) return;
      if (items.map(item => item.id).join() !== this.incoming().map(item => item.id).join()) this.catalog.refreshWorkflowTasks(true);
      this.incoming.set(items);
    }, error: () => { /* The tasks feed reports notification health; a failed refresh must not erase known messages. */ }});
  }

  choose(id: string): void { this.applied.emit(this.views().find(view => view.id === id) ?? null); }

  open(mode: Exclude<DialogMode, 'review'>, trigger: EventTarget | null): void {
    this.trigger = trigger instanceof HTMLElement ? trigger : null;
    const actions=this.host.nativeElement.querySelector('details.view-actions');
    if (this.trigger && actions?.contains(this.trigger)) this.trigger=actions.querySelector<HTMLElement>('summary');
    this.closeActions();
    this.error.set(''); this.notice.set(''); this.editing.set(this.selected());
    if (mode === 'create') this.form = {name: '', description: '', configuration: {...this.configuration()}};
    if (mode === 'edit' && this.selected()) this.form = {name: this.selected()!.name, description: this.selected()!.description, configuration: {...this.selected()!.configuration}};
    if (mode === 'share') { this.recipients.set(new Set()); this.personQuery.set(''); this.message = ''; }
    this.dialogMode.set(mode);
  }

  close(): void {
    if (this.busy()) return;
    const review = this.dialogMode() === 'review';
    this.shareRequest?.unsubscribe(); this.dialog()?.nativeElement.close(); this.dialogMode.set(null); this.error.set('');
    if (review) this.sharedClosed.emit();
    const target=this.trigger?.isConnected&&!this.trigger.closest('dialog')?this.trigger:this.host.nativeElement.querySelector<HTMLElement>('.view-select select');
    target?.focus({preventScroll: true});
  }

  review(id: string, trigger: EventTarget | null = null): void {
    this.shareRequest?.unsubscribe(); this.trigger = trigger instanceof HTMLElement ? trigger : this.trigger;
    this.shared.set(null); this.error.set(''); this.dialogMode.set('review');
    const actor = this.identity.userId();
    this.shareRequest = this.api.received(id).subscribe({next: share => {
      if (actor !== this.identity.userId()) return;
      this.shared.set(share); this.adoptedName = share.snapshot.name;
    }, error: error => this.operationError(error)});
  }

  toggleRecipient(id: string, checked: boolean): void {
    this.recipients.update(current => { const next = new Set(current); if (checked && next.size < 30) next.add(id); else if (!checked) next.delete(id); return next; });
  }

  submit(): void {
    const mode = this.dialogMode();
    if (mode === 'create' || mode === 'edit') this.save();
    else if (mode === 'share') this.send();
    else if (mode === 'delete') this.remove();
    else if (mode === 'review') this.adopt();
  }

  private run<T>(operation: Observable<T>, success: (value: T) => void): void {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); const actor = this.identity.userId();
    this.requests.add(operation.subscribe({next: value => {
      if (actor !== this.identity.userId()) return;
      this.busy.set(false); success(value);
    }, error: error => { if (actor === this.identity.userId()) { this.busy.set(false); this.operationError(error); } }}));
  }

  private operationError(error: {status?: number}): void {
    this.error.set(this.i18n.t(error?.status === 412 ? 'viewConflict' : [403,404,410].includes(error?.status ?? 0) ? 'viewUnavailable' : 'viewOperationFailed'));
  }

  private remember(view: SearchView): void {
    this.views.update(items => [view, ...items.filter(item => item.id !== view.id)]); this.applied.emit(view);
  }

  private save(): void {
    if (!this.form.name.trim()) return;
    const body = {...this.form, name: this.form.name.trim(), description: this.form.description.trim()};
    const view = this.editing();
    this.run(this.dialogMode() === 'edit' && view ? this.api.update(view, body) : this.api.create(body), saved => {
      this.remember(saved); this.close(); this.notice.set(this.i18n.t('viewSaved'));
    });
  }

  saveCurrent(): void {
    const view = this.selected(); if (!view) return;
    this.closeActions();
    this.run(this.api.update(view, {name: view.name, description: view.description, configuration: this.configuration()}), saved => {
      this.remember(saved); this.notice.set(this.i18n.t('viewSaved'));
    });
  }

  private send(): void {
    const view = this.editing(); if (!view || !this.recipients().size) return;
    this.run(this.api.share(view, [...this.recipients()], this.message.trim()), result => {
      this.close(); this.notice.set(result.createdCount ? this.i18n.t('viewShared', {count: result.createdCount}) : this.i18n.t('viewAlreadyShared'));
    });
  }

  private remove(): void {
    const view = this.editing(); if (!view) return;
    this.run(this.api.delete(view), () => {
      this.views.update(items => items.filter(item => item.id !== view.id));
      if (this.activeId() === view.id) this.applied.emit(null);
      this.close(); this.notice.set(this.i18n.t('viewDeleted'));
    });
  }

  private adopt(): void {
    const share = this.shared(); if (!share || !this.adoptedName.trim() || share.dismissedAt || (share.acceptedAt && !share.acceptedViewId)) return;
    this.run(this.api.accept(share, this.adoptedName.trim()), view => {
      this.remember(view); this.incoming.update(items => items.filter(item => item.id !== share.id));
      this.catalog.refreshWorkflowTasks(); this.close(); this.notice.set(this.i18n.t('viewAdopted'));
    });
  }

  dismiss(): void {
    const share = this.shared(); if (!share) return;
    this.run(this.api.dismiss(share), () => {
      this.incoming.update(items => items.filter(item => item.id !== share.id));
      this.catalog.refreshWorkflowTasks(); this.close(); this.notice.set(this.i18n.t('viewDismissed'));
    });
  }

  kindLabel(kind: SearchKind | 'all'): string {
    return this.i18n.t(({all: 'searchAll', product: 'searchProducts', logical: 'searchLogicalModels', structure: 'searchStructures', field: 'searchFields', term: 'searchTerms', domain: 'domains', source: 'sourcePlural'} as const)[kind]);
  }
  organizationLabel(id: string): string { return this.organizationLabels().get(id) ?? id; }
  domainKnown(id: string): boolean { return this.domains().some(domain => domain.id === id); }
  summary(configuration: SearchViewConfiguration): string[] {
    return [configuration.query ? `«${configuration.query}»` : '', this.kindLabel(configuration.kind),
      configuration.organization === 'all' ? '' : this.organizationLabel(configuration.organization),
      configuration.domain === 'all' ? '' : this.domains().find(item => item.id === configuration.domain)?.label ?? configuration.domain,
      configuration.status === 'all' ? '' : this.i18n.t('searchActive'),
      configuration.connection === 'all' ? '' : this.i18n.t(configuration.connection === 'connected' ? 'searchConnected' : 'searchMetadata'),
      this.i18n.t(configuration.mode === 'focus' ? 'searchFocusMode' : 'searchContextMode'),
      this.i18n.t(configuration.sort === 'name' ? 'searchName' : 'searchRelevance')].filter(Boolean);
  }
  private closeActions(): void { this.host.nativeElement.querySelector('details.view-actions')?.removeAttribute('open'); }
  @HostListener('document:keydown.escape') closeActionsOnEscape(): void { this.closeActions(); }
  @HostListener('document:pointerdown', ['$event']) outside(event: PointerEvent): void {
    if (!this.host.nativeElement.querySelector('details.view-actions')?.contains(event.target as Node)) this.closeActions();
  }
}
