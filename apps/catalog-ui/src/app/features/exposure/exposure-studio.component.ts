import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StatusBadgeComponent } from '@bit-didaca/design-system';
import {
  EXPOSURE_AUDIENCE_GROUPS,
  INITIAL_EXPOSURE_DRAFT,
  exposureDurationDays,
  exposureUtcDay,
  isExposureDateRangeValid,
  isExposurePublishable,
  isExposureSubjectIdValid,
} from './exposure-draft';

type PublicationState = 'draft' | 'published';

@Component({
  selector: 'didaca-exposure-studio',
  standalone: true,
  imports: [RouterLink, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="exposure-breadcrumb" aria-label="Brotkrumen-Navigation">
      <a routerLink="/">Datenprodukte</a><span aria-hidden="true">/</span><span>ESTV-Steuerstatistik nach Kanton</span><span aria-hidden="true">/</span><strong>Freigabe</strong>
    </nav>

    <section class="didaca-page-heading exposure-heading">
      <div>
        <p class="didaca-eyebrow">Mockup 04 · Sicherheit & Zugriff</p>
        <h1>Datenprodukt freigeben</h1>
        <p>Bestimmen Sie, welche eIAM-Identität oder Machine ID das Datenprodukt in welchem Zeitraum nutzen darf und ob KOBY auf freigegebene Metadaten zugreifen kann.</p>
      </div>
      <didaca-status-badge [tone]="publicationState() === 'published' ? 'green' : 'orange'">
        {{ publicationState() === 'published' ? 'Freigabe simuliert' : 'Entwurf' }}
      </didaca-status-badge>
    </section>

    <section class="didaca-card exposure-product" aria-labelledby="exposure-product-title">
      <div class="exposure-product-mark" aria-hidden="true">ESTV</div>
      <div class="exposure-product-copy">
        <span>Ausgewähltes Datenprodukt</span>
        <h2 id="exposure-product-title">ESTV-Steuerstatistik nach Kanton</h2>
        <small>Eigentümer: ESTV · <span class="didaca-code">urn:didaca:ch:estv:tax-statistics-by-canton</span></small>
      </div>
      <didaca-status-badge tone="red">Eingeschränkt</didaca-status-badge>
      <a routerLink="/metadata">Metadaten ansehen</a>
    </section>

    <div class="exposure-layout">
      <form id="exposure-form" class="didaca-card exposure-form" (submit)="$event.preventDefault(); publish()">
        <section class="exposure-rule-section" aria-labelledby="audience-title">
          <div class="exposure-section-heading">
            <div><p class="didaca-eyebrow">Schritt 1</p><h2 id="audience-title">Wer darf die Daten nutzen?</h2></div>
            <span>{{ subjectType() === 'person' ? 'Persönlich · eIAM' : 'Maschine · M2M' }}</span>
          </div>

          <div class="exposure-subject-choice" role="radiogroup" aria-label="Art der Freigabe">
            <label [class.is-selected]="subjectType() === 'person'">
              <input type="radio" name="exposure-subject-type" value="person" [checked]="subjectType() === 'person'" (change)="setSubjectType('person')">
              <span><strong>Persönlicher Zugriff</strong><small>Eine Person greift mit ihrer eigenen eIAM-Identität zu.</small></span>
              <b>eIAM</b>
            </label>
            <label [class.is-selected]="subjectType() === 'machine'">
              <input type="radio" name="exposure-subject-type" value="machine" [checked]="subjectType() === 'machine'" (change)="setSubjectType('machine')">
              <span><strong>Maschinenzugriff</strong><small>Ein technischer Client greift Machine-to-Machine zu.</small></span>
              <b>M2M</b>
            </label>
          </div>

          <div class="exposure-subject-id" [class.is-invalid]="!subjectValid()">
            @if (subjectType() === 'person') {
              <label for="exposure-eiam-id"><span>eIAM-Benutzer-ID *</span><input id="exposure-eiam-id" [value]="eiamIdentity()" (input)="setEiamIdentity($any($event.target).value)" placeholder="z. B. beat.stalder" autocomplete="off"></label>
              <p>Die Freigabe gilt ausschliesslich für diese persönliche Identität und ist nicht übertragbar.</p>
            } @else {
              <label for="exposure-machine-id"><span>Machine ID *</span><input id="exposure-machine-id" [value]="machineIdentity()" (input)="setMachineIdentity($any($event.target).value)" placeholder="z. B. svc-estv-tax-analysis" autocomplete="off"></label>
              <p>Nur die technische Identität angeben – keine Passwörter, Tokens oder Secret-Referenzen.</p>
            }
            @if (!subjectValid()) { <strong role="alert">Eine gültige {{ subjectType() === 'person' ? 'eIAM-Benutzer-ID' : 'Machine ID' }} ist erforderlich.</strong> }
          </div>

          <div class="exposure-subsection-heading">
            <div><strong>Berechtigungskontext</strong><small>Vertrauenswürdige Gruppe der gewählten Identität</small></div>
            <span>{{ selectedGroups().length }} ausgewählt</span>
          </div>
          <div class="exposure-group-grid" role="group" aria-labelledby="audience-title">
            @for (group of audienceGroups; track group.id) {
              <label class="exposure-group-card" [class.is-selected]="selectedGroupIds().has(group.id)">
                <input
                  type="checkbox"
                  [checked]="selectedGroupIds().has(group.id)"
                  (change)="toggleGroup(group.id, $any($event.target).checked)"
                >
                <span><strong>{{ group.label }}</strong><small>{{ group.description }}</small><code>{{ group.id }}</code></span>
              </label>
            }
          </div>
          <p class="exposure-help">eIAM- und Machine-Identitäten sowie ihre Gruppenzugehörigkeiten stammen aus einer vertrauenswürdigen Identitätsquelle. Nicht ausgewählte oder unbekannte Identitäten bleiben gesperrt.</p>
        </section>

        <section class="exposure-rule-section" aria-labelledby="period-title">
          <div class="exposure-section-heading">
            <div><p class="didaca-eyebrow">Schritt 2</p><h2 id="period-title">Wie lange gilt die Freigabe?</h2></div>
            @if (dateValid()) { <span>{{ durationDays() }} Kalendertage</span> }
          </div>
          <div class="exposure-period-grid">
            <label>Gültig ab *
              <input type="date" [value]="startDate()" (input)="setStartDate($any($event.target).value)">
            </label>
            <label>Gültig bis *
              <input type="date" [value]="endDate()" [min]="startDate()" (input)="setEndDate($any($event.target).value)">
            </label>
            <div class="exposure-timezone"><span>Zeitzone</span><strong>Europe/Zurich</strong><small>MEZ / MESZ</small></div>
          </div>
          @if (!dateValid()) {
            <p class="didaca-alert is-error" role="alert">Das Enddatum muss am oder nach dem Startdatum liegen.</p>
          } @else {
            <p class="exposure-help">Vor Beginn und nach Ablauf wird der Zugriff automatisch verweigert.</p>
          }
        </section>

        <section class="exposure-rule-section" aria-labelledby="koby-title">
          <div class="exposure-section-heading">
            <div><p class="didaca-eyebrow">Schritt 3 · Explizites Opt-in</p><h2 id="koby-title">Darf KOBY die Metadaten nutzen?</h2></div>
            <didaca-status-badge [tone]="kobyAllowed() ? 'green' : 'red'">{{ kobyAllowed() ? 'Erlaubt' : 'Nicht erlaubt' }}</didaca-status-badge>
          </div>
          <label class="exposure-koby-consent" [class.is-selected]="kobyAllowed()">
            <input type="checkbox" role="switch" [checked]="kobyAllowed()" (change)="setKobyAllowed($any($event.target).checked)">
            <span><strong>KOBY AI Services den Metadatenzugriff über MCP erlauben</strong><small>Es gilt derselbe Zeitraum wie für die Datenfreigabe.</small></span>
            <b aria-hidden="true">MCP</b>
          </label>
          @if (kobyAllowed()) {
            <div class="exposure-mcp-scope">
              <span>Freigegebener Umfang</span>
              <ul>
                <li>Titel, Beschreibung und Schlagwörter</li>
                <li>Schema- und Endpunktbeschreibungen</li>
                <li>Qualität, Lineage und Provenienz</li>
              </ul>
            </div>
          }
          <p class="exposure-help"><strong>Abgrenzung:</strong> MCP ist hier ein Metadatenzugang zum Katalog, kein zusätzlicher Produktauslieferungsweg. Produktdaten, Zugangsdaten und Secret-Referenzen sind ausgeschlossen.</p>
        </section>
      </form>

      <aside class="didaca-card exposure-review" aria-labelledby="review-title">
        <div class="didaca-card-header">
          <div><p class="didaca-eyebrow">Live-Vorschau</p><h2 id="review-title">Freigabe prüfen</h2></div>
          <didaca-status-badge [tone]="canPublish() ? 'blue' : 'red'">{{ canPublish() ? 'Vollständig' : 'Unvollständig' }}</didaca-status-badge>
        </div>
        <div class="didaca-card-body">
          <div class="exposure-policy-sentence" [class.is-blocked]="!canPublish()">
            <span>{{ canPublish() ? 'ALLOW' : 'DENY' }}</span>
            @if (canPublish()) {
              <p><strong>{{ subjectSummary() }}</strong> darf dieses Datenprodukt im Kontext <strong>{{ selectedGroupLabels() }}</strong> vom <strong>{{ formatDate(startDate()) }}</strong> bis <strong>{{ formatDate(endDate()) }}</strong> über REST und PostgreSQL lesen.</p>
            } @else if (!subjectValid()) {
              <p>Ohne gültige {{ subjectType() === 'person' ? 'eIAM-Benutzer-ID' : 'Machine ID' }} bleibt das Datenprodukt gesperrt.</p>
            } @else if (!selectedGroups().length) {
              <p>Ohne ausgewählte Benutzergruppe bleibt das Datenprodukt gesperrt.</p>
            } @else {
              <p>Der Gültigkeitszeitraum ist ungültig. Die ausgewählten Benutzergruppen bleiben gesperrt, bis ein gültiges Start- und Enddatum gesetzt ist.</p>
            }
          </div>

          <dl class="exposure-review-list">
            <div><dt>Zugriffstyp</dt><dd>{{ subjectType() === 'person' ? 'Persönlich · eIAM' : 'Maschine · M2M' }}</dd></div>
            <div><dt>{{ subjectType() === 'person' ? 'eIAM-ID' : 'Machine ID' }}</dt><dd><code>{{ subjectId() || 'Fehlt' }}</code></dd></div>
            <div><dt>Benutzergruppen</dt><dd>{{ selectedGroups().length || 'Keine' }}</dd></div>
            <div><dt>Berechtigung</dt><dd><code>data.read</code></dd></div>
            <div><dt>Zugriffswege</dt><dd>REST · PostgreSQL</dd></div>
            <div><dt>Gültigkeit</dt><dd>{{ dateValid() ? durationDays() + ' Tage' : 'Ungültig' }}</dd></div>
            <div><dt>KOBY / MCP</dt><dd [class.is-positive]="kobyAllowed()">{{ kobyAllowed() ? 'Metadaten erlaubt' : 'Nicht erlaubt' }}</dd></div>
          </dl>

          <div class="exposure-guardrail">
            <strong>Default deny bleibt aktiv</strong>
            <p>Alle anderen Gruppen, Zeitpunkte und Nutzungsarten werden abgewiesen. Aktiv wird die Regel erst, wenn OPA und PostgreSQL dieselbe Revision bestätigen.</p>
          </div>

          @if (publicationState() === 'published') {
            <p class="didaca-alert exposure-success" role="status">Mockup: Die Veröffentlichung wurde um {{ publishedAt() }} Uhr erfolgreich simuliert.</p>
          }

          <button class="didaca-button exposure-primary-action" form="exposure-form" type="submit" [disabled]="!canPublish()">
            Freigabe veröffentlichen
          </button>
          <button class="didaca-button is-secondary exposure-secondary-action" type="button" (click)="resetDraft()">Entwurf zurücksetzen</button>
          <small class="exposure-demo-note">Interaktiver UI-Mockup · keine Backend-Publikation</small>
        </div>
      </aside>
    </div>
  `,
})
export class ExposureStudioComponent {
  readonly audienceGroups = EXPOSURE_AUDIENCE_GROUPS;
  readonly subjectType = signal<'person' | 'machine'>(INITIAL_EXPOSURE_DRAFT.subjectType);
  readonly eiamIdentity = signal(INITIAL_EXPOSURE_DRAFT.subjectType === 'person' ? INITIAL_EXPOSURE_DRAFT.subjectId : '');
  readonly machineIdentity = signal(INITIAL_EXPOSURE_DRAFT.subjectType === 'machine' ? INITIAL_EXPOSURE_DRAFT.subjectId : '');
  readonly selectedGroupIds = signal(new Set<string>(INITIAL_EXPOSURE_DRAFT.groupIds));
  readonly startDate = signal(INITIAL_EXPOSURE_DRAFT.validFrom);
  readonly endDate = signal(INITIAL_EXPOSURE_DRAFT.validUntil);
  readonly kobyAllowed = signal(INITIAL_EXPOSURE_DRAFT.kobyMetadataAllowed);
  readonly publicationState = signal<PublicationState>('draft');
  readonly publishedAt = signal('');

  readonly selectedGroups = computed(() => this.audienceGroups.filter((group) => this.selectedGroupIds().has(group.id)));
  readonly selectedGroupLabels = computed(() => this.selectedGroups().map((group) => group.label).join(', '));
  readonly subjectId = computed(() => this.subjectType() === 'person' ? this.eiamIdentity().trim() : this.machineIdentity().trim());
  readonly subjectValid = computed(() => isExposureSubjectIdValid(this.subjectId()));
  readonly subjectSummary = computed(() => this.subjectType() === 'person'
    ? `Die eIAM-Identität ${this.subjectId()}`
    : `Die Machine ID ${this.subjectId()}`);
  readonly dateValid = computed(() => isExposureDateRangeValid(this.startDate(), this.endDate()));
  readonly durationDays = computed(() => exposureDurationDays(this.startDate(), this.endDate()));
  readonly canPublish = computed(() => isExposurePublishable({
    subjectType: this.subjectType(),
    subjectId: this.subjectId(),
    groupIds: [...this.selectedGroupIds()],
    validFrom: this.startDate(),
    validUntil: this.endDate(),
    kobyMetadataAllowed: this.kobyAllowed(),
  }));

  setSubjectType(value: 'person' | 'machine'): void {
    this.subjectType.set(value);
    this.markDraft();
  }

  setEiamIdentity(value: string): void {
    this.eiamIdentity.set(value);
    this.markDraft();
  }

  setMachineIdentity(value: string): void {
    this.machineIdentity.set(value);
    this.markDraft();
  }

  toggleGroup(groupId: string, checked: boolean): void {
    const next = new Set(this.selectedGroupIds());
    if (checked) next.add(groupId);
    else next.delete(groupId);
    this.selectedGroupIds.set(next);
    this.markDraft();
  }

  setStartDate(value: string): void {
    this.startDate.set(value);
    this.markDraft();
  }

  setEndDate(value: string): void {
    this.endDate.set(value);
    this.markDraft();
  }

  setKobyAllowed(value: boolean): void {
    this.kobyAllowed.set(value);
    this.markDraft();
  }

  publish(): void {
    if (!this.canPublish()) return;
    this.publicationState.set('published');
    this.publishedAt.set(new Intl.DateTimeFormat('de-CH', { hour: '2-digit', minute: '2-digit' }).format(new Date()));
  }

  resetDraft(): void {
    this.subjectType.set(INITIAL_EXPOSURE_DRAFT.subjectType);
    this.eiamIdentity.set(INITIAL_EXPOSURE_DRAFT.subjectType === 'person' ? INITIAL_EXPOSURE_DRAFT.subjectId : '');
    this.machineIdentity.set(INITIAL_EXPOSURE_DRAFT.subjectType === 'machine' ? INITIAL_EXPOSURE_DRAFT.subjectId : '');
    this.selectedGroupIds.set(new Set<string>(INITIAL_EXPOSURE_DRAFT.groupIds));
    this.startDate.set(INITIAL_EXPOSURE_DRAFT.validFrom);
    this.endDate.set(INITIAL_EXPOSURE_DRAFT.validUntil);
    this.kobyAllowed.set(INITIAL_EXPOSURE_DRAFT.kobyMetadataAllowed);
    this.markDraft();
  }

  formatDate(value: string): string {
    const timestamp = exposureUtcDay(value);
    if (!Number.isFinite(timestamp)) return '—';
    return new Intl.DateTimeFormat('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(timestamp);
  }

  private markDraft(): void {
    this.publicationState.set('draft');
    this.publishedAt.set('');
  }

}
