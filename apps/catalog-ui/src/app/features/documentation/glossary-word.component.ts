import { ChangeDetectionStrategy, Component, ElementRef, HostListener, OnDestroy, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DocumentationApiService, DocumentationGlossaryTerm, ResponsibilityRole } from '../../core/documentation-api.service';
import { UserPreferencesService } from '../../core/user-preferences.service';

let sequence = 0;

@Component({
  selector: 'daca-glossary-word',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="glossary-word" (mouseenter)="open()" (mouseleave)="closeOnPointer()">
      <button type="button" class="glossary-word-trigger" [attr.aria-expanded]="visible()"
        [attr.aria-describedby]="visible() ? tooltipId : null" (focus)="open()" (blur)="closeOnBlur($event)" (click)="open()">{{ label() }}</button>
      @if (visible()) {
        <span class="glossary-word-popup" [style.left.px]="left()" [style.top.px]="top()" [id]="tooltipId" (mouseenter)="keepOpen()">
          @if (entry(); as term) {
            <strong>{{ term.term }}</strong><span>{{ term.shortDescription }}</span>
            <a [routerLink]="['/documentation/glossary', term.id]">{{ linkLabel() }} →</a>
          } @else if (loading()) { <span>{{ loadingLabel() }}</span> }
          @else { <span>{{ missingLabel() }}</span> }
        </span>
      }
    </span>
  `,
  styles: [`
    .glossary-word{display:inline;position:relative}.glossary-word-trigger{border:0;padding:0;background:transparent;color:inherit;font:inherit;font-weight:inherit;cursor:help;text-decoration-line:underline;text-decoration-style:wavy;text-decoration-color:#b7c0c8;text-decoration-thickness:1px;text-underline-offset:4px}.glossary-word-trigger:focus-visible{outline:2px solid var(--daca-blue);outline-offset:3px}.glossary-word-popup{position:fixed;z-index:1500;display:grid;gap:8px;width:min(320px,calc(100vw - 24px));border:1px solid #4a6a82;border-top:3px solid var(--daca-blue);padding:13px 15px;background:var(--daca-surface);color:var(--daca-ink);box-shadow:0 12px 30px #061e3350;font-size:.8rem;line-height:1.4;text-align:left}.glossary-word-popup strong{font-size:.84rem}.glossary-word-popup a{color:var(--daca-blue);font-weight:700}
  `],
})
export class GlossaryWordComponent implements OnDestroy {
  private readonly api = inject(DocumentationApiService);
  private readonly preferences = inject(UserPreferencesService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly lookup = input.required<string>();
  readonly label = input.required<string>();
  readonly entry = signal<DocumentationGlossaryTerm | null>(null);
  readonly visible = signal(false);
  readonly loading = signal(false);
  readonly left = signal(12);
  readonly top = signal(12);
  readonly tooltipId = `catalog-glossary-tooltip-${++sequence}`;
  private loadedKey = '';
  private closeTimer: ReturnType<typeof setTimeout> | null = null;

  readonly linkLabel = computed(() => ({ de: 'Im Glossar öffnen', fr: 'Ouvrir dans le glossaire', it: 'Apri nel glossario', en: 'Open in glossary' })[this.preferences.language()]);
  readonly loadingLabel = computed(() => ({ de: 'Begriff wird geladen …', fr: 'Chargement du terme…', it: 'Caricamento del termine…', en: 'Loading term…' })[this.preferences.language()]);
  readonly missingLabel = computed(() => ({ de: 'Kein Glossareintrag gefunden.', fr: 'Aucune entrée trouvée.', it: 'Nessuna voce trovata.', en: 'No glossary entry found.' })[this.preferences.language()]);

  open(): void {
    this.keepOpen();
    this.visible.set(true);
    this.position();
    const key = `${this.preferences.language()}:${this.lookup()}`;
    if (this.loadedKey === key) return;
    this.loadedKey = key;
    this.loading.set(true);
    this.entry.set(null);
    this.api.lookupTerm(this.lookup(), this.preferences.language()).subscribe({
      next: (entry) => { if (this.loadedKey === key) { this.entry.set(entry); this.loading.set(false); queueMicrotask(() => this.position()); } },
      error: () => { if (this.loadedKey === key) this.loading.set(false); },
    });
  }

  keepOpen(): void {
    if (this.closeTimer !== null) clearTimeout(this.closeTimer);
    this.closeTimer = null;
  }
  closeOnPointer(): void {
    if (this.host.nativeElement.contains(document.activeElement)) return;
    this.keepOpen();
    // The fixed popup sits a few pixels below the trigger. Allow the pointer
    // to cross that gap before closing it.
    this.closeTimer = setTimeout(() => {
      this.visible.set(false);
      this.closeTimer = null;
    }, 250);
  }
  closeOnBlur(event: FocusEvent): void {
    if (!(event.relatedTarget instanceof Node) || !this.host.nativeElement.contains(event.relatedTarget)) this.visible.set(false);
  }
  @HostListener('document:keydown.escape') closeOnEscape(): void { this.keepOpen(); this.visible.set(false); }
  @HostListener('document:pointerdown', ['$event']) closeOutside(event: PointerEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) { this.keepOpen(); this.visible.set(false); }
  }
  ngOnDestroy(): void { this.keepOpen(); }
  private position(): void {
    const rect = this.host.nativeElement.getBoundingClientRect();
    this.left.set(Math.max(12, Math.min(rect.left, window.innerWidth - 332)));
    this.top.set(Math.min(rect.bottom + 9, window.innerHeight - 180));
  }
}

@Component({
  selector: 'daca-role-term',
  standalone: true,
  imports: [GlossaryWordComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<daca-glossary-word [lookup]="lookup()" [label]="label()" />`,
})
export class RoleTermComponent {
  private readonly preferences = inject(UserPreferencesService);
  readonly role = input.required<ResponsibilityRole>();
  readonly lookup = computed(() => ({ data_owner: 'Data Owner', deputy_data_owner: 'Stv. Data Owner', data_steward: 'Data Steward' })[this.role()]);
  readonly label = computed(() => {
    const labels = {
      data_owner: ['Data Owner', 'Data Owner', 'Data Owner', 'Data Owner'],
      deputy_data_owner: ['Stv. Data Owner', 'Data Owner suppléant', 'Sostituto Data Owner', 'Deputy Data Owner'],
      data_steward: ['Data Steward', 'Data Steward', 'Data Steward', 'Data Steward'],
    } as const;
    return labels[this.role()][({ de: 0, fr: 1, it: 2, en: 3 })[this.preferences.language()]];
  });
}
