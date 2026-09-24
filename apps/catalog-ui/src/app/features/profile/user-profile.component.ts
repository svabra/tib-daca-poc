import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DemoIdentityService, ModelingRole } from '../../core/demo-identity.service';
import { DemoSessionService } from '../../core/demo-session.service';
import { CatalogLanguage, UserPreferencesService } from '../../core/user-preferences.service';

type Copy = readonly [string, string, string, string];
type Capability = { title: Copy; detail: Copy };

const MODEL_RIGHTS: Record<ModelingRole, Capability[]> = {
  data_owner: [
    { title: ['Modelle erstellen und bearbeiten', 'Créer et modifier des modèles', 'Creare e modificare modelli', 'Create and edit models'], detail: ['Im zugewiesenen Organisationsbereich, einschliesslich untergeordneter Stellen.', 'Dans le périmètre organisationnel attribué et ses unités subordonnées.', 'Nell’ambito organizzativo assegnato e nelle unità subordinate.', 'In the assigned organization and its subordinate units.'] },
    { title: ['Aus physischen Tabellen ableiten', 'Dériver de tables physiques', 'Derivare da tabelle fisiche', 'Derive from physical tables'], detail: ['Technische Entwürfe und Zuordnungen anlegen.', 'Créer des ébauches techniques et des correspondances.', 'Creare bozze tecniche e mappature.', 'Create technical drafts and mappings.'] },
    { title: ['Strukturmetadaten verwalten', 'Gérer les métadonnées structurelles', 'Gestire i metadati strutturali', 'Manage structural metadata'], detail: ['Quellen registrieren und Strukturimporte auslösen.', 'Enregistrer des sources et lancer des importations de structure.', 'Registrare fonti e avviare importazioni della struttura.', 'Register sources and run structure imports.'] },
    { title: ['Modelle veröffentlichen', 'Publier des modèles', 'Pubblicare modelli', 'Publish models'], detail: ['Nur wenn Sie für das konkrete Modell als Data Owner hinterlegt sind.', 'Seulement si vous êtes responsable du modèle concerné.', 'Solo se siete responsabili del modello specifico.', 'Only when you are the named Data Owner for the model.'] },
  ],
  deputy_data_owner: [
    { title: ['Modelle erstellen und bearbeiten', 'Créer et modifier des modèles', 'Creare e modificare modelli', 'Create and edit models'], detail: ['Im zugewiesenen Organisationsbereich, einschliesslich untergeordneter Stellen.', 'Dans le périmètre organisationnel attribué et ses unités subordonnées.', 'Nell’ambito organizzativo assegnato e nelle unità subordinate.', 'In the assigned organization and its subordinate units.'] },
    { title: ['Aus physischen Tabellen ableiten', 'Dériver de tables physiques', 'Derivare da tabelle fisiche', 'Derive from physical tables'], detail: ['Technische Entwürfe und Zuordnungen anlegen.', 'Créer des ébauches techniques et des correspondances.', 'Creare bozze tecniche e mappature.', 'Create technical drafts and mappings.'] },
    { title: ['Strukturmetadaten verwalten', 'Gérer les métadonnées structurelles', 'Gestire i metadati strutturali', 'Manage structural metadata'], detail: ['Quellen registrieren und Strukturimporte auslösen.', 'Enregistrer des sources et lancer des importations de structure.', 'Registrare fonti e avviare importazioni della struttura.', 'Register sources and run structure imports.'] },
    { title: ['Vertretungsweise veröffentlichen', 'Publier en suppléance', 'Pubblicare come sostituto', 'Publish as deputy'], detail: ['Nur für Modelle des ausdrücklich zugewiesenen Data Owners.', 'Seulement pour les modèles du responsable explicitement délégué.', 'Solo per i modelli del responsabile esplicitamente delegato.', 'Only for models of the explicitly delegated Data Owner.'] },
  ],
  data_steward: [
    { title: ['Modelle erstellen und bearbeiten', 'Créer et modifier des modèles', 'Creare e modificare modelli', 'Create and edit models'], detail: ['Im zugewiesenen Organisationsbereich, einschliesslich untergeordneter Stellen.', 'Dans le périmètre organisationnel attribué et ses unités subordonnées.', 'Nell’ambito organizzativo assegnato e nelle unità subordinate.', 'In the assigned organization and its subordinate units.'] },
    { title: ['Aus physischen Tabellen ableiten', 'Dériver de tables physiques', 'Derivare da tabelle fisiche', 'Derive from physical tables'], detail: ['Technische Entwürfe und Zuordnungen anlegen.', 'Créer des ébauches techniques et des correspondances.', 'Creare bozze tecniche e mappature.', 'Create technical drafts and mappings.'] },
    { title: ['Strukturmetadaten verwalten', 'Gérer les métadonnées structurelles', 'Gestire i metadati strutturali', 'Manage structural metadata'], detail: ['Quellen registrieren und Strukturimporte auslösen.', 'Enregistrer des sources et lancer des importations de structure.', 'Registrare fonti e avviare importazioni della struttura.', 'Register sources and run structure imports.'] },
    { title: ['Zur Prüfung einreichen', 'Soumettre à la validation', 'Inviare per la revisione', 'Submit for review'], detail: ['Entwürfe einreichen; die Veröffentlichung bleibt beim zuständigen Owner.', 'Soumettre des ébauches ; la publication relève du responsable.', 'Inviare bozze; la pubblicazione spetta al responsabile.', 'Submit drafts; publication remains with the responsible owner.'] },
  ],
};

