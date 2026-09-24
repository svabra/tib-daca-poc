import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { I14yConceptsApiService } from './i14y-concepts-api.service';
import { I14yConcept } from './i14y-concepts.models';

export interface I14yThemeAggregate {
  key: string;
  label: string;
  concepts: readonly I14yConcept[];
}

export function aggregateI14yThemes(concepts: readonly I14yConcept[]): I14yThemeAggregate[] {
  const themes = new Map<string, { label: string; concepts: Map<string, I14yConcept> }>();
  for (const concept of concepts) {
    for (const rawTheme of concept.themes) {
      const label = rawTheme.trim();
      if (!label) continue;
      const key = label.normalize('NFKC').toLocaleLowerCase('de-CH');
      const aggregate = themes.get(key) ?? { label, concepts: new Map<string, I14yConcept>() };
      aggregate.concepts.set(concept.id, concept);
      themes.set(key, aggregate);
    }
  }
  const collator = new Intl.Collator('de-CH', { sensitivity: 'base' });
  return [...themes.entries()]
    .map(([key, value]) => ({ key, label: value.label, concepts: [...value.concepts.values()] }))
    .sort((left, right) => collator.compare(left.label, right.label));
}

@Component({
  selector: 'daca-i14y-themes',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="daca-page-heading themes-heading">
      <div>
        <p class="daca-eyebrow">Fachliche Semantik</p>
        <h1>Domäne und Terminology</h1>
        <p>Themen werden schreibgeschützt aus den im lokalen I14Y-Cache vorkommenden Concept-Zuordnungen zusammengefasst.</p>
      </div>
    </section>

    <nav class="semantic-tabs" aria-label="Domäne und Terminology">
      <a routerLink="/domains">Domänen</a>
      <a routerLink="/domains/terminology">Terminology</a>
      <a routerLink="/domains/concepts">I14Y-Konzepte</a>
      <a routerLink="/domains/themes" class="is-active" aria-current="page">Themen <span>{{ themes().length }}</span></a>
      <a routerLink="/domains/governance">Governance</a>
    </nav>

    <section class="daca-card themes-toolbar" aria-labelledby="themes-title">
      <div>
        <p class="daca-eyebrow">Lokaler I14Y-Cache</p>
        <h2 id="themes-title">Verwendete Themen</h2>
        <p>{{ conceptCount() }} Concepts bilden {{ themes().length }} Themen ab. DaCa-Domänen werden hier nicht als I14Y-Themen ausgegeben.</p>
      </div>
      <label>Themen durchsuchen<input type="search" [value]="query()" (input)="query.set(inputValue($event))" placeholder="Bezeichnung oder Concept"></label>
    </section>

    @if (loading()) {
      <div class="daca-card themes-state" aria-live="polite">Themen werden aus dem lokalen Concept-Cache ermittelt …</div>
    } @else if (error()) {
      <p class="daca-alert is-error" role="alert">{{ error() }} <button class="daca-button is-secondary" type="button" (click)="load()">Erneut laden</button></p>
    } @else if (filteredThemes().length) {
      <div class="theme-grid">
        @for (theme of filteredThemes(); track theme.key) {
          <article class="daca-card theme-card">
            <div class="daca-card-header">
              <div><p class="daca-eyebrow">I14Y-Thema</p><h2>{{ theme.label }}</h2></div>
              <strong class="theme-count" [attr.aria-label]="theme.concepts.length + ' Concepts'">{{ theme.concepts.length }}</strong>
            </div>
            <div class="daca-card-body">
              <ul>
                @for (concept of theme.concepts.slice(0, 4); track concept.id) { <li>{{ conceptName(concept) }}</li> }
              </ul>
              @if (theme.concepts.length > 4) { <p>+ {{ theme.concepts.length - 4 }} weitere</p> }
              <a class="daca-button is-secondary" routerLink="/domains/concepts" [queryParams]="{ theme: theme.label }">Zugeordnete Concepts anzeigen</a>
            </div>
          </article>
        }
      </div>
    } @else {
      <div class="daca-card themes-state"><h2>Keine Themen gefunden</h2><p>{{ query().trim() ? 'Passen Sie den Suchbegriff an.' : 'Im lokalen I14Y-Cache sind noch keine Themenzuordnungen vorhanden.' }}</p></div>
    }
  `,
  styles: [`
    .themes-heading{align-items:center}.semantic-tabs{display:flex;gap:.25rem;overflow-x:auto;margin-bottom:1.5rem;border-bottom:1px solid var(--daca-border)}.semantic-tabs a{flex:0 0 auto;min-height:44px;padding:.75rem 1rem;border-bottom:3px solid transparent;color:var(--daca-ink);font-weight:750;text-decoration:none}.semantic-tabs a.is-active{border-color:var(--daca-red);color:var(--daca-red-dark)}.semantic-tabs span{margin-left:.25rem;color:var(--daca-muted)}.themes-toolbar{display:grid;grid-template-columns:minmax(0,1fr) minmax(240px,360px);align-items:end;gap:1.5rem;margin-bottom:1.25rem;padding:1rem 1.2rem;box-shadow:none}.themes-toolbar h2,.themes-toolbar p{margin:.2rem 0}.themes-toolbar>div>p:last-child{color:var(--daca-muted);font-size:.72rem}.themes-toolbar label{display:grid;gap:.35rem;color:var(--daca-muted);font-size:.65rem;font-weight:800}.themes-toolbar input{min-height:42px;border:1px solid var(--daca-border-strong);border-radius:0;padding:.5rem;background:#fff}.theme-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem}.theme-card{box-shadow:none}.theme-card h2{margin:.15rem 0;font-size:1.05rem;overflow-wrap:anywhere}.theme-count{display:grid;place-items:center;min-width:40px;min-height:40px;border:1px solid var(--daca-blue);border-radius:50%;color:var(--daca-blue);font-size:.78rem}.theme-card ul{display:grid;gap:.45rem;margin:0 0 1rem;padding-left:1.2rem}.theme-card li,.theme-card p{color:var(--daca-muted);font-size:.7rem}.theme-card .daca-button{min-height:40px}.themes-state{display:grid;gap:.35rem;padding:2rem;text-align:center;box-shadow:none}.themes-state h2,.themes-state p{margin:0}.themes-state p{color:var(--daca-muted)}@media(max-width:820px){.themes-heading{align-items:flex-start;flex-direction:column}.themes-toolbar{grid-template-columns:1fr}}@media(max-width:480px){.theme-grid{grid-template-columns:1fr}.theme-card .daca-button{width:100%}}
  `],
})
export class I14yThemesComponent {
  readonly identity = inject(DemoIdentityService);
  private readonly api = inject(I14yConceptsApiService);
  readonly concepts = signal<readonly I14yConcept[]>([]);
  readonly themes = computed(() => aggregateI14yThemes(this.concepts()));
  readonly conceptCount = computed(() => this.concepts().length);
  readonly query = signal('');
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly filteredThemes = computed(() => {
    const query = this.query().trim().toLocaleLowerCase('de-CH');
    if (!query) return this.themes();
    return this.themes().filter((theme) => theme.label.toLocaleLowerCase('de-CH').includes(query)
      || theme.concepts.some((concept) => this.conceptName(concept).toLocaleLowerCase('de-CH').includes(query)));
  });

  constructor() {
    effect(() => {
      this.identity.userId();
      this.load();
    });
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.search().pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (collection) => this.concepts.set(collection.items),
      error: (error: Error) => this.error.set(error.message),
    });
  }

  conceptName(concept: I14yConcept): string {
    return concept.name.de || concept.name.fr || concept.name.it || concept.name.en || concept.identifiers[0] || concept.id;
  }

  inputValue(event: Event): string { return (event.target as HTMLInputElement).value; }
}
