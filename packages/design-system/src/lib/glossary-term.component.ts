import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';

export const DACA_GLOSSARY: Readonly<Record<string, string>> = {
  DaCa: 'Distributed Data Catalog – der zentrale Einstieg in Metadaten, Verantwortlichkeiten und Zugriffsregeln der Data Platform BIT.',
  DAAIF: 'Data Analytics und AI Feed – Expert Data Analytics and Data Product Curation Platform.',
  ISBO: 'Informatiksicherheitsbeauftragte oder Informatiksicherheitsbeauftragter der Organisationseinheit.',
  PoC: 'Proof of Concept – eine bewusst begrenzte Umsetzung zum Prüfen von Nutzen, Abläufen und technischen Annahmen.',
  'DCAT-AP CH': 'Schweizer Anwendungsprofil des W3C Data Catalog Vocabulary für interoperable Katalogmetadaten.',
  PBAC: 'Policy-Based Access Control – Zugriffsentscheide anhand expliziter, prüfbarer Richtlinien.',
  OPA: 'Open Policy Agent – wertet die publizierten Zugriffsrichtlinien aus.',
  PEP: 'Policy Enforcement Point – erzwingt den Zugriffsentscheid am Datenprodukt.',
  PIP: 'Policy Information Point – liefert vertrauenswürdige Attribute für einen Zugriffsentscheid.',
  MCP: 'Model Context Protocol – hier ausschliesslich für ausdrücklich freigegebenen Metadatenzugriff durch KOBY.',
  eIAM: 'Elektronisches Identitäts- und Zugriffsmanagement des Bundes für persönliche Identitäten.',
  M2M: 'Machine-to-Machine – technischer Zugriff einer eindeutig identifizierten Maschine oder eines Services.',
  I14Y: 'Nationaler Metadatenkatalog der Schweiz. I14Y publiziert Beschreibungen von Datensätzen und APIs, nicht deren Produktdaten.',
  KOBY: 'AI Services der Data Platform BIT; im PoC wird der fachliche Kontextgraph statisch und nachvollziehbar simuliert.',
};

let tooltipSequence = 0;

@Component({
  selector: 'daca-glossary-term',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="daca-glossary" (mouseenter)="open()" (mouseleave)="closeOnPointer()">
      <button
        type="button"
        class="daca-glossary-trigger"
        [class.is-icon-only]="iconOnly()"
        [attr.aria-label]="iconOnly() ? 'Begriff ' + term() + ' erklären' : null"
        [attr.aria-describedby]="tooltipId"
        [attr.aria-expanded]="visible()"
        (click)="toggle($event)"
        (focus)="open()"
        (blur)="closeOnBlur($event)"
      >{{ iconOnly() ? '?' : label() }}</button>
      <span
        #tooltip
        class="daca-glossary-tooltip"
        [class.is-visible]="visible()"
        [style.left.px]="left()"
        [style.top.px]="top()"
        [id]="tooltipId"
        role="tooltip"
      ><strong>{{ term() }}</strong><span>{{ definition() }}</span></span>
    </span>
  `,
})
export class DacaGlossaryTermComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly term = input.required<string>();
  readonly display = input<string | null>(null);
  readonly explanation = input<string | null>(null);
  readonly iconOnly = input(false);
  readonly visible = signal(false);
  readonly left = signal(16);
  readonly top = signal(16);
  readonly label = computed(() => this.display() ?? this.term());
  readonly definition = computed(() => this.explanation() ?? DACA_GLOSSARY[this.term()] ?? 'Fachbegriff im DaCa-Kontext.');
  readonly tooltipId = `daca-glossary-${++tooltipSequence}`;

  open(): void {
    this.visible.set(true);
    queueMicrotask(() => this.position());
  }

  toggle(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.open();
  }

  closeOnPointer(): void {
    if (!this.host.nativeElement.contains(document.activeElement)) this.visible.set(false);
  }

  closeOnBlur(event: FocusEvent): void {
    const next = event.relatedTarget;
    if (!(next instanceof Node) || !this.host.nativeElement.contains(next)) this.visible.set(false);
  }

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    this.visible.set(false);
  }

  @HostListener('document:pointerdown', ['$event'])
  closeOutside(event: PointerEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) this.visible.set(false);
  }

  @HostListener('window:resize')
  @HostListener('window:scroll')
  reposition(): void {
    if (this.visible()) this.position();
  }

  private position(): void {
    const trigger = this.host.nativeElement.querySelector<HTMLElement>('.daca-glossary-trigger');
    const tooltip = this.host.nativeElement.querySelector<HTMLElement>('.daca-glossary-tooltip');
    if (!trigger || !tooltip) return;
    const triggerRect = trigger.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const edge = 12;
    const centered = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
    this.left.set(Math.max(edge, Math.min(centered, window.innerWidth - tooltipRect.width - edge)));
    const above = triggerRect.top - tooltipRect.height - 10;
    this.top.set(above >= edge ? above : triggerRect.bottom + 10);
  }
}