const OTHER_RIGHTS: Record<string, Capability> = {
  data_owner: { title: ['Data Owner (Datenprodukt)', 'Responsable du produit de données', 'Responsabile del prodotto dati', 'Data product owner'], detail: ['Zugewiesene Datenprodukte und ihre Freigaben verwalten.', 'Gérer les produits de données attribués et leurs autorisations.', 'Gestire i prodotti dati assegnati e le autorizzazioni.', 'Manage assigned data products and their access grants.'] },
  data_consumer: { title: ['Data Consumer', 'Consommateur de données', 'Consumatore di dati', 'Data Consumer'], detail: ['Katalog durchsuchen, sichtbare Metadaten lesen und Zugriff beantragen.', 'Parcourir le catalogue, lire les métadonnées visibles et demander l’accès.', 'Esplorare il catalogo, leggere i metadati visibili e richiedere l’accesso.', 'Search the catalog, read visible metadata and request access.'] },
  data_analyst: { title: ['Data Analyst', 'Analyste de données', 'Analista dei dati', 'Data Analyst'], detail: ['Freigegebene Datenprodukte untersuchen und ihre Nutzungsinformationen einsehen.', 'Explorer les produits autorisés et leurs informations d’utilisation.', 'Esaminare i prodotti autorizzati e le informazioni d’uso.', 'Explore authorized data products and their usage information.'] },
  domain_register_owner: { title: ['Domänenregister-Verantwortung', 'Responsable du registre des domaines', 'Responsabile del registro dei domini', 'Domain register owner'], detail: ['Domänenregister und Zuordnungen im eigenen Aufgabenbereich verwalten.', 'Gérer le registre des domaines et ses attributions dans son périmètre.', 'Gestire il registro dei domini e le assegnazioni nel proprio ambito.', 'Manage the domain register and assignments within your remit.'] },
  publication_approver: { title: ['Publikationsprüfung', 'Approbation de publication', 'Approvazione della pubblicazione', 'Publication approver'], detail: ['Zugewiesene Publikationsanträge prüfen.', 'Examiner les demandes de publication attribuées.', 'Esaminare le richieste di pubblicazione assegnate.', 'Review assigned publication requests.'] },
};

const ROLE_LABELS: Record<ModelingRole, Copy> = {
  data_owner: ['Data Owner', 'Responsable des données', 'Responsabile dei dati', 'Data Owner'],
  deputy_data_owner: ['Stellvertretende Data Owner', 'Suppléance du responsable des données', 'Sostituto responsabile dei dati', 'Deputy Data Owner'],
  data_steward: ['Data Steward', 'Gestionnaire des données', 'Gestore dei dati', 'Data Steward'],
};

