import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StatusBadgeComponent } from '@bit-daca/design-system';
import { CatalogApiService } from '../../core/catalog-api.service';
import { AccessRenewalFixtureState } from '../../core/catalog.models';

const RESET_CONFIRMATION = 'ESTV-Steuerstatistik nach Kanton';

@Component({
  selector: 'daca-access-renewal-fixture',
  standalone: true,
  imports: [DatePipe, RouterLink, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="access-request-breadcrumb" aria-label="Brotkrümelnavigation">
      <a routerLink="/poc-simulation">PoC Simulation</a><span aria-hidden="true">›</span><span>Auslaufende Freigabe</span>
    </nav>

    <section class="daca-page-heading">
      <div><p class="daca-eyebrow">PoC Fixture · Access Lifecycle</p><h1>Auslaufende Freigabe vorbereiten</h1><p>Deterministischer Start- und Resetpunkt für die Verlängerungs-Journey. Änderungen erfolgen nur über die sichtbaren Aktionen auf dieser Seite.</p></div>
      @if (fixture(); as item) { <daca-status-badge [tone]="item.state === 'deployed' ? 'green' : item.state === 'ready' ? 'orange' : item.state === 'notPrepared' ? 'neutral' : 'blue'">{{ stateLabel(item.state) }}</daca-status-badge> }
    </section>

    <p class="daca-alert is-warning"><strong>Nur PoC:</strong> Vorbereiten und Zurücksetzen verändern synthetische Access-Request-, Policy- und Deployment-Evidenz für dieses Fixture. Andere Datenprodukte bleiben unberührt.</p>

    @if (loading()) {
      <section class="daca-card access-renewal-fixture-state" role="status"><strong>Fixture-Status wird geladen …</strong></section>
    } @else if (loadError(); as error) {
      <section class="daca-card access-renewal-fixture-state is-error" role="alert">
        <strong>Fixture-Status nicht verfügbar</strong><p>{{ error }}</p>
        <button class="daca-button is-secondary" type="button" (click)="load()">Erneut laden</button>
      </section>
    } @else if (fixture(); as item) {
      @if (item.state === 'notPrepared') {
        <section class="daca-card access-renewal-fixture-state is-unprepared" aria-labelledby="renewal-fixture-prepare-title">
          <p class="daca-eyebrow">Noch nicht vorbereitet</p>
          <h2 id="renewal-fixture-prepare-title">Fixture explizit anlegen</h2>
          <p>Es existiert noch keine Fixture-eigene auslaufende Policy. Erst die folgende Aktion erzeugt die synthetische Source-Request-Evidenz und Policy-Revision für die Journey.</p>
          @if (notice()) { <p class="daca-alert" role="status">{{ notice() }}</p> }
          @if (actionError()) { <p class="daca-alert is-error" role="alert">{{ actionError() }}</p> }
          <button class="daca-button" data-testid="prepare-renewal-fixture" type="button" [disabled]="mutating()" (click)="prepare()">{{ mutating() ? 'Fixture wird vorbereitet …' : 'Fixture vorbereiten' }}</button>
        </section>
      } @else {
      <div class="access-renewal-fixture-grid">
        <section class="daca-card access-renewal-fixture-overview" aria-labelledby="renewal-fixture-title">
          <div class="daca-card-header"><div><p class="daca-eyebrow">Fixture {{ item.fixtureId }}</p><h2 id="renewal-fixture-title">{{ item.productTitle }}</h2></div><strong>Policy Rev. {{ item.activePolicyRevision }}</strong></div>
          <div class="daca-card-body">
            <dl>
              <div><dt>Stichtag</dt><dd>{{ item.asOfDate | date: 'dd.MM.yyyy' }}</dd></div>
              <div><dt>Aktive Freigabe</dt><dd>{{ item.validFrom | date: 'dd.MM.yyyy' }}–{{ item.validUntil | date: 'dd.MM.yyyy' }}</dd></div>
              <div><dt>Ablauf</dt><dd>In {{ item.daysUntilExpiry }} Tagen</dd></div>
              <div><dt>Offene Verlängerungen</dt><dd>{{ item.openRenewalCount }}</dd></div>
            </dl>
            @if (notice()) { <p class="daca-alert" role="status">{{ notice() }}</p> }
            @if (actionError()) { <p class="daca-alert is-error" role="alert">{{ actionError() }}</p> }
            <div class="access-renewal-fixture-actions">
              <a class="daca-button is-secondary" [href]="beatUsageUrl(item.productId)">Als Beat zu Daten &amp; Nutzung</a>
              <a class="daca-button is-secondary" [href]="ownerTasksUrl(item.productId)">Als Kassandra zu den Aufgaben</a>
            </div>
            <small>Der angezeigte Status wird nur gelesen. Für spätere Journey-Zustände stellt ausschliesslich der bestätigte Reset die auslaufende Ausgangsfreigabe wieder her.</small>
          </div>
        </section>

        <aside class="daca-card access-renewal-fixture-reset" aria-labelledby="renewal-reset-title">
          <div class="daca-card-header"><div><p class="daca-eyebrow">Expliziter Reset</p><h2 id="renewal-reset-title">Journey zurücksetzen</h2></div></div>
          <div class="daca-card-body">
            <p>Entfernt die synthetische Verlängerung, zugehörige Governance-Evidenz und neue Policy-Projektionen dieses Fixtures und stellt den Ausgangszustand wieder her.</p>
            <label><span>Zur Bestätigung exakt eingeben:</span><strong>{{ resetConfirmation }}</strong><input type="text" [value]="confirmationName()" (input)="confirmationName.set($any($event.target).value)" autocomplete="off"></label>
            <button class="daca-button is-secondary" data-testid="reset-renewal-fixture" type="button" [disabled]="confirmationName() !== resetConfirmation || mutating()" (click)="reset()">Fixture zurücksetzen</button>
          </div>
        </aside>
      </div>
      }
    }
  `,
})
export class AccessRenewalFixtureComponent {
  readonly api = inject(CatalogApiService);
  readonly fixture = signal<AccessRenewalFixtureState | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly mutating = signal(false);
  readonly confirmationName = signal('');
  readonly resetConfirmation = RESET_CONFIRMATION;
  private loadGeneration = 0;

  constructor() {
    effect(() => {
      this.api.identityUserId();
      this.load();
    });
  }

  load(): void {
    const generation = ++this.loadGeneration;
    this.loading.set(true);
    this.loadError.set(null);
    this.actionError.set(null);
    this.fixture.set(null);
    this.api.loadAccessRenewalFixture().subscribe({
      next: (state) => {
        if (generation !== this.loadGeneration) return;
        this.fixture.set(state);
        this.loading.set(false);
      },
      error: (error) => {
        if (generation !== this.loadGeneration) return;
        this.loading.set(false);
        this.loadError.set(error?.status === 403
          ? 'Wählen Sie die Data Ownerin Kassandra Valdata, um dieses Fixture zu verwalten.'
          : 'Die Fixture-API ist nicht erreichbar. Es wurde keine Änderung ausgeführt.');
      },
    });
  }

  prepare(): void {
    if (this.mutating()) return;
    this.mutating.set(true);
    this.actionError.set(null);
    this.notice.set(null);
    this.api.prepareAccessRenewalFixture().subscribe({
      next: (state) => {
        this.fixture.set(state);
        this.mutating.set(false);
        this.notice.set('Fixture vorbereitet. Beat sieht nun die auslaufende aktive Freigabe; es wurde noch kein Verlängerungsantrag erstellt.');
        this.api.refreshProducts();
      },
      error: () => {
        this.mutating.set(false);
        this.actionError.set('Das Fixture konnte nicht vorbereitet werden. Der aktuelle Zustand wurde nicht als geändert übernommen.');
      },
    });
  }

  reset(): void {
    if (this.confirmationName() !== RESET_CONFIRMATION || this.mutating()) return;
    this.mutating.set(true);
    this.actionError.set(null);
    this.notice.set(null);
    this.api.resetAccessRenewalFixture(RESET_CONFIRMATION).subscribe({
      next: (state) => {
        this.fixture.set(state);
        this.mutating.set(false);
        this.confirmationName.set('');
        this.notice.set('Fixture zurückgesetzt. Die auslaufende Ausgangsfreigabe ist wieder aktiv.');
        this.api.refreshProducts();
        this.api.refreshOwnerAccessRequestInbox();
        this.api.refreshWorkflowTasks();
      },
      error: () => {
        this.mutating.set(false);
        this.actionError.set('Das Fixture konnte nicht zurückgesetzt werden. Prüfen Sie den aktuellen Zustand erneut.');
      },
    });
  }

  stateLabel(state: AccessRenewalFixtureState['state']): string {
    return ({ notPrepared: 'Nicht vorbereitet', ready: 'Ausgangslage bereit', renewalPending: 'Verlängerung offen', approvalPending: 'Vier-Augen-Entscheid offen', deployed: 'Neue Revision aktiv' })[state];
  }

  beatUsageUrl(productId: string): string {
    return `/products/${encodeURIComponent(productId)}/usage?demoUser=beat.stalder`;
  }

  ownerTasksUrl(productId: string): string {
    return `/tasks?product=${encodeURIComponent(productId)}&demoUser=kassandra.valdata`;
  }
}
