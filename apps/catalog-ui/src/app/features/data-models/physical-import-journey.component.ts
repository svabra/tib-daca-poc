import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, Injector, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { CatalogI18nService } from '../../core/catalog-i18n.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DataModelsApiService } from './data-models-api.service';
import { PhysicalSource } from './data-models.models';

@Component({
  selector: 'daca-physical-import-journey', standalone: true, imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button #trigger class="journey-menu-trigger" type="button" aria-haspopup="menu" [attr.aria-expanded]="menuOpen()"
      [disabled]="!identity.canEditModels() || busy()" [attr.aria-label]="i18n.t('adaJourneyActions')"
      [attr.aria-controls]="'ada-journey-menu-' + instanceId" (click)="toggle()" (keydown)="triggerKeydown($event)">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>
    </button>
    @if(menuOpen()){
      <div #menu class="journey-menu" role="menu" [id]="'ada-journey-menu-' + instanceId" [attr.aria-label]="i18n.t('adaJourneyActions')" (keydown)="menuKeydown($event)">
        <a role="menuitem" tabindex="-1" href="/api/v1/import-journeys/ada/inventory.csv" download="ada_bewirtschaftung.csv" (click)="closeMenu(true)">{{ i18n.t('adaJourneyDownload') }}</a>
        <button role="menuitem" tabindex="-1" type="button" (click)="openReset()">{{ i18n.t('adaJourneyReset') }}</button>
      </div>
    }
    <dialog #dialog [attr.aria-labelledby]="'ada-reset-title-' + instanceId" (cancel)="cancel($event)" (close)="restoreFocus()">
      <p class="daca-eyebrow">{{ i18n.t('adaJourney') }}</p><h2 [id]="'ada-reset-title-' + instanceId">{{ i18n.t('adaJourneyReset') }}</h2>
      <p>{{ i18n.t('adaJourneyResetExplanation') }}</p>
      <label>{{ i18n.t('adaJourneyOrganization') }}<select [ngModel]="scopeId()" (ngModelChange)="selectScope($event)" [disabled]="busy()">
        <option value="" disabled>{{ i18n.t('adaJourneyChooseOrganization') }}</option>
        @for(scope of availableScopes();track scope.id){<option [value]="scope.id">{{ scope.department }} · {{ scope.label }}</option>}
      </select></label>
      @if(loading()){<p role="status">{{ i18n.t('adaJourneyChecking') }}</p>}
      @else if(source();as source){<p class="reset-target"><strong>{{ source.name }}</strong><br>{{ i18n.t('adaJourneyResetConsequences') }}</p>}
      @else if(scopeId() && !error()){<p role="status">{{ i18n.t('adaJourneyNotImported') }}</p>}
      @if(error()){<p class="daca-alert is-error" role="alert">{{ error() }}</p>}
      <footer><button class="daca-button is-secondary" type="button" [disabled]="busy()" (click)="cancel()">{{ i18n.t('cancelSourceAccess') }}</button>
        <button class="daca-button" type="button" [disabled]="busy() || loading() || !source()" (click)="confirm()">{{ i18n.t(busy() ? 'adaJourneyResetting' : 'adaJourneyConfirmReset') }}</button></footer>
    </dialog>
  `,
  styles: [`
    :host{position:relative;display:inline-flex}.journey-menu-trigger{display:grid;place-items:center;width:40px;min-height:40px;border:1px solid var(--daca-border-strong);padding:0;background:var(--daca-surface,#fff);color:var(--daca-blue);cursor:pointer}.journey-menu-trigger svg{width:22px;height:22px;fill:currentColor}.journey-menu-trigger:hover,.journey-menu-trigger[aria-expanded=true]{background:var(--daca-blue-soft,#edf5fa)}
    .journey-menu{position:absolute;z-index:40;top:calc(100% + .3rem);right:0;width:min(22rem,calc(100vw - 4rem));border:1px solid var(--daca-border-strong);padding:.25rem 0;background:var(--daca-surface,#fff);box-shadow:0 8px 24px #102a3b33}.journey-menu a,.journey-menu button{box-sizing:border-box;display:flex;align-items:center;width:100%;min-height:44px;border:0;padding:.65rem .8rem;background:transparent;color:var(--daca-blue);font:inherit;font-size:.7rem;font-weight:700;line-height:1.4;text-align:left;text-decoration:none;cursor:pointer}.journey-menu :is(a,button):hover{background:var(--daca-blue-soft,#edf5fa)}:focus-visible{outline:2px solid var(--daca-blue);outline-offset:2px}button:disabled{cursor:not-allowed;opacity:.55}
    dialog{box-sizing:border-box;width:min(640px,calc(100vw - 2rem));border:1px solid var(--daca-border);border-top:5px solid var(--daca-red);padding:1.4rem;background:var(--daca-surface,#fff);color:var(--daca-ink);box-shadow:0 15px 45px #102a3b55}dialog::backdrop{background:#13253688}h2{margin:.2rem 0}p{font-size:.8rem;line-height:1.5;overflow-wrap:anywhere}label{display:grid;gap:.4rem;font-size:.75rem;font-weight:750}select{width:100%;min-height:44px;border:1px solid var(--daca-border-strong);padding:.5rem;background:var(--daca-surface,#fff);color:var(--daca-ink);font:inherit}.reset-target{border-left:4px solid var(--daca-red);padding:.7rem;background:var(--daca-blue-soft,#edf5fa)}footer{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:.6rem;margin-top:1.2rem}
  `],
})
export class PhysicalImportJourneyComponent {
  private static nextId = 0;
  readonly instanceId = PhysicalImportJourneyComponent.nextId++;
  readonly scopes = input<readonly {id: string; department: string; label: string}[] | null>(null);
  readonly reset = output<{organizationId: string}>();
  readonly identity = inject(DemoIdentityService);
  readonly availableScopes = computed(() => this.scopes() ?? [...new Map((this.identity.user().modelingAssignments ?? []).map(item => [item.organizationId,
    {id: item.organizationId, department: item.departmentCode, label: item.organizationName}])).values()]);
  readonly i18n = inject(CatalogI18nService);
  readonly menuOpen = signal(false);
  readonly scopeId = signal('');
  readonly source = signal<PhysicalSource | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  private readonly api = inject(DataModelsApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly menu = viewChild<ElementRef<HTMLElement>>('menu');
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private generation = 0;

  constructor() { effect(() => { this.identity.userId(); this.generation++; this.menuOpen.set(false); this.source.set(null); this.error.set(''); this.loading.set(false); this.busy.set(false); const dialog=this.dialog()?.nativeElement;if(dialog?.open)dialog.close(); }); }
  toggle(): void { if(this.menuOpen())this.closeMenu(true);else this.openMenu(); }
  private openMenu(last = false): void {
    this.menuOpen.set(true);
    afterNextRender(() => { const items=this.items(); (last?items.at(-1):items[0])?.focus(); },{injector:this.injector});
  }
  closeMenu(focus = false): void { this.menuOpen.set(false); if(focus)this.restoreFocus(); }
  restoreFocus(): void { this.trigger().nativeElement.focus(); }
  openReset(): void {
    if(!this.identity.canEditModels() || this.busy())return;
    this.closeMenu();
    const preferred=this.availableScopes().length===1 ? this.availableScopes()[0] : undefined;
    this.dialog()?.nativeElement.showModal(); this.selectScope(preferred?.id ?? '');
  }
  selectScope(id: string): void {
    if(this.busy())return;
    const generation=++this.generation; this.scopeId.set(id); this.source.set(null); this.error.set('');
    const scope=this.availableScopes().find(scope=>scope.id===id); this.loading.set(!!scope); if(!scope)return;
    this.api.adaImportJourney(scope.department,scope.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: source=>{if(generation!==this.generation)return;this.source.set(source);this.loading.set(false);},
      error:(error:Error)=>{if(generation!==this.generation)return;this.error.set(error.message);this.loading.set(false);},
    });
  }
  cancel(event?: Event): void { if(this.busy()){event?.preventDefault();return;} this.generation++;this.dialog()?.nativeElement.close(); }
  confirm(): void {
    const scope=this.availableScopes().find(scope=>scope.id===this.scopeId()),source=this.source();
    if(!scope || !source || this.loading() || this.busy() || !this.identity.canEditModels())return;
    const generation=this.generation; this.busy.set(true);this.error.set('');
    this.api.resetAdaImport(scope.department,scope.id,source.revision).pipe(takeUntilDestroyed(this.destroyRef),finalize(()=>{if(generation===this.generation)this.busy.set(false);})).subscribe({
      next:()=>{if(generation!==this.generation)return;this.dialog()?.nativeElement.close();this.source.set(null);this.reset.emit({organizationId:scope.id});},
      error:(error:Error)=>{if(generation!==this.generation)return;this.error.set(error.message);},
    });
  }
  @HostListener('document:click',['$event']) outsideClick(event:MouseEvent):void { if(!this.host.nativeElement.contains(event.target as Node))this.closeMenu(); }
  triggerKeydown(event:KeyboardEvent):void {
    if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();this.openMenu(event.key==='ArrowUp');}
    else if(event.key==='Escape'){event.preventDefault();this.closeMenu(true);}
  }
  menuKeydown(event:KeyboardEvent):void {
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.closeMenu(true);return;}
    if(event.key==='Tab'){this.closeMenu(true);return;}
    if(event.key===' '){event.preventDefault();(document.activeElement as HTMLElement)?.click();return;}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();const items=this.items(),index=items.indexOf(document.activeElement as HTMLElement);
    items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();
  }
  private items():HTMLElement[]{return [...(this.menu()?.nativeElement.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])];}
}
