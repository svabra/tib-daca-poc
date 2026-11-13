import {
  ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender,
  computed, effect, inject, input, output, signal, viewChild,
} from '@angular/core';
import { DomainSummary } from '../../core/catalog.models';
import { catalogProductMatches } from '../welcome/welcome-search';

export type SemanticPickerEntry = Pick<DomainSummary, 'id' | 'status' | 'preferredLabel' | 'definition' | 'labels'>;

const COPY = {
  domain: {
    search: 'Fachdomänen suchen', selected: 'Ausgewählte Fachdomänen', results: 'Fachdomänen-Suchergebnisse',
    empty: 'Keine Fachdomäne zugeordnet.', missing: 'Nicht mehr verfügbare Fachdomäne',
    noMatches: 'Keine weiteren passenden Fachdomänen.',
    helper: 'Suchen und einen Treffer auswählen. Mehrere Fachdomänen sind möglich.',
    placeholder: 'Name, Abkürzung oder Beschreibung',
  },
  term: {
    search: 'Terminologiebegriffe suchen', selected: 'Ausgewählte Terminologiebegriffe', results: 'Terminologie-Suchergebnisse',
    empty: 'Keine Terminologiebegriffe zugeordnet.', missing: 'Nicht mehr verfügbarer Terminologiebegriff',
    noMatches: 'Keine weiteren passenden Terminologiebegriffe.',
    helper: 'Suchen und einen Treffer auswählen. Mehrere Terminologiebegriffe sind möglich.',
    placeholder: 'Begriff, Abkürzung oder Definition',
  },
};

@Component({
  selector: 'daca-semantic-picker', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './semantic-picker.component.html', styleUrl: './semantic-picker.component.css',
})
export class SemanticPickerComponent {
  private static nextId = 0;
  readonly listId = `metadata-semantic-results-${++SemanticPickerComponent.nextId}`;
  readonly kind = input<'domain' | 'term'>('domain');
  readonly items = input.required<readonly SemanticPickerEntry[]>();
  readonly existingItems = input<readonly SemanticPickerEntry[]>([]);
  readonly selectedIds = input.required<readonly string[]>();
  readonly disabled = input(false);
  readonly contextKey = input('');
  readonly selectionToggle = output<string>();
  readonly copy = computed(() => COPY[this.kind()]);
  readonly query = signal('');
  readonly open = signal(false);
  readonly activeIndex = signal(0);
  private readonly injector = inject(Injector);
  private readonly list = viewChild<ElementRef<HTMLElement>>('resultsList');
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  readonly selected = computed(() => {
    const known = new Map([...this.existingItems(), ...this.items()].map(item => [item.id, item]));
    return this.selectedIds().map(id => ({ id, label: known.get(id)?.preferredLabel ?? this.copy().missing }));
  });
  readonly matches = computed(() => this.items().filter(item => item.status === 'active'
    && !this.selectedIds().includes(item.id) && catalogProductMatches(this.query(), [
      item.preferredLabel, item.definition,
      ...item.labels.flatMap(label => [label.preferredLabel, label.definition, ...(label.alternativeLabels ?? [])]),
    ])).sort((a, b) => a.preferredLabel.localeCompare(b.preferredLabel, 'de-CH')));
  readonly results = computed(() => this.query().trim() ? this.matches().slice(0, 10) : []);
  readonly expanded = computed(() => !this.disabled() && this.open() && Boolean(this.query().trim()));

  constructor() {
    effect(() => {
      this.contextKey(); this.disabled(); this.kind();
      this.query.set(''); this.open.set(false); this.activeIndex.set(0);
    });
  }

  search(value: string): void { this.query.set(value); this.open.set(true); this.activeIndex.set(0); }

  choose(id: string): void {
    if (this.disabled() || this.selectedIds().includes(id)
      || !this.items().some(item => item.id === id && item.status === 'active')) return;
    this.selectionToggle.emit(id);
    this.query.set(''); this.open.set(false); this.activeIndex.set(0);
  }

  remove(id: string): void {
    if (this.disabled() || !this.selectedIds().includes(id)) return;
    this.selectionToggle.emit(id);
    this.searchInput()?.nativeElement.focus();
  }

  aliases(item: SemanticPickerEntry): string {
    return [...new Set(item.labels.flatMap(label => label.alternativeLabels ?? []))].join(', ');
  }

  leave(event: FocusEvent): void {
    if (!(event.relatedTarget instanceof Node) || !(event.currentTarget as HTMLElement).contains(event.relatedTarget)) this.open.set(false);
  }

  keys(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.open.set(false); return; }
    if (event.key === 'Enter') {
      event.preventDefault();
      const active = this.results()[this.activeIndex()];
      if (this.expanded() && active) this.choose(active.id);
      return;
    }
    if (!['ArrowDown', 'ArrowUp'].includes(event.key) || !this.results().length) return;
    event.preventDefault();
    const wasOpen = this.expanded(); this.open.set(true);
    this.activeIndex.set(wasOpen
      ? (this.activeIndex() + (event.key === 'ArrowDown' ? 1 : -1) + this.results().length) % this.results().length
      : event.key === 'ArrowDown' ? 0 : this.results().length - 1);
    afterNextRender(() => this.list()?.nativeElement.children[this.activeIndex()]?.scrollIntoView?.({ block: 'nearest' }), { injector: this.injector });
  }
}
