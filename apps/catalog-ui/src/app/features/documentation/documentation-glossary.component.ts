import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { DocumentationApiService, DocumentationGlossaryTerm } from '../../core/documentation-api.service';
import { UserPreferencesService } from '../../core/user-preferences.service';

type Copy = readonly [string, string, string, string];

@Component({
  selector: 'daca-documentation-glossary',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="documentation-breadcrumb" [attr.aria-label]="tr(['Brotkrümelnavigation', 'Fil d’Ariane', 'Percorso di navigazione', 'Breadcrumb'])"><a routerLink="/documentation">{{ tr(['Dokumentation Datenkatalog', 'Documentation du catalogue', 'Documentazione del catalogo', 'Catalog documentation']) }}</a><span>›</span>@if (termId) { <a routerLink="/documentation/glossary">{{ tr(['DaCa Glossar', 'Glossaire DaCa', 'Glossario DaCa', 'DaCa glossary']) }}</a><span>›</span><span>{{ selected()?.term || tr(['Begriff', 'Terme', 'Termine', 'Term']) }}</span> } @else { <span>{{ tr(['DaCa Glossar', 'Glossaire DaCa', 'Glossario DaCa', 'DaCa glossary']) }}</span> }</nav>
    <section class="daca-page-heading"><div><p class="daca-eyebrow">Data Catalog</p><h1>{{ termId && selected() ? selected()!.term : tr(['DaCa Glossar', 'Glossaire DaCa', 'Glossario DaCa', 'DaCa glossary']) }}</h1><p>{{ tr(['Begriffe der DaCa-Anwendung und ihrer Rollen. Fachliche Terminologie wird separat verwaltet.', 'Termes propres à l’application DaCa et à ses rôles. La terminologie métier est gérée séparément.', 'Termini dell’applicazione DaCa e dei suoi ruoli. La terminologia di dominio è gestita separatamente.', 'Terms used by the DaCa application and its roles. Business terminology is managed separately.']) }}</p></div></section>
    @if (loading()) { <p class="glossary-state" aria-live="polite">{{ tr(['Glossar wird geladen …', 'Chargement du glossaire…', 'Caricamento del glossario…', 'Loading glossary…']) }}</p> }
    @else if (error()) { <p class="glossary-state is-error" role="alert">{{ error() }} <button type="button" (click)="load()">{{ tr(['Erneut laden', 'Réessayer', 'Riprova', 'Retry']) }}</button></p> }
    @else if (termId) {
      @if (selected(); as item) {
        <article class="glossary-detail"><dl>
          <div><dt>ID</dt><dd class="glossary-id">{{ item.id }}</dd></div>
          <div><dt>{{ tr(['Kürzel', 'Abréviation', 'Abbreviazione', 'Abbreviation']) }}</dt><dd>{{ item.abbreviation || '–' }}</dd></div>
          <div><dt>Term</dt><dd>{{ item.term }}</dd></div>
          <div><dt>{{ tr(['Kurzbeschreibung', 'Description courte', 'Descrizione breve', 'Short description']) }}</dt><dd>{{ item.shortDescription }}</dd></div>
          <div><dt>{{ tr(['Detaillierte Beschreibung', 'Description détaillée', 'Descrizione dettagliata', 'Detailed description']) }}</dt><dd>{{ item.detailedDescription }}</dd></div>
          <div><dt>isTERMDAT</dt><dd>{{ item.isTermdat ? tr(['Ja', 'Oui', 'Sì', 'Yes']) : tr(['Nein', 'Non', 'No', 'No']) }}</dd></div>
        </dl><a routerLink="/documentation/glossary">← {{ tr(['Zum Glossar', 'Retour au glossaire', 'Torna al glossario', 'Back to glossary']) }}</a></article>
      } @else { <p class="glossary-state">{{ tr(['Begriff nicht gefunden.', 'Terme introuvable.', 'Termine non trovato.', 'Term not found.']) }}</p> }
    } @else {
      <label class="glossary-search"><span>{{ tr(['Glossar durchsuchen', 'Rechercher dans le glossaire', 'Cerca nel glossario', 'Search glossary']) }}</span><input type="search" [value]="query()" (input)="query.set(($any($event.target)).value)" [placeholder]="tr(['Term, Kürzel oder Beschreibung', 'Terme, abréviation ou description', 'Termine, abbreviazione o descrizione', 'Term, abbreviation or description'])"></label>
      <div class="glossary-list">@for (item of filtered(); track item.id) {
        <a [routerLink]="['/documentation/glossary', item.id]"><span><strong>{{ item.term }}</strong>@if (item.abbreviation) { <small>{{ item.abbreviation }}</small> }</span><p>{{ item.shortDescription }}</p><span class="glossary-arrow">→</span></a>
      } @empty { <p class="glossary-state">{{ tr(['Keine passenden Begriffe.', 'Aucun terme correspondant.', 'Nessun termine corrispondente.', 'No matching terms.']) }}</p> }</div>
    }
  `,
  styles: [`
    .documentation-breadcrumb{display:flex;align-items:center;gap:10px;margin-bottom:20px;color:var(--daca-muted);font-size:.78rem}.documentation-breadcrumb a,.glossary-detail>a{color:var(--daca-blue)}.glossary-search{display:grid;max-width:500px;gap:8px;margin-bottom:20px;font-size:.78rem;font-weight:750}.glossary-search input{min-height:44px;border:1px solid var(--daca-border-strong);padding:9px 12px;background:var(--daca-surface);color:var(--daca-ink);font:inherit;font-weight:500}.glossary-list{display:grid;max-width:1050px;border-top:5px solid var(--daca-red)}.glossary-list>a{display:grid;grid-template-columns:minmax(180px,.35fr) 1fr auto;align-items:start;gap:16px;border:1px solid var(--daca-border);border-top:0;padding:16px 18px;background:var(--daca-surface);color:var(--daca-ink);text-decoration:none}.glossary-list>a:hover,.glossary-list>a:focus-visible{background:var(--daca-blue-soft)}.glossary-list strong{font-size:.9rem}.glossary-list small{display:block;margin-top:5px;color:var(--daca-muted)}.glossary-list p{margin:0;color:var(--daca-muted);font-size:.8rem;line-height:1.45}.glossary-arrow{color:var(--daca-blue);font-weight:800}.glossary-detail{max-width:950px;border:1px solid var(--daca-border);border-top:5px solid var(--daca-red);padding:26px;background:var(--daca-surface)}.glossary-detail dl{margin:0 0 25px}.glossary-detail dl div{display:grid;grid-template-columns:200px 1fr;gap:20px;border-bottom:1px solid var(--daca-border);padding:13px 0}.glossary-detail dt{color:var(--daca-muted);font-size:.78rem;font-weight:800}.glossary-detail dd{margin:0;line-height:1.5}.glossary-id{font-family:var(--daca-mono);font-size:.78rem;overflow-wrap:anywhere}.glossary-state{border:1px solid var(--daca-border);padding:22px;background:var(--daca-surface)}.glossary-state.is-error{border-left:4px solid var(--daca-red)}.glossary-state button{margin-left:10px;border:0;background:none;color:var(--daca-blue);text-decoration:underline;cursor:pointer}@media(max-width:700px){.glossary-list>a{grid-template-columns:1fr auto}.glossary-list p{grid-column:1/-1;grid-row:2}.glossary-detail dl div{grid-template-columns:1fr;gap:5px}}
  `],
})
export class DocumentationGlossaryComponent {
  private readonly api = inject(DocumentationApiService);
  private readonly preferences = inject(UserPreferencesService);
  private readonly route = inject(ActivatedRoute);
  readonly termId = this.route.snapshot.paramMap.get('termId');
  readonly terms = signal<DocumentationGlossaryTerm[]>([]);
  readonly selected = signal<DocumentationGlossaryTerm | null>(null);
  readonly query = signal('');
  readonly loading = signal(true);
  readonly error = signal('');
  readonly filtered = computed(() => { const q = this.query().trim().toLocaleLowerCase(); return q ? this.terms().filter((item) => [item.term, item.abbreviation || '', item.shortDescription].some((value) => value.toLocaleLowerCase().includes(q))) : this.terms(); });
  constructor() { effect(() => { this.preferences.language(); this.load(); }); }
  tr(copy: Copy): string { return copy[({ de: 0, fr: 1, it: 2, en: 3 })[this.preferences.language()]]; }
  load(): void {
    this.loading.set(true); this.error.set('');
    const request: Observable<DocumentationGlossaryTerm | DocumentationGlossaryTerm[]> = this.termId
      ? this.api.glossaryTerm(this.termId, this.preferences.language())
      : this.api.glossary(this.preferences.language());
    request.subscribe({
      next: (result) => { if (Array.isArray(result)) this.terms.set(result); else this.selected.set(result); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set(this.tr(['Glossar konnte nicht geladen werden.', 'Impossible de charger le glossaire.', 'Impossibile caricare il glossario.', 'Could not load glossary.'])); },
    });
  }
}
