import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DocumentationApiService, CatalogResponsibilityIndex, CatalogResponsibilityObject, CatalogResponsibilityPerson, ResponsibilityCategory, ResponsibilityRole } from '../../core/documentation-api.service';
import { UserPreferencesService } from '../../core/user-preferences.service';
import { RoleTermComponent } from '../documentation/glossary-word.component';

type Perspective = 'category' | 'person' | 'domain';
type Copy = readonly [string, string, string, string];
const ORDER: readonly ResponsibilityCategory[] = ['domain', 'logical_model', 'physical_representation', 'data_product'];

@Component({
  selector: 'daca-responsibility-perspectives',
  standalone: true,
  imports: [RouterLink, RoleTermComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="responsibility-view" aria-labelledby="perspectives-title">
      <div class="perspective-bar">
        <strong id="perspectives-title">{{ tr(['Perspektiven', 'Perspectives', 'Prospettive', 'Perspectives']) }}</strong>
        <div class="perspective-switch" role="group" [attr.aria-label]="tr(['Perspektiven', 'Perspectives', 'Prospettive', 'Perspectives'])">
          <button type="button" [class.is-active]="perspective() === 'category'" [attr.aria-pressed]="perspective() === 'category'" (click)="perspective.set('category')">{{ tr(['Kategorien', 'Catégories', 'Categorie', 'Categories']) }}</button>
          <button type="button" [class.is-active]="perspective() === 'person'" [attr.aria-pressed]="perspective() === 'person'" (click)="perspective.set('person')">{{ tr(['Personen', 'Personnes', 'Persone', 'People']) }}</button>
          <button type="button" [class.is-active]="perspective() === 'domain'" [attr.aria-pressed]="perspective() === 'domain'" (click)="perspective.set('domain')">{{ tr(['Domänen', 'Domaines', 'Domini', 'Domains']) }}</button>
        </div>
      </div>
      <p class="perspective-intro">{{ perspectiveDescription() }}</p>

      @if (loading()) { <div class="responsibility-state" aria-live="polite">{{ tr(['Zuständigkeiten werden geladen …', 'Chargement des responsabilités…', 'Caricamento delle responsabilità…', 'Loading responsibilities…']) }}</div> }
      @else if (error()) { <div class="responsibility-state is-error" role="alert">{{ error() }} <button type="button" (click)="load()">{{ tr(['Erneut laden', 'Réessayer', 'Riprova', 'Retry']) }}</button></div> }
      @else if (index(); as data) {
        @if (perspective() === 'category') {
          <div class="category-layout">
            <aside class="category-explorer" [attr.aria-label]="tr(['Datenobjekte', 'Objets de données', 'Oggetti dati', 'Data objects'])">
              <label class="search-label"><span class="daca-sr-only">{{ tr(['Datenobjekt suchen', 'Chercher un objet', 'Cerca un oggetto', 'Search object']) }}</span><input type="search" [value]="query()" (input)="query.set(inputValue($event))" [placeholder]="tr(['Datenobjekt suchen', 'Chercher un objet', 'Cerca un oggetto', 'Search object'])"></label>
              @for (category of categoryOrder; track category) {
                <details class="category-group" [open]="category === 'domain'"><summary>{{ categoryLabel(category) }} <span>{{ objectsInCategory(category).length }}</span></summary>
                  @for (item of objectsInCategory(category); track item.id) {
                    <button type="button" class="category-object" [class.is-active]="selectedObject()?.id === item.id" [attr.aria-current]="selectedObject()?.id === item.id ? 'true' : null" (click)="selectedObjectId.set(item.id)">{{ item.name }}</button>
                  } @empty { <p class="empty-group">{{ tr(['Keine Treffer', 'Aucun résultat', 'Nessun risultato', 'No results']) }}</p> }
                </details>
              }
            </aside>
            @if (selectedObject(); as item) {
              <article class="object-detail">
                <p class="daca-eyebrow">{{ categoryLabel(item.category) }}</p>
                <h2>{{ item.name }}</h2>
                <p class="object-description">{{ item.description || tr(['Keine Beschreibung hinterlegt.', 'Aucune description.', 'Nessuna descrizione.', 'No description.']) }}</p>
                <h3>{{ tr(['Zuständigkeiten', 'Responsabilités', 'Responsabilità', 'Responsibilities']) }}</h3>
                @if (item.responsibilities.length) {
                  <div class="table-scroll"><table><thead><tr><th>{{ tr(['Person', 'Personne', 'Persona', 'Person']) }}</th><th>{{ tr(['Rolle', 'Rôle', 'Ruolo', 'Role']) }}</th><th>{{ tr(['Umfang', 'Périmètre', 'Ambito', 'Scope']) }}</th></tr></thead><tbody>
                    @for (assignment of item.responsibilities; track assignment.userId + assignment.role) {
                      <tr><td>{{ personName(assignment.userId) }}</td><td><daca-role-term [role]="assignment.role" /></td><td>{{ basisLabel(assignment.basis) }}</td></tr>
                    }
                  </tbody></table></div>
                } @else { <p class="empty-group">{{ tr(['Keine persönliche Zuständigkeit hinterlegt.', 'Aucune responsabilité personnelle.', 'Nessuna responsabilità personale.', 'No personal responsibility recorded.']) }}</p> }
                <h3>{{ tr(['Zugeordnete Objekte', 'Objets associés', 'Oggetti associati', 'Related objects']) }}</h3>
                <div class="related-groups">
                  @for (category of relatedCategories(item); track category) {
                    <section><h4>{{ categoryLabel(category) }}</h4>
                      @for (related of relatedObjects(item, category); track related.id) { <a [routerLink]="related.href">{{ related.name }}</a> }
                    </section>
                  } @empty { <p class="empty-group">{{ tr(['Keine weiteren Objekte zugeordnet.', 'Aucun autre objet associé.', 'Nessun altro oggetto associato.', 'No related objects.']) }}</p> }
                </div>
                <a class="open-object" [routerLink]="item.href">{{ tr(['Datenobjekt öffnen', 'Ouvrir l’objet', 'Apri oggetto', 'Open data object']) }} →</a>
              </article>
            } @else { <div class="responsibility-state">{{ tr(['Wählen Sie ein Datenobjekt.', 'Choisissez un objet.', 'Selezionare un oggetto.', 'Choose a data object.']) }}</div> }
          </div>
        } @else if (perspective() === 'person') {
          <label class="search-label person-search"><span>{{ tr(['Person suchen', 'Chercher une personne', 'Cerca persona', 'Search person']) }}</span><input type="search" [value]="query()" (input)="query.set(inputValue($event))" [placeholder]="tr(['Name oder Organisation', 'Nom ou organisation', 'Nome o organizzazione', 'Name or organization'])"></label>
          <div class="table-scroll"><table class="people-matrix"><thead><tr><th>{{ tr(['Person', 'Personne', 'Persona', 'Person']) }}</th><th>{{ tr(['Rolle', 'Rôle', 'Ruolo', 'Role']) }}</th>
            @for (category of categoryOrder; track category) { <th>{{ categoryLabel(category) }}</th> }
          </tr></thead><tbody>
            @for (person of filteredPeople(); track person.id) {
              <tr [class.is-selected]="selectedPerson()?.id === person.id"><td><button type="button" class="person-select" (click)="selectedPersonId.set(person.id)">{{ person.name }}</button><small>{{ person.organization }}</small></td><td>
                @for (role of personRoles(person); track role) { <span class="role-chip"><daca-role-term [role]="role" /></span> }
              </td>
                @for (category of categoryOrder; track category) { <td>{{ personObjects(person.id, category).length || '–' }}</td> }
              </tr>
            } @empty { <tr><td colspan="6">{{ tr(['Keine Personen gefunden.', 'Aucune personne trouvée.', 'Nessuna persona trovata.', 'No people found.']) }}</td></tr> }
          </tbody></table></div>
          @if (selectedPerson(); as person) {
            <section class="person-detail"><h2>{{ person.name }}</h2><p>{{ person.organization }}</p>
              @for (category of categoryOrder; track category) {
                <div><h3>{{ categoryLabel(category) }}</h3>
                  @for (item of personObjects(person.id, category); track item.id) { <a [routerLink]="item.href">{{ item.name }}</a> }
                  @empty { <span>–</span> }
                </div>
              }
            </section>
          }
        } @else {
          <label class="search-label domain-search"><span>{{ tr(['Domäne suchen', 'Chercher un domaine', 'Cerca dominio', 'Search domain']) }}</span><input type="search" [value]="query()" (input)="query.set(inputValue($event))" [placeholder]="tr(['Domänenname', 'Nom du domaine', 'Nome del dominio', 'Domain name'])"></label>
          <div class="domain-list">
            @for (domain of filteredDomains(); track domain.id) {
              <section class="domain-section"><button type="button" class="domain-heading" [attr.aria-expanded]="selectedDomainId() === domain.id" (click)="selectedDomainId.set(selectedDomainId() === domain.id ? '' : domain.id)"><strong>{{ domain.name }}</strong><span>{{ domainObjects(domain.id).length }} {{ tr(['Objekte', 'objets', 'oggetti', 'objects']) }}</span></button>
                @if (selectedDomainId() === domain.id) {
                  <div class="domain-content"><div><h3>{{ tr(['Verantwortliche Personen', 'Personnes responsables', 'Persone responsabili', 'Responsible people']) }}</h3>
                    @for (assignment of domainPeople(domain.id); track assignment.userId + assignment.role) { <p><strong>{{ personName(assignment.userId) }}</strong> <daca-role-term [role]="assignment.role" /></p> }
                    @empty { <p class="empty-group">{{ tr(['Keine persönliche Zuständigkeit hinterlegt.', 'Aucune responsabilité personnelle.', 'Nessuna responsabilità personale.', 'No personal responsibility recorded.']) }}</p> }
                  </div><div><h3>{{ tr(['Zuständigkeit nach Objekttyp', 'Responsabilité par type d’objet', 'Responsabilità per tipo di oggetto', 'Responsibility by object type']) }}</h3>
                    @for (category of categoryOrder; track category) {
                      <div class="domain-object-group"><strong>{{ categoryLabel(category) }}</strong><div>
                        @for (item of domainObjects(domain.id, category); track item.id) {
                          <div class="domain-object-row"><a [routerLink]="item.href">{{ item.name }}</a>
                            @for (assignment of item.responsibilities; track assignment.userId + assignment.role) {
                              <span>{{ personName(assignment.userId) }} · <daca-role-term [role]="assignment.role" /></span>
                            } @empty { <span>{{ tr(['Keine Person hinterlegt', 'Aucune personne indiquée', 'Nessuna persona registrata', 'No person recorded']) }}</span> }
                          </div>
                        }
                        @empty { <span>–</span> }
                      </div></div>
                    }
                  </div></div>
                }
              </section>
            } @empty { <div class="responsibility-state">{{ tr(['Keine Domäne gefunden.', 'Aucun domaine trouvé.', 'Nessun dominio trovato.', 'No domain found.']) }}</div> }
          </div>
        }
      }
    </section>
  `,
  styleUrl: './responsibility-perspectives.component.css',
})
export class ResponsibilityPerspectivesComponent {
  private readonly api = inject(DocumentationApiService);
  readonly preferences = inject(UserPreferencesService);
  readonly categoryOrder = ORDER;
  readonly perspective = signal<Perspective>('category');
  readonly index = signal<CatalogResponsibilityIndex | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly query = signal('');
  readonly selectedObjectId = signal('');
  readonly selectedPersonId = signal('');
  readonly selectedDomainId = signal('');
  readonly filteredPeople = computed(() => this.index()?.people.filter((person) => this.matches([person.name, person.organization])) ?? []);
  readonly filteredDomains = computed(() => this.index()?.domains.filter((domain) => this.matches([domain.name])) ?? []);
  readonly selectedObject = computed(() => this.index()?.objects.find((item) => item.id === this.selectedObjectId()) ?? this.index()?.objects.find((item) => item.category === 'domain') ?? this.index()?.objects[0] ?? null);
  readonly selectedPerson = computed(() => this.index()?.people.find((person) => person.id === this.selectedPersonId()) ?? this.filteredPeople()[0] ?? null);
  readonly perspectiveDescription = computed(() => ({
    category: this.tr(['Wer darf welche Datenobjekte verwalten?', 'Qui peut gérer quels objets de données ?', 'Chi può gestire quali oggetti dati?', 'Who can manage which data objects?']),
    person: this.tr(['Zugriff und Verwaltungsrechte im Überblick', 'Vue d’ensemble des accès et responsabilités', 'Panoramica di accessi e responsabilità', 'Access and management rights at a glance']),
    domain: this.tr(['Von einer Domäne oder einem Datenobjekt zur zuständigen Person', 'Du domaine ou de l’objet à la personne responsable', 'Dal dominio o oggetto alla persona responsabile', 'From a domain or object to the responsible person']),
  })[this.perspective()]);

  constructor() { effect(() => { this.preferences.language(); this.load(); }); }
  load(): void {
    this.loading.set(true); this.error.set('');
    this.api.responsibilities(this.preferences.language()).subscribe({
      next: (data) => { this.index.set(data); this.loading.set(false); this.selectedDomainId.set(data.domains[0]?.id ?? ''); },
      error: () => { this.loading.set(false); this.error.set(this.tr(['Zuständigkeiten konnten nicht geladen werden.', 'Impossible de charger les responsabilités.', 'Impossibile caricare le responsabilità.', 'Could not load responsibilities.'])); },
    });
  }
  tr(copy: Copy): string { return copy[({ de: 0, fr: 1, it: 2, en: 3 })[this.preferences.language()]]; }
  inputValue(event: Event): string { return (event.target as HTMLInputElement).value; }
  matches(values: string[]): boolean { const needle = this.query().trim().toLocaleLowerCase(); return !needle || values.some((value) => value.toLocaleLowerCase().includes(needle)); }
  categoryLabel(category: ResponsibilityCategory): string {
    const labels: Record<ResponsibilityCategory, Copy> = {
      domain: ['Domänen', 'Domaines', 'Domini', 'Domains'],
      logical_model: ['Logische Modelle', 'Modèles logiques', 'Modelli logici', 'Logical models'],
      physical_representation: ['Physische Repräsentationen', 'Représentations physiques', 'Rappresentazioni fisiche', 'Physical representations'],
      data_product: ['Datenprodukte', 'Produits de données', 'Prodotti di dati', 'Data products'],
    };
    return this.tr(labels[category]);
  }
  objectsInCategory(category: ResponsibilityCategory): CatalogResponsibilityObject[] {
    return this.index()?.objects.filter((item) => item.category === category && this.matches([item.name, item.description])) ?? [];
  }
  personName(id: string): string { return this.index()?.people.find((person) => person.id === id)?.name ?? id; }
  personRoles(person: CatalogResponsibilityPerson): ResponsibilityRole[] {
    const roles = new Set<ResponsibilityRole>(person.roles.map((entry) => entry.role));
    for (const item of this.index()?.objects ?? []) for (const assignment of item.responsibilities) if (assignment.userId === person.id) roles.add(assignment.role);
    return [...roles];
  }
  personObjects(userId: string, category: ResponsibilityCategory): CatalogResponsibilityObject[] {
    return this.index()?.objects.filter((item) => item.category === category && item.responsibilities.some((row) => row.userId === userId)) ?? [];
  }
  domainObjects(domainId: string, category?: ResponsibilityCategory): CatalogResponsibilityObject[] {
    return this.index()?.objects.filter((item) => item.domainIds.includes(domainId) && (!category || item.category === category)) ?? [];
  }
  domainPeople(domainId: string): Array<{ userId: string; role: ResponsibilityRole }> {
    const rows = this.index()?.objects.find((item) => item.id === `domain:${domainId}`)?.responsibilities ?? [];
    return rows.map((row) => ({ userId: row.userId, role: row.role }));
  }
  relatedObjects(item: CatalogResponsibilityObject, category: ResponsibilityCategory): CatalogResponsibilityObject[] {
    return this.index()?.objects.filter((other) => other.id !== item.id && other.category === category && other.domainIds.some((id) => item.domainIds.includes(id))).slice(0, 5) ?? [];
  }
  relatedCategories(item: CatalogResponsibilityObject): ResponsibilityCategory[] { return ORDER.filter((category) => this.relatedObjects(item, category).length); }
  basisLabel(basis: string): string {
    if (basis === 'organization_scope') return this.tr(['Organisationsbereich', 'Périmètre organisationnel', 'Ambito organizzativo', 'Organization scope']);
    if (basis === 'explicit') return this.tr(['Direkte Zuordnung', 'Attribution directe', 'Assegnazione diretta', 'Direct assignment']);
    if (basis === 'model_creator_scope') return this.tr(['Modellerstellung', 'Création du modèle', 'Creazione del modello', 'Model creation']);
    return this.tr(['Objektverantwortung', 'Responsabilité de l’objet', 'Responsabilità dell’oggetto', 'Object responsibility']);
  }
}