@Component({
  selector: 'daca-user-profile',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="daca-page-heading"><div><p class="daca-eyebrow">{{ tr(['Benutzerkonto', 'Compte utilisateur', 'Account utente', 'User account']) }}</p><h1>{{ tr(['Mein Profil', 'Mon profil', 'Il mio profilo', 'My profile']) }}</h1><p>{{ tr(['Ihre Organisationszugehörigkeit, Rollen und Berechtigungen in DaCa.', 'Votre organisation, vos rôles et vos droits dans DaCa.', 'La vostra organizzazione, i ruoli e le autorizzazioni in DaCa.', 'Your organization, roles and permissions in DaCa.']) }}</p></div></section>
    <section class="daca-card profile-identity" aria-labelledby="profile-name">
      @if (identity.user().avatarUrl; as avatar) { <img class="profile-portrait" [src]="avatar" [alt]="identity.user().displayName"> } @else { <span class="profile-portrait is-fallback" aria-hidden="true">{{ identity.user().displayName.slice(0, 1) }}</span> }
      <div><h2 id="profile-name">{{ identity.user().displayName }}</h2><p>{{ primaryOrganization() }}</p><a [href]="'mailto:' + identity.user().email">{{ identity.user().email }}</a></div>
      <button class="daca-button is-secondary profile-logout" type="button" [disabled]="session.busy()" (click)="session.logout()">{{ tr(['Abmelden', 'Déconnexion', 'Disconnetti', 'Sign out']) }}</button>
    </section>
    <section class="profile-section" aria-labelledby="organization-title"><h2 id="organization-title">{{ tr(['Organisation und Modellierungsrollen', 'Organisation et rôles de modélisation', 'Organizzazione e ruoli di modellazione', 'Organization and modeling roles']) }}</h2>
      @if (!identity.modelingAssignmentsAvailable()) { <p class="daca-alert is-error" role="alert">{{ tr(['Die aktuellen Modellierungsrollen konnten nicht geladen werden.', 'Impossible de charger les rôles de modélisation actuels.', 'Impossibile caricare i ruoli di modellazione attuali.', 'Current modeling roles could not be loaded.']) }}</p> }
      @else if (identity.user().modelingAssignments?.length) {
        <p class="profile-hint">{{ tr(['Berechtigungen gelten für die angegebene Organisation und ihre untergeordneten Stellen. Eine Veröffentlichung erfordert zusätzlich die persönliche Owner-Zuordnung zum Modell.', 'Les droits s’appliquent à l’organisation indiquée et à ses unités subordonnées. La publication nécessite aussi une attribution personnelle au modèle.', 'Le autorizzazioni valgono per l’organizzazione indicata e le unità subordinate. Per pubblicare serve anche l’assegnazione personale al modello.', 'Permissions apply to the named organization and its subordinate units. Publishing also requires a personal owner assignment on the model.']) }}</p>
        <div class="profile-role-grid">@for (assignment of identity.user().modelingAssignments; track assignment.id) {
          <article class="daca-card profile-role"><p class="daca-eyebrow">{{ assignment.departmentCode }}</p><h3>{{ assignment.organizationName }}</h3><p class="profile-role-name">{{ roleLabel(assignment.role) }}</p>
            @if (assignment.delegatedOwnerUserId) { <p>{{ tr(['Stellvertretung für', 'Suppléance de', 'Sostituto di', 'Deputy for']) }} {{ ownerName(assignment.delegatedOwnerUserId) }}</p> }
            <ul>@for (right of modelRights(assignment.role); track right.title[0]) { <li><strong>{{ tr(right.title) }}</strong><span>{{ tr(right.detail) }}</span></li> }</ul>
          </article>
        }</div>
      } @else { <p class="daca-card profile-empty">{{ tr(['Keine aktive Modellierungsrolle zugewiesen.', 'Aucun rôle de modélisation actif attribué.', 'Nessun ruolo di modellazione attivo assegnato.', 'No active modeling role assigned.']) }}</p> }
    </section>
    <section class="profile-section" aria-labelledby="other-roles-title"><h2 id="other-roles-title">{{ tr(['Weitere Rollen', 'Autres rôles', 'Altri ruoli', 'Other roles']) }}</h2>
      <div class="profile-role-grid">@for (role of otherRoles(); track role) { <article class="daca-card profile-other-role"><h3>{{ otherRoleTitle(role) }}</h3>@if (otherRoleDetail(role); as detail) { <p>{{ detail }}</p> }</article> } @empty { <p>{{ tr(['Keine weiteren Rollen hinterlegt.', 'Aucun autre rôle enregistré.', 'Nessun altro ruolo registrato.', 'No other roles recorded.']) }}</p> }</div>
    </section>
    <p class="profile-actions"><a class="daca-button is-secondary" routerLink="/models">{{ tr(['Datenmodelle öffnen', 'Ouvrir les modèles', 'Apri i modelli', 'Open data models']) }}</a><a class="daca-button is-secondary" routerLink="/physical-models">{{ tr(['Datenquellen öffnen', 'Ouvrir les sources', 'Apri le fonti dati', 'Open data sources']) }}</a></p>
  `,
  styles: [`
    .profile-identity{display:flex;align-items:center;gap:1.4rem;padding:1.5rem;border-top:5px solid var(--daca-blue);box-shadow:none}.profile-identity h2{margin:0;font-size:1.55rem}.profile-identity p{margin:.2rem 0;color:var(--daca-muted)}.profile-identity a{color:var(--daca-blue)}.profile-logout{margin-left:auto;flex:none}.profile-portrait{width:88px;height:88px;flex:none;border-radius:50%;object-fit:cover}.profile-portrait.is-fallback{display:grid;place-items:center;background:var(--daca-blue);color:#fff;font-size:2.4rem}.profile-section{margin-top:2rem}.profile-section h2{font-size:1.35rem}.profile-hint{max-width:82ch;color:var(--daca-muted)}.profile-role-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:1rem}.profile-role,.profile-other-role{padding:1.3rem;border-top:4px solid var(--daca-blue);box-shadow:none}.profile-role h3,.profile-other-role h3{margin:.15rem 0;font-size:1.1rem}.profile-role-name{margin:.65rem 0;font-weight:800}.profile-role ul{display:grid;gap:.8rem;margin:1rem 0 0;padding-left:1.2rem}.profile-role li strong,.profile-role li span{display:block}.profile-role li span,.profile-other-role p{color:var(--daca-muted);font-size:.86rem}.profile-empty{padding:1.5rem}.profile-actions{display:flex;flex-wrap:wrap;gap:.6rem;margin-top:2rem}@media(max-width:550px){.profile-identity{align-items:flex-start;flex-direction:column}.profile-logout{margin-left:0}}
  `],
})
export class UserProfileComponent {
  readonly identity = inject(DemoIdentityService);
  readonly session = inject(DemoSessionService);
  private readonly preferences = inject(UserPreferencesService);
  readonly otherRoles = computed(() => this.identity.user().roles.filter((role) => !(this.identity.user().modelingAssignments ?? []).some((assignment) => assignment.role === role)));
  readonly primaryOrganization = computed(() => {
    const assignments = this.identity.user().modelingAssignments ?? [];
    return assignments.find((assignment) => assignment.organizationId === assignment.primaryOrganizationId)?.organizationName ?? this.identity.user().organization;
  });
  tr(copy: Copy): string { return copy[({ de: 0, fr: 1, it: 2, en: 3 } satisfies Record<CatalogLanguage, number>)[this.preferences.language()]]; }
  roleLabel(role: ModelingRole): string { return this.tr(ROLE_LABELS[role]); }
  modelRights(role: ModelingRole): Capability[] { return MODEL_RIGHTS[role]; }
  otherRoleTitle(role: string): string { return OTHER_RIGHTS[role] ? this.tr(OTHER_RIGHTS[role].title) : role; }
  otherRoleDetail(role: string): string { return OTHER_RIGHTS[role] ? this.tr(OTHER_RIGHTS[role].detail) : ''; }
  ownerName(userId: string): string { return this.identity.users().find((user) => user.id === userId)?.displayName ?? userId; }
}
