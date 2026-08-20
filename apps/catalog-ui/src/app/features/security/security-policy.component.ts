import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DacaGlossaryTermComponent, StatusBadgeComponent } from '@bit-daca/design-system';
import { finalize } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { PolicyDefinition, WeeklyAvailability } from '../../core/catalog.models';
import { ProductWorkspaceNavComponent } from '../../shared/product-workspace-nav.component';

@Component({
  selector: 'daca-security-policy',
  standalone: true,
  imports: [FormsModule, ProductWorkspaceNavComponent, StatusBadgeComponent, DacaGlossaryTermComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <daca-product-workspace-nav
      [productId]="api.product().id"
      [productTitle]="api.product().title"
      activeSection="access"
      accessView="technical"
    />

    <section class="daca-page-heading">
      <div>
        <p class="daca-eyebrow">Freigaben · Erweiterte Kontrolle</p>
        <h1>Technische Durchsetzung</h1>
        <p>Prüfen Sie <daca-glossary-term term="PBAC" />-Regeln sowie deren Durchsetzung über <daca-glossary-term term="OPA" />, REST und PostgreSQL.</p>
      </div>
      @if (policyLoading()) {
        <daca-status-badge tone="neutral">Policy-Evidenz wird geladen</daca-status-badge>
      } @else if (policyError()) {
        <daca-status-badge tone="red">Policy-Evidenz nicht verfügbar</daca-status-badge>
      } @else if (policy(); as activePolicy) {
        <daca-status-badge [tone]="deploymentsAligned() ? 'green' : 'red'">Policy revision {{ activePolicy.revision }} · {{ activePolicy.state }}</daca-status-badge>
      }
    </section>

    @if (policyLoading()) {
      <section class="daca-card"><div class="daca-card-body" aria-live="polite">Policy- und Deployment-Evidenz wird geladen…</div></section>
    } @else if (policyError(); as loadError) {
      <section class="daca-card"><div class="daca-card-body">
        <p class="daca-alert is-error" role="alert"><strong>Status unbekannt.</strong> {{ loadError }}</p>
        <button class="daca-button is-secondary" data-testid="retry-policy" type="button" (click)="reloadPolicy()">Erneut laden</button>
      </div></section>
    } @else if (policy(); as activePolicy) {
    <div class="security-layout">
      <section class="daca-card policy-editor" aria-labelledby="policy-definition-title">
        <div class="daca-card-header"><div><p class="daca-eyebrow">Canonical definition</p><h2 id="policy-definition-title">Who may access this product?</h2></div><span class="policy-readonly">Structured policy</span></div>
        <div class="daca-card-body">
          <div class="policy-sentence" aria-label="Readable policy summary">
            <span>{{ activePolicy.grants?.length ? 'ALLOW' : 'DENY' }}</span>
            <p>{{ policySummary() }}</p>
          </div>
          <div class="policy-builder-grid">
            <div><span>Effect</span><strong class="is-allow">{{ activePolicy.grants?.length ? 'Allow matching grants' : 'Default deny' }}</strong></div>
            <div><span>Identitäten</span><strong>{{ subjectSummary() }}</strong></div>
            <div><span>Resource selectors</span><strong>owner = {{ activePolicy.resources.owner }}<br>productId = {{ shortProductId() }}</strong></div>
            <div><span>Action</span><strong>data.read</strong></div>
            <div><span>Protokolle</span><strong>{{ activePolicy.protocols.join(' · ').toUpperCase() }}</strong></div>
            <div><span>Zeitfenster</span><strong>{{ availabilitySummary() }}</strong></div>
            <div><span>Default</span><strong class="is-deny">Deny all unmatched requests</strong></div>
          </div>
          <p class="daca-alert">Resource owner and classification are enriched from the trusted catalog PIP; callers cannot override them.</p>
        </div>
      </section>

      <aside class="daca-card policy-test-panel" aria-labelledby="policy-test-title">
        <div class="daca-card-header"><h2 id="policy-test-title">Live decision test</h2><span class="demo-badge">Demo identity</span></div>
        <div class="daca-card-body">
          <label>Demo-Identität
            <select [ngModel]="selectedUser()" (ngModelChange)="selectedUser.set($event); testState.set('idle')">
              @for (user of identity.users(); track user.id) {
                <option [value]="user.id">{{ user.displayName }} · {{ user.organization }}</option>
              }
              <option value="kanton-st-gallen">kanton-st-gallen</option>
              <option value="anonymous">anonymous / no identity</option>
            </select>
          </label>
          <div class="policy-local-decision" [class.is-allowed]="expectedAllowed()">
            <span>{{ expectedAllowed() ? 'ALLOW' : 'DENY' }}</span>
            <strong>{{ expectedAllowed() ? 'Policy selectors match' : 'Default-deny applies' }}</strong>
          </div>
          <button class="daca-button" type="button" [disabled]="testing() || !runtimeAvailable()" (click)="testEndpoint()">
            {{ testing() ? 'PEP wird aufgerufen…' : runtimeAvailable() ? 'Geschützten REST-Zugriff testen' : 'Für dieses Produkt nur Metadaten-PoC' }}
          </button>
          @if (testMessage()) {
            <p class="daca-alert" [class.is-error]="testState() === 'denied' || testState() === 'error'">{{ testMessage() }}</p>
          }
          <a class="policy-endpoint-link" href="/sample-api/docs" target="_blank" rel="noreferrer">Open sample product API docs ↗</a>
          <small class="policy-demo-warning">The X-DaCa-User header is for local demonstration only, never production identity.</small>
        </div>
      </aside>
    </div>

    <section class="daca-card policy-flow-card" aria-labelledby="policy-flow-title">
      <div class="daca-card-header"><div><p class="daca-eyebrow">PBAC runtime</p><h2 id="policy-flow-title">Publication and enforcement flow</h2></div><daca-status-badge [tone]="deploymentsAligned() ? 'green' : 'red'">{{ deploymentsAligned() ? 'Targets aligned' : 'Deployment drift' }}</daca-status-badge></div>
      <div class="daca-card-body policy-flow">
        <div><span>PAP</span><strong>Data owner</strong><small>structured intent</small></div><i>→</i>
        <div><span>PIP</span><strong>DaCa catalog</strong><small>owner · product · class</small></div><i>→</i>
        <div><span>PDP</span><strong>OPA bundle</strong><small>revision {{ activePolicy.opaRevision }}</small></div><i>→</i>
        <div class="policy-flow-split"><span>PEP</span><strong>REST guard</strong><small>per-request decision</small><b>or</b><strong>PostgreSQL RLS</strong><small>projected entitlement</small></div>
      </div>
    </section>

    <div class="security-bottom-grid">
      <section class="daca-card">
        <div class="daca-card-header"><h2>Generated Rego</h2><span>Read-only compiler output</span></div>
        <pre class="policy-code"><code>{{ activePolicy.generatedRego }}</code></pre>
        @if (activePolicy.state === 'draft') {
          <div class="daca-card-body">
            <p class="daca-alert is-warning">Der Entwurf gewährt noch keinen Zugriff. Erst die Publikation projiziert dieselbe Revision nach OPA und PostgreSQL.</p>
            <button class="daca-button" type="button" [disabled]="publishing()" (click)="publishDraft()">{{ publishing() ? 'Policy wird publiziert…' : 'Policy bewusst publizieren' }}</button>
            @if (publishMessage()) { <p class="daca-alert" [class.is-error]="publishFailed()">{{ publishMessage() }}</p> }
          </div>
        }
      </section>
      <section class="daca-card">
        <div class="daca-card-header"><h2>Deployment status</h2><span>Desired revision {{ activePolicy.revision }}</span></div>
        <div class="daca-card-body policy-targets">
          <article><span class="policy-target-icon">OPA</span><div><strong>HTTP policy decision point</strong><small>Bundle deployment observation</small></div><daca-status-badge [tone]="deploymentTone(activePolicy.opaRevision)">{{ deploymentLabel(activePolicy.opaRevision) }}</daca-status-badge></article>
          <article><span class="policy-target-icon">PG</span><div><strong>PostgreSQL enforcement</strong><small>ACL + FORCE ROW LEVEL SECURITY</small></div><daca-status-badge [tone]="deploymentTone(activePolicy.postgresRevision)">{{ deploymentLabel(activePolicy.postgresRevision) }}</daca-status-badge></article>
          <p class="daca-alert is-warning">Publishing is complete only when both targets acknowledge the desired revision. Drift fails closed.</p>
        </div>
      </section>
    </div>
    }
  `,
})
export class SecurityPolicyComponent {
  readonly api = inject(CatalogApiService);
  readonly identity = inject(DemoIdentityService);
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  readonly policy = signal<PolicyDefinition | null>(null);
  readonly policyLoading = signal(true);
  readonly policyError = signal<string | null>(null);
  readonly selectedUser = signal(this.api.identityUserId());
  readonly expectedAllowed = computed(() => {
    const policy = this.policy();
    if (!policy) return false;
    const user = this.selectedUser();
    const today = new Date().toISOString().slice(0, 10);
    const grants = policy.grants ?? [];
    if (grants.length) return grants.some((grant) => grant.subject.type === 'person' && grant.subject.id === user && grant.validFrom <= today && grant.validUntil >= today && grant.protocols.includes('http'));
    return policy.subjects.includes(user);
  });
  readonly runtimeAvailable = computed(() => ['11111111-1111-4111-8111-111111111111', '9c9a0112-d4ef-57d0-862c-0d27872c82c2'].includes(this.api.product().id));
  readonly shortProductId = computed(() => this.policy() ? `${this.policy()!.resources.productId.slice(0, 8)}…` : '–');
  readonly deploymentsAligned = computed(() => {
    const policy = this.policy();
    return Boolean(policy && policy.opaRevision === policy.revision && policy.postgresRevision === policy.revision);
  });
  readonly testing = signal(false);
  readonly testState = signal<'idle' | 'allowed' | 'denied' | 'error'>('idle');
  readonly testMessage = signal('');
  readonly publishing = signal(false);
  readonly publishMessage = signal('');
  readonly publishFailed = signal(false);

  constructor() {
    this.api.selectProduct(this.route.snapshot.paramMap.get('id'));
    this.reloadPolicy();
  }

  reloadPolicy(): void {
    this.policy.set(null);
    this.policyLoading.set(true);
    this.policyError.set(null);
    this.api.loadPolicy().pipe(finalize(() => this.policyLoading.set(false))).subscribe({
      next: (policy) => this.policy.set(policy),
      error: (error: unknown) => this.policyError.set(this.policyLoadErrorMessage(error)),
    });
  }

  deploymentTone(observedRevision: number): 'green' | 'orange' | 'red' {
    return observedRevision === this.policy()?.revision ? 'green' : 'red';
  }

  deploymentLabel(observedRevision: number): string {
    return observedRevision ? `rev ${observedRevision}` : 'pending';
  }

  policySummary(): string {
    const grants = this.policy()?.grants ?? [];
    if (!grants.length) return `Keine konkrete Freigabe für ${this.api.product().title}. Default Deny bleibt aktiv.`;
    return grants.map((grant) => `${grant.subject.type === 'person' ? 'eIAM' : grant.subject.type === 'machine' ? 'Machine ID' : 'Gruppe'} ${grant.subject.id} · ${grant.protocols.map((protocol) => protocol === 'http' ? 'REST' : 'PostgreSQL').join(' & ')} · ${grant.dataVariant} · ${grant.validFrom} bis ${grant.validUntil} · ${this.availabilityLabel(grant.weeklyAvailability)}`).join('; ');
  }

  subjectSummary(): string {
    const grants = this.policy()?.grants ?? [];
    return grants.length ? grants.map((grant) => `${grant.subject.type}: ${grant.subject.id}`).join(' · ') : 'Keine Grants';
  }

  availabilitySummary(): string {
    const grants = this.policy()?.grants ?? [];
    return grants.length
      ? grants.map((grant) => `${grant.subject.id}: ${this.availabilityLabel(grant.weeklyAvailability)}`).join(' · ')
      : 'Keine Grants';
  }

  availabilityLabel(availability: WeeklyAvailability | null | undefined): string {
    if (!availability) return 'Durchgehend · 24/7';
    const dayLabels: Record<WeeklyAvailability['weekdays'][number], string> = {
      monday: 'Mo', tuesday: 'Di', wednesday: 'Mi', thursday: 'Do', friday: 'Fr', saturday: 'Sa', sunday: 'So',
    };
    return `${availability.weekdays.map((day) => dayLabels[day]).join(', ')} · ${availability.startTime}–${availability.endTime} · ${availability.timeZone}`;
  }

  publishDraft(): void {
    const policy = this.policy();
    if (!policy) return;
    this.publishing.set(true);
    this.publishFailed.set(false);
    this.publishMessage.set('');
    this.api.publishPolicy(this.api.product().id, policy.id, policy.revision).pipe(finalize(() => this.publishing.set(false))).subscribe({
      next: () => {
        this.publishMessage.set('Policy publiziert; OPA- und PostgreSQL-Projektion wurden angestossen.');
        this.reloadPolicy();
      },
      error: (error: HttpErrorResponse) => {
        this.publishFailed.set(true);
        this.publishMessage.set(error.error?.detail ?? 'Die Policy konnte nicht publiziert werden.');
      },
    });
  }

  private policyLoadErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 403) {
      return 'Sie sind nicht berechtigt, diese Policy- und Deployment-Evidenz einzusehen.';
    }
    if (error instanceof HttpErrorResponse && error.status === 404) {
      return 'Für dieses Datenprodukt ist keine sichtbare Policy-Evidenz vorhanden.';
    }
    if (error instanceof Error && error.message.includes('keine Policy-Evidenz')) return error.message;
    return 'Policy- und Deployment-Evidenz konnte nicht geladen werden. Der Status ist unbekannt.';
  }

  testEndpoint(): void {
    const user = this.selectedUser();
    const headers: Record<string, string> = user === 'anonymous' ? {} : { 'X-DaCa-User': user };
    this.testing.set(true);
    this.testMessage.set('');
    const endpoint = this.api.product().id === '9c9a0112-d4ef-57d0-862c-0d27872c82c2'
      ? '/sample-api/api/v1/daaif/estv.direct-tax-assessments.v1'
      : '/sample-api/api/v1/estv/tax-statistics';
    this.http
      .get<unknown>(endpoint, { headers, observe: 'response' })
      .pipe(finalize(() => this.testing.set(false)))
      .subscribe({
        next: (response) => {
          this.testState.set('allowed');
          this.testMessage.set(`HTTP ${response.status}: OPA allowed the request and the protected rows were returned.`);
        },
        error: (error: HttpErrorResponse) => {
          if (error.status === 401 || error.status === 403) {
            this.testState.set('denied');
            this.testMessage.set(`HTTP ${error.status}: the PEP denied access before protected data was queried.`);
          } else if (error.status === 503) {
            this.testState.set('error');
            this.testMessage.set('HTTP 503: the policy decision point is unavailable, so the PEP failed closed before querying protected data.');
          } else {
            this.testState.set('error');
            this.testMessage.set('The sample endpoint is not reachable yet. Start the Docker Compose stack and retry.');
          }
        },
      });
  }
}
