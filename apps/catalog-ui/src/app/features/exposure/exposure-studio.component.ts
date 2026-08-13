import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DacaGlossaryTermComponent, StatusBadgeComponent } from '@bit-daca/design-system';
import { Subscription } from 'rxjs';
import { CatalogApiService, PolicyWire } from '../../core/catalog-api.service';
import {
  AdministrativeOrganization,
  IdentityDirectoryEntry,
  IdentityDirectorySource,
  IdentityGroupDetail,
  IdentityGroupSummary,
  PolicyDefinition,
} from '../../core/catalog.models';
import { ProductWorkspaceNavComponent } from '../../shared/product-workspace-nav.component';
import {
  INITIAL_EXPOSURE_DRAFT,
  exposureDurationDays,
  exposureUtcDay,
  isExposureDateRangeValid,
  isExposurePublishable,
  isExposureSubjectIdValid,
} from './exposure-draft';

type SubjectType = 'person' | 'machine' | 'group';
type PublicationState = 'draft' | 'activating' | 'active';
const DIRECTORY_SEARCH_DEBOUNCE_MS = 250;

@Component({
  selector: 'daca-exposure-studio',
  standalone: true,
  imports: [ProductWorkspaceNavComponent, RouterLink, StatusBadgeComponent, DacaGlossaryTermComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <daca-product-workspace-nav
      [productId]="product().id"
      [productTitle]="product().title"
      activeSection="access"
      accessView="grant"
    />

    <section class="daca-page-heading exposure-heading">
      <div>
        <p class="daca-eyebrow">Zugriff · Neue Einstellung</p>
        <h1>Zugriffseinstellung erstellen</h1>
        <p>Wählen Sie genau eine vertrauenswürdige Person, Machine ID oder Gruppe und bestimmen Sie Zeitraum sowie Metadatenkanäle.</p>
      </div>
      <daca-status-badge [tone]="publicationState() === 'active' ? 'green' : publicationState() === 'activating' ? 'orange' : 'orange'">
        {{ publicationState() === 'active' ? 'Zugriffseinstellung aktiv' : publicationState() === 'activating' ? 'Aktivierung läuft' : 'Entwurf' }}
      </daca-status-badge>
    </section>

    <section class="daca-card exposure-product" aria-labelledby="exposure-product-title">
      <div class="exposure-product-mark" aria-hidden="true">ESTV</div>
      <div class="exposure-product-copy">
        <span>Ausgewähltes Datenprodukt</span>
        <h2 id="exposure-product-title">{{ product().title }}</h2>
        <small>Eigentümerin: {{ product().owner }} · <span class="daca-code">{{ product().globalId }}</span></small>
      </div>
      <daca-status-badge tone="red">Eingeschränkt</daca-status-badge>
      <a [routerLink]="['/products', product().id, 'metadata']">Metadaten ansehen</a>
    </section>

    <div class="exposure-layout">
      <form id="exposure-form" class="daca-card exposure-form" (submit)="$event.preventDefault(); activate()">
        <section class="exposure-rule-section" aria-labelledby="audience-title">
          <div class="exposure-section-heading">
            <div><p class="daca-eyebrow">Schritt 1</p><h2 id="audience-title">Wer darf die Daten nutzen?</h2></div>
            <span>{{ subjectTypeLabel() }}</span>
          </div>

          <div class="exposure-subject-choice is-three" role="radiogroup" aria-label="Art des Zugriffsziels">
            <label [class.is-selected]="subjectType() === 'person'">
              <input type="radio" name="exposure-subject-type" value="person" [checked]="subjectType() === 'person'" (change)="setSubjectType('person')">
              <span><strong>Persönlicher Zugriff</strong><small>Eine Person greift mit ihrer eigenen eIAM-Identität zu.</small></span><b>eIAM</b>
            </label>
            <label [class.is-selected]="subjectType() === 'machine'">
              <input type="radio" name="exposure-subject-type" value="machine" [checked]="subjectType() === 'machine'" (change)="setSubjectType('machine')">
              <span><strong>Maschinenzugriff</strong><small>Ein technischer Client greift Machine-to-Machine zu.</small></span><b>M2M</b>
            </label>
            <label [class.is-selected]="subjectType() === 'group'">
              <input type="radio" name="exposure-subject-type" value="group" [checked]="subjectType() === 'group'" (change)="setSubjectType('group')">
              <span><strong>Gruppenzugriff</strong><small>Eine vertrauenswürdige Personengruppe erhält Zugriff.</small></span><b>Gruppe</b>
            </label>
          </div>

          @if (subjectType() === 'person') {
            <div class="exposure-directory-panel">
              <div class="exposure-directory-fields is-person">
                <label for="person-search">Person suchen
                  <input id="person-search" type="search" [value]="personQuery()" (input)="onPersonQuery($any($event.target).value)" (keydown.enter)="$event.preventDefault(); searchPeople()" placeholder="Name, Organisation, E-Mail oder eIAM-ID" autocomplete="off">
                </label>
                <label for="person-source">Quelle
                  <select id="person-source" [value]="personSource()" (change)="setPersonSource($any($event.target).value)">
                    <option value="">Alle Verzeichnisse</option>
                    <option value="federal">Bund</option>
                    <option value="cantonal">Kantone</option>
                    <option value="municipal">Gemeinden</option>
                    <option value="federal_related">Bundesnahe Betriebe</option>
                  </select>
                </label>
                <label for="person-organization">Departement / Amt
                  <select id="person-organization" [value]="personOrganizationId()" (change)="setPersonOrganization($any($event.target).value)">
                    <option value="">Alle Departemente und Ämter</option>
                    @for (organization of organizations(); track organization.id) {
                      <option [value]="organization.id">{{ organization.label }} · {{ organization.displayName }}</option>
                    }
                  </select>
                </label>
                <button class="daca-button is-secondary" type="button" (click)="searchPeople()">Suchen</button>
              </div>
              <p class="exposure-help">Die Trefferliste aktualisiert sich während der Eingabe. Erst die bewusste Auswahl eines Suchresultats erzeugt ein gültiges Zugriffsziel.</p>
              @if (directoryLoading()) { <p class="exposure-directory-state" role="status">Verzeichnis wird durchsucht …</p> }
              @else if (directoryError()) { <p class="daca-alert is-error" role="alert">{{ directoryError() }}</p> }
              @else if (!people().length) { <p class="exposure-directory-state">Keine passenden aktiven Personen gefunden.</p> }
              @else {
                <div class="exposure-directory-results" role="listbox" aria-label="Gefundene Personen">
                  @for (person of people(); track person.id) {
                    <button type="button" role="option" [attr.aria-selected]="selectedPerson()?.id === person.id" [class.is-selected]="selectedPerson()?.id === person.id" (click)="selectPerson(person)">
                      <span><strong>{{ person.displayName }}</strong><small>{{ person.organization }} · {{ person.email }}</small></span>
                      <span><code>{{ person.id }}</code><small>{{ sourceLabel(person.source) }} · {{ person.sourceSystem }}</small></span>
                    </button>
                  }
                </div>
              }
            </div>
          } @else if (subjectType() === 'machine') {
            <div class="exposure-subject-id" [class.is-invalid]="!subjectValid()">
              <label for="exposure-machine-id"><span>Machine ID *</span><input id="exposure-machine-id" [value]="machineIdentity()" (input)="setMachineIdentity($any($event.target).value)" placeholder="z. B. svc-estv-tax-analysis" autocomplete="off"></label>
              <p>Nur die technische Identität angeben – keine Passwörter, Tokens oder Secret-Referenzen.</p>
              @if (!subjectValid()) { <strong role="alert">Eine gültige Machine ID ist erforderlich.</strong> }
            </div>
          } @else {
            <div class="exposure-directory-panel">
              <div class="exposure-directory-fields">
                <label for="group-search">Vertrauenswürdige Gruppe suchen
                  <input id="group-search" type="search" [value]="groupQuery()" (input)="onGroupQuery($any($event.target).value)" (keydown.enter)="$event.preventDefault(); searchGroups()" placeholder="z. B. Kanton Neuchâtel" autocomplete="off">
                </label>
                <label for="group-source">Quelle
                  <select id="group-source" [value]="groupSource()" (change)="setGroupSource($any($event.target).value)">
                    <option value="">Alle Verzeichnisse</option>
                    <option value="federal">Bund</option><option value="cantonal">Kantone</option><option value="municipal">Gemeinden</option><option value="federal_related">Bundesnahe Betriebe</option>
                  </select>
                </label>
                <button class="daca-button is-secondary" type="button" (click)="searchGroups()">Suchen</button>
              </div>
              @if (directoryLoading()) { <p class="exposure-directory-state" role="status">Gruppen werden durchsucht …</p> }
              @else if (directoryError()) { <p class="daca-alert is-error" role="alert">{{ directoryError() }}</p> }
              @else if (!groups().length) { <p class="exposure-directory-state">Keine passende aktive Gruppe gefunden.</p> }
              @else {
                <div class="exposure-directory-results" role="listbox" aria-label="Gefundene Gruppen">
                  @for (group of groups(); track group.id) {
                    <button type="button" role="option" [attr.aria-selected]="selectedGroup()?.id === group.id" [class.is-selected]="selectedGroup()?.id === group.id" (click)="selectGroup(group)">
                      <span><strong>{{ group.label }}</strong><small>{{ group.description }}</small></span>
                      <span><strong>{{ group.memberCount }} Mitglieder</strong><small>{{ group.userManaged ? 'Eigene Gruppe' : sourceLabel(group.source) }} · Revision {{ group.membershipRevision }}</small></span>
                    </button>
                  }
                </div>
              }
              @if (selectedGroupDetail(); as detail) {
                <details class="exposure-member-preview">
                  <summary>Mitgliedervorschau ({{ detail.members.length }})</summary>
                  <ul>@for (member of detail.members; track member.id) { <li><strong>{{ member.displayName }}</strong><span>{{ member.organization }} · <code>{{ member.id }}</code></span></li> }</ul>
                </details>
              }
              <button class="daca-button is-secondary exposure-group-create-toggle" type="button" (click)="toggleGroupBuilder()">
                {{ groupBuilderOpen() ? 'Gruppenerstellung schliessen' : 'Eigene Gruppe erstellen' }}
              </button>
              @if (groupBuilderOpen()) {
                <section class="exposure-group-builder" aria-labelledby="group-builder-title">
                  <div><p class="daca-eyebrow">Eigene Gruppe</p><h3 id="group-builder-title">Identitäten zusammenfassen</h3></div>
                  <div class="exposure-group-builder-fields">
                    <label>Gruppenname *<input [value]="newGroupLabel()" (input)="newGroupLabel.set($any($event.target).value)" placeholder="z. B. BFS Datenanalyse"></label>
                    <label>Beschreibung *<input [value]="newGroupDescription()" (input)="newGroupDescription.set($any($event.target).value)" placeholder="Zweck und verantwortlicher Personenkreis"></label>
                  </div>
                  <label class="exposure-member-search">Mitglieder suchen
                    <input type="search" [value]="groupMemberQuery()" (input)="groupMemberQuery.set($any($event.target).value)" placeholder="Name, Organisation oder eIAM-ID" autocomplete="off">
                  </label>
                  <div class="exposure-member-picker" aria-label="Gruppenmitglieder auswählen">
                    @for (person of filteredGroupMemberCandidates(); track person.id) {
                      <label>
                        <input type="checkbox" [checked]="newGroupMemberIds().includes(person.id)" (change)="toggleGroupMember(person.id)">
                        <span><strong>{{ person.displayName }}</strong><small>{{ person.organization }} · {{ sourceLabel(person.source) }}</small></span>
                      </label>
                    }
                  </div>
                  <div class="exposure-group-builder-actions">
                    <span>{{ newGroupMemberIds().length }} Identitäten ausgewählt</span>
                    <button class="daca-button" type="button" [disabled]="!canCreateGroup() || groupCreating()" (click)="createGroup()">{{ groupCreating() ? 'Gruppe wird erstellt …' : 'Gruppe erstellen und auswählen' }}</button>
                  </div>
                  @if (groupCreateError()) { <p class="daca-alert is-error" role="alert">{{ groupCreateError() }}</p> }
                </section>
              }
              <p class="exposure-help">Bei der Aktivierung speichert DaCa einen serverseitigen Snapshot. Spätere Gruppenänderungen erweitern diesen Zugriff nicht automatisch.</p>
            </div>
          }
        </section>

        <section class="exposure-rule-section" aria-labelledby="period-title">
          <div class="exposure-section-heading"><div><p class="daca-eyebrow">Schritt 2</p><h2 id="period-title">Wie lange gilt die Zugriffseinstellung?</h2></div>@if (dateValid()) { <span>{{ durationDays() }} Kalendertage</span> }</div>
          <div class="exposure-period-grid">
            <label>Gültig ab *<input type="date" [value]="startDate()" (input)="setStartDate($any($event.target).value)"></label>
            <label>Gültig bis *<input type="date" [value]="endDate()" [min]="startDate()" (input)="setEndDate($any($event.target).value)"></label>
            <div class="exposure-timezone"><span>Zeitzone</span><strong>Europe/Zurich</strong><small>MEZ / MESZ</small></div>
          </div>
          @if (!dateValid()) { <p class="daca-alert is-error" role="alert">Das Enddatum muss am oder nach dem Startdatum liegen.</p> }
          @else { <p class="exposure-help">Vor Beginn und nach Ablauf werden Datenzugriff sowie gewählte Metadatenkanäle automatisch unwirksam.</p> }
        </section>

        <section id="koby" class="exposure-rule-section" aria-labelledby="metadata-channels-title">
          <div class="exposure-section-heading"><div><p class="daca-eyebrow">Schritt 3 · Explizite Opt-ins</p><h2 id="metadata-channels-title">Metadaten bereitstellen</h2></div><span>{{ metadataChannelCount() }} von 2 gewählt</span></div>
          <div class="exposure-channel-grid">
            <label class="exposure-koby-consent" [class.is-selected]="kobyAllowed()">
              <input type="checkbox" role="switch" [checked]="kobyAllowed()" (change)="setKobyAllowed($any($event.target).checked)">
              <span><strong>KOBY den Metadatenzugriff über <daca-glossary-term term="MCP" /> erlauben</strong><small>Titel, Schema, Qualität, Lineage und Provenienz – keine Produktdaten oder Secrets.</small></span><b>MCP</b>
            </label>
            <label class="exposure-koby-consent" [class.is-selected]="i14yAllowed()">
              <input type="checkbox" role="switch" [checked]="i14yAllowed()" (change)="setI14yAllowed($any($event.target).checked)">
              <span><strong>Metadaten und künftige Aktualisierungen an <daca-glossary-term term="I14Y" /> liefern</strong><small>Lokale PoC-Simulation: Beschreibung von Datensätzen und APIs, keine Produktdaten; kein externer Netzwerkaufruf.</small></span><b>I14Y</b>
            </label>
          </div>
          <p class="exposure-help">Beide Kanäle sind voneinander unabhängig und gelten exakt im Zeitraum dieser Zugriffseinstellung. MCP und I14Y sind keine Produktauslieferungsprotokolle.</p>
        </section>
      </form>

      <aside class="daca-card exposure-review" aria-labelledby="review-title">
        <div class="daca-card-header"><div><p class="daca-eyebrow">Live-Vorschau</p><h2 id="review-title">Zugriffseinstellung prüfen</h2></div><daca-status-badge [tone]="canActivate() ? 'blue' : 'red'">{{ canActivate() ? 'Vollständig' : 'Unvollständig' }}</daca-status-badge></div>
        <div class="daca-card-body">
          <div class="exposure-policy-sentence" [class.is-blocked]="!canActivate()">
            <span>{{ canActivate() ? 'ALLOW' : 'DENY' }}</span>
            @if (canActivate()) { <p><strong>{{ subjectSummary() }}</strong> darf dieses Datenprodukt vom <strong>{{ formatDate(startDate()) }}</strong> bis <strong>{{ formatDate(endDate()) }}</strong> über {{ protocolLabel() }} lesen.</p> }
            @else { <p>Ohne ein explizit ausgewähltes, gültiges Zugriffsziel und einen gültigen Zeitraum bleibt das Datenprodukt gesperrt.</p> }
          </div>
          <dl class="exposure-review-list">
            <div><dt>Zugriffstyp</dt><dd>{{ subjectTypeLabel() }}</dd></div>
            <div><dt>Zugriffsziel</dt><dd><code>{{ subjectId() || 'Fehlt' }}</code></dd></div>
            @if (subjectType() === 'group') { <div><dt>Snapshot</dt><dd>{{ selectedGroup()?.memberCount ?? 0 }} Personen · Rev. {{ selectedGroup()?.membershipRevision ?? '–' }}</dd></div> }
            <div><dt>Berechtigung</dt><dd><code>data.read</code></dd></div>
            <div><dt>Zugriffswege</dt><dd>{{ protocolLabel() }}</dd></div>
            <div><dt>Gültigkeit</dt><dd>{{ dateValid() ? durationDays() + ' Tage' : 'Ungültig' }}</dd></div>
            <div><dt>KOBY / MCP</dt><dd [class.is-positive]="kobyAllowed()">{{ kobyAllowed() ? 'Metadaten erlaubt' : 'Nicht erlaubt' }}</dd></div>
            <div><dt>I14Y</dt><dd [class.is-positive]="i14yAllowed()">{{ i14yAllowed() ? 'Lieferung simuliert' : 'Nicht liefern' }}</dd></div>
          </dl>
          <div class="exposure-guardrail"><strong>Default deny bleibt aktiv</strong><p>Alle anderen Identitäten, Zeitpunkte und Nutzungsarten werden abgewiesen. Aktiv wird die Einstellung erst, wenn OPA und PostgreSQL dieselbe Revision bestätigen.</p></div>
          @if (publicationState() === 'activating') { <p class="daca-alert" role="status">Die Policy wurde publiziert. DaCa wartet auf die gemeinsame Bestätigung von OPA und PostgreSQL.</p> }
          @if (publicationState() === 'active') { <p class="daca-alert exposure-success" role="status">Zugriffseinstellung seit {{ activatedAt() }} Uhr aktiv. OPA und PostgreSQL verwenden dieselbe Revision.</p> }
          @if (publicationError()) { <p class="daca-alert is-error" role="alert">{{ publicationError() }}</p> }
          <button class="daca-button exposure-primary-action" form="exposure-form" type="submit" [disabled]="!canActivate() || publicationState() === 'activating'">Zugriffseinstellung aktivieren</button>
          <button class="daca-button is-secondary exposure-secondary-action" type="button" (click)="resetDraft()">Entwurf zurücksetzen</button>
          <small class="exposure-demo-note">Strukturierte PBAC-Definition · Gruppensnapshot und Rego werden serverseitig erzeugt</small>
        </div>
      </aside>
    </div>
  `,
})
export class ExposureStudioComponent implements OnDestroy {
  readonly api = inject(CatalogApiService);
  private readonly route = inject(ActivatedRoute);
  readonly product = this.api.product;
  readonly subjectType = signal<SubjectType>(INITIAL_EXPOSURE_DRAFT.subjectType);
  readonly machineIdentity = signal('');
  readonly selectedPerson = signal<IdentityDirectoryEntry | null>(null);
  readonly selectedGroup = signal<IdentityGroupSummary | null>(null);
  readonly selectedGroupDetail = signal<IdentityGroupDetail | null>(null);
  readonly personQuery = signal('');
  readonly personSource = signal<IdentityDirectorySource | ''>('');
  readonly personOrganizationId = signal('');
  readonly organizations = signal<readonly AdministrativeOrganization[]>([]);
  readonly groupQuery = signal('');
  readonly groupSource = signal<IdentityDirectorySource | ''>('');
  readonly people = signal<readonly IdentityDirectoryEntry[]>([]);
  readonly groups = signal<readonly IdentityGroupSummary[]>([]);
  readonly directoryLoading = signal(false);
  readonly directoryError = signal<string | null>(null);
  readonly groupBuilderOpen = signal(false);
  readonly newGroupLabel = signal('');
  readonly newGroupDescription = signal('');
  readonly groupMemberQuery = signal('');
  readonly groupMemberCandidates = signal<readonly IdentityDirectoryEntry[]>([]);
  readonly newGroupMemberIds = signal<readonly string[]>([]);
  readonly groupCreating = signal(false);
  readonly groupCreateError = signal<string | null>(null);
  readonly startDate = signal(INITIAL_EXPOSURE_DRAFT.validFrom);
  readonly endDate = signal(INITIAL_EXPOSURE_DRAFT.validUntil);
  readonly kobyAllowed = signal(INITIAL_EXPOSURE_DRAFT.kobyMetadataAllowed);
  readonly i14yAllowed = signal(INITIAL_EXPOSURE_DRAFT.i14yMetadataDelivery);
  readonly publicationState = signal<PublicationState>('draft');
  readonly activatedAt = signal('');
  readonly publicationError = signal<string | null>(null);

  private personSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private groupSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private personSearchSubscription: Subscription | null = null;
  private groupSearchSubscription: Subscription | null = null;

  readonly subjectId = computed(() => this.subjectType() === 'person'
    ? this.selectedPerson()?.id ?? ''
    : this.subjectType() === 'group'
      ? this.selectedGroup()?.id ?? ''
      : this.machineIdentity().trim());
  readonly subjectValid = computed(() => isExposureSubjectIdValid(this.subjectId()));
  readonly subjectTypeLabel = computed(() => this.subjectType() === 'person' ? 'Persönlich · eIAM' : this.subjectType() === 'machine' ? 'Maschine · M2M' : 'Gruppenzugriff');
  readonly subjectSummary = computed(() => this.subjectType() === 'person'
    ? `${this.selectedPerson()?.displayName ?? 'Keine Person'} · ${this.selectedPerson()?.organization ?? ''}`
    : this.subjectType() === 'group'
      ? `Die Gruppe ${this.selectedGroup()?.label ?? ''}`
      : `Die Machine ID ${this.subjectId()}`);
  readonly dateValid = computed(() => isExposureDateRangeValid(this.startDate(), this.endDate()));
  readonly durationDays = computed(() => exposureDurationDays(this.startDate(), this.endDate()));
  readonly metadataChannelCount = computed(() => Number(this.kobyAllowed()) + Number(this.i14yAllowed()));
  readonly protocols = computed<('http' | 'postgresql')[]>(() => {
    const values = new Set<'http' | 'postgresql'>();
    for (const endpoint of this.product().endpoints) values.add(endpoint.protocol === 'http-rest' ? 'http' : 'postgresql');
    return values.size ? [...values] : ['http'];
  });
  readonly protocolLabel = computed(() => this.protocols().map((value) => value === 'http' ? 'REST' : 'PostgreSQL').join(' · '));
  readonly canActivate = computed(() => isExposurePublishable({
    subjectType: this.subjectType(), subjectId: this.subjectId(), validFrom: this.startDate(), validUntil: this.endDate(),
    kobyMetadataAllowed: this.kobyAllowed(), i14yMetadataDelivery: this.i14yAllowed(),
  }));
  readonly filteredGroupMemberCandidates = computed(() => {
    const needle = this.groupMemberQuery().trim().toLocaleLowerCase('de-CH');
    if (!needle) return this.groupMemberCandidates();
    return this.groupMemberCandidates().filter((person) =>
      [person.displayName, person.organization, person.email, person.id]
        .some((value) => value.toLocaleLowerCase('de-CH').includes(needle))
    );
  });
  readonly canCreateGroup = computed(() =>
    this.newGroupLabel().trim().length >= 3
    && this.newGroupDescription().trim().length >= 3
    && this.newGroupMemberIds().length > 0
  );

  constructor() {
    this.api.selectProduct(this.route.snapshot.paramMap.get('id'));
    this.api.loadAdministrativeOrganizations().subscribe({
      next: (organizations) => this.organizations.set(organizations),
    });
    this.searchPeople();
  }

  setSubjectType(value: SubjectType): void {
    this.cancelDirectorySearches();
    this.subjectType.set(value);
    this.directoryError.set(null);
    if (value === 'person' && !this.people().length) this.searchPeople();
    if (value === 'group' && !this.groups().length) this.searchGroups();
    this.markDraft();
  }

  onPersonQuery(value: string): void {
    this.personQuery.set(value);
    this.selectedPerson.set(null);
    this.markDraft();
    this.schedulePersonSearch();
  }

  setPersonSource(value: IdentityDirectorySource | ''): void {
    this.personSource.set(value);
    this.selectedPerson.set(null);
    this.markDraft();
    this.searchPeople();
  }

  setPersonOrganization(value: string): void {
    this.personOrganizationId.set(value);
    this.selectedPerson.set(null);
    this.markDraft();
    this.searchPeople();
  }

  onGroupQuery(value: string): void {
    this.groupQuery.set(value);
    this.selectedGroup.set(null);
    this.selectedGroupDetail.set(null);
    this.markDraft();
    this.scheduleGroupSearch();
  }

  setGroupSource(value: IdentityDirectorySource | ''): void {
    this.groupSource.set(value);
    this.selectedGroup.set(null);
    this.selectedGroupDetail.set(null);
    this.markDraft();
    this.searchGroups();
  }

  searchPeople(): void {
    this.cancelPersonSearch();
    this.directoryLoading.set(true); this.directoryError.set(null);
    this.personSearchSubscription = this.api.searchDirectoryPeople(
      this.personQuery(), this.personSource(), this.personOrganizationId(),
    ).subscribe({
      next: (people) => { this.people.set(people); this.directoryLoading.set(false); },
      error: () => { this.directoryError.set('Das Identitätsverzeichnis ist momentan nicht verfügbar.'); this.directoryLoading.set(false); },
    });
  }

  searchGroups(): void {
    this.cancelGroupSearch();
    this.directoryLoading.set(true); this.directoryError.set(null);
    this.groupSearchSubscription = this.api.searchIdentityGroups(this.groupQuery(), this.groupSource()).subscribe({
      next: (groups) => { this.groups.set(groups); this.directoryLoading.set(false); },
      error: () => { this.directoryError.set('Das Gruppenverzeichnis ist momentan nicht verfügbar.'); this.directoryLoading.set(false); },
    });
  }

  ngOnDestroy(): void {
    this.cancelDirectorySearches();
  }

  private schedulePersonSearch(): void {
    this.cancelPersonSearch();
    this.directoryLoading.set(true);
    this.directoryError.set(null);
    this.personSearchTimer = setTimeout(() => this.searchPeople(), DIRECTORY_SEARCH_DEBOUNCE_MS);
  }

  private scheduleGroupSearch(): void {
    this.cancelGroupSearch();
    this.directoryLoading.set(true);
    this.directoryError.set(null);
    this.groupSearchTimer = setTimeout(() => this.searchGroups(), DIRECTORY_SEARCH_DEBOUNCE_MS);
  }

  private cancelDirectorySearches(): void {
    this.cancelPersonSearch();
    this.cancelGroupSearch();
    this.directoryLoading.set(false);
  }

  private cancelPersonSearch(): void {
    if (this.personSearchTimer !== null) clearTimeout(this.personSearchTimer);
    this.personSearchTimer = null;
    this.personSearchSubscription?.unsubscribe();
    this.personSearchSubscription = null;
  }

  private cancelGroupSearch(): void {
    if (this.groupSearchTimer !== null) clearTimeout(this.groupSearchTimer);
    this.groupSearchTimer = null;
    this.groupSearchSubscription?.unsubscribe();
    this.groupSearchSubscription = null;
  }

  selectPerson(person: IdentityDirectoryEntry): void { this.selectedPerson.set(person); this.markDraft(); }
  selectGroup(group: IdentityGroupSummary): void {
    this.selectedGroup.set(group); this.selectedGroupDetail.set(null); this.markDraft();
    this.api.loadIdentityGroup(group.id).subscribe({ next: (detail) => this.selectedGroupDetail.set(detail) });
  }
  toggleGroupBuilder(): void {
    this.groupBuilderOpen.update((value) => !value);
    this.groupCreateError.set(null);
    if (this.groupBuilderOpen() && !this.groupMemberCandidates().length) {
      this.api.searchDirectoryPeople('', '').subscribe({
        next: (people) => this.groupMemberCandidates.set(people),
        error: () => this.groupCreateError.set('Die verfügbaren Identitäten konnten nicht geladen werden.'),
      });
    }
  }
  toggleGroupMember(identityId: string): void {
    this.newGroupMemberIds.update((current) => current.includes(identityId)
      ? current.filter((item) => item !== identityId)
      : [...current, identityId]);
  }
  createGroup(): void {
    if (!this.canCreateGroup() || this.groupCreating()) return;
    this.groupCreating.set(true);
    this.groupCreateError.set(null);
    this.api.createIdentityGroup({
      label: this.newGroupLabel().trim(),
      description: this.newGroupDescription().trim(),
      memberIds: [...this.newGroupMemberIds()],
    }).subscribe({
      next: (group) => {
        this.groups.update((groups) => [group, ...groups]);
        this.selectedGroup.set(group);
        this.selectedGroupDetail.set(group);
        this.groupBuilderOpen.set(false);
        this.groupCreating.set(false);
        this.newGroupLabel.set('');
        this.newGroupDescription.set('');
        this.newGroupMemberIds.set([]);
        this.markDraft();
      },
      error: (error) => {
        this.groupCreating.set(false);
        this.groupCreateError.set(error?.error?.detail ?? 'Die Gruppe konnte nicht erstellt werden.');
      },
    });
  }
  setMachineIdentity(value: string): void { this.machineIdentity.set(value); this.markDraft(); }
  setStartDate(value: string): void { this.startDate.set(value); this.markDraft(); }
  setEndDate(value: string): void { this.endDate.set(value); this.markDraft(); }
  setKobyAllowed(value: boolean): void { this.kobyAllowed.set(value); this.markDraft(); }
  setI14yAllowed(value: boolean): void { this.i14yAllowed.set(value); this.markDraft(); }

  activate(): void {
    if (!this.canActivate()) return;
    this.publicationError.set(null);
    const grant: NonNullable<PolicyDefinition['grants']>[number] = {
      subject: { type: this.subjectType(), id: this.subjectId() }, actions: ['data.read'], protocols: this.protocols(),
      validFrom: this.startDate(), validUntil: this.endDate(), dataVariant: 'original',
      metadataChannels: { kobyMcp: this.kobyAllowed(), i14y: this.i14yAllowed() },
    };
    this.api.upsertAccessSetting(this.product().id, grant).subscribe({
      next: (draft) => this.api.publishPolicy(this.product().id, draft.id, draft.revision).subscribe({
        next: () => { this.publicationState.set('activating'); this.pollActivation(0); },
        error: (error) => this.publicationError.set(error?.error?.detail ?? 'Die Zugriffseinstellung konnte nicht aktiviert werden.'),
      }),
      error: (error) => this.publicationError.set(error?.error?.detail ?? 'Der Policy-Entwurf konnte nicht erstellt werden.'),
    });
  }

  resetDraft(): void {
    this.subjectType.set(INITIAL_EXPOSURE_DRAFT.subjectType); this.machineIdentity.set(''); this.selectedPerson.set(null);
    this.selectedGroup.set(null); this.selectedGroupDetail.set(null); this.startDate.set(INITIAL_EXPOSURE_DRAFT.validFrom);
    this.endDate.set(INITIAL_EXPOSURE_DRAFT.validUntil); this.kobyAllowed.set(INITIAL_EXPOSURE_DRAFT.kobyMetadataAllowed);
    this.i14yAllowed.set(INITIAL_EXPOSURE_DRAFT.i14yMetadataDelivery); this.markDraft();
  }

  formatDate(value: string): string {
    const timestamp = exposureUtcDay(value);
    if (!Number.isFinite(timestamp)) return '–';
    return new Intl.DateTimeFormat('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(timestamp);
  }

  sourceLabel(source: IdentityDirectorySource): string {
    return ({ federal: 'Bund', cantonal: 'Kantone', municipal: 'Gemeinden', federal_related: 'Bundesnahe Betriebe' })[source];
  }

  private pollActivation(attempt: number): void {
    this.api.loadLatestPolicyWire(this.product().id).subscribe({
      next: (policy) => {
        if (this.isFullyDeployed(policy)) {
          this.publicationState.set('active');
          this.activatedAt.set(new Intl.DateTimeFormat('de-CH', { hour: '2-digit', minute: '2-digit' }).format(new Date()));
          return;
        }
        if (attempt < 14) setTimeout(() => this.pollActivation(attempt + 1), 1000);
        else this.publicationError.set('Die Einstellung ist publiziert, aber OPA und PostgreSQL haben noch nicht dieselbe Revision bestätigt.');
      },
      error: () => this.publicationError.set('Der Aktivierungsstatus konnte nicht geprüft werden.'),
    });
  }

  private isFullyDeployed(policy: PolicyWire): boolean {
    return policy.status === 'published' && ['opa', 'postgresql'].every((target) => {
      const deployment = policy.deployments.find((item) => item.target === target);
      return deployment?.observedRevision === deployment?.desiredRevision;
    });
  }

  private markDraft(): void { this.publicationState.set('draft'); this.activatedAt.set(''); this.publicationError.set(null); }
}
