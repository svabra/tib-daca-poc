import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { StatusBadgeComponent } from '@bit-didaca/design-system';
import { finalize } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { FALLBACK_POLICY } from '../../core/catalog.seed';
import { PolicyDefinition } from '../../core/catalog.models';

@Component({
  selector: 'didaca-security-policy',
  standalone: true,
  imports: [FormsModule, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="didaca-page-heading">
      <div>
        <p class="didaca-eyebrow">Mockup 03 · Security & access</p>
        <h1>Policy-based access control</h1>
        <p>Data owners publish one structured intent; DaCa distributes and verifies HTTP and PostgreSQL enforcement.</p>
      </div>
      <didaca-status-badge [tone]="api.policyUsingFallback() ? 'orange' : deploymentsAligned() ? 'green' : 'red'">
        {{ api.policyUsingFallback() ? 'Demo policy preview' : 'Policy revision ' + policy().revision + ' · ' + policy().state }}
      </didaca-status-badge>
    </section>

    @if (api.policyUsingFallback()) {
      <p class="didaca-alert is-warning" role="status">The policy API is unavailable. The clearly labelled deterministic demo definition below is not deployment evidence.</p>
    }

    <div class="security-layout">
      <section class="didaca-card policy-editor" aria-labelledby="policy-definition-title">
        <div class="didaca-card-header"><div><p class="didaca-eyebrow">Canonical definition</p><h2 id="policy-definition-title">Who may access this product?</h2></div><span class="policy-readonly">Structured policy</span></div>
        <div class="didaca-card-body">
          <div class="policy-sentence" aria-label="Readable policy summary">
            <span>ALLOW</span>
            <p>subject <strong>kanton-st-gallen</strong> to <strong>data.read</strong> the product <strong>{{ api.product().title }}</strong> owned by <strong>ESTV</strong> over <strong>HTTP or PostgreSQL</strong>.</p>
          </div>
          <div class="policy-builder-grid">
            <div><span>Effect</span><strong class="is-allow">Allow</strong></div>
            <div><span>Subject selector</span><strong>id = kanton-st-gallen</strong></div>
            <div><span>Resource selectors</span><strong>owner = ESTV<br>productId = {{ shortProductId() }}</strong></div>
            <div><span>Action</span><strong>data.read</strong></div>
            <div><span>Protocols</span><strong>HTTP · PostgreSQL</strong></div>
            <div><span>Default</span><strong class="is-deny">Deny all unmatched requests</strong></div>
          </div>
          <p class="didaca-alert">Resource owner and classification are enriched from the trusted catalog PIP; callers cannot override them.</p>
        </div>
      </section>

      <aside class="didaca-card policy-test-panel" aria-labelledby="policy-test-title">
        <div class="didaca-card-header"><h2 id="policy-test-title">Live decision test</h2><span class="demo-badge">Demo identity</span></div>
        <div class="didaca-card-body">
          <label>Act as user
            <select [ngModel]="selectedUser()" (ngModelChange)="selectedUser.set($event); testState.set('idle')">
              <option value="kanton-st-gallen">kanton-st-gallen</option>
              <option value="kanton-bern">kanton-bern</option>
              <option value="anonymous">anonymous / no identity</option>
            </select>
          </label>
          <div class="policy-local-decision" [class.is-allowed]="expectedAllowed()">
            <span>{{ expectedAllowed() ? 'ALLOW' : 'DENY' }}</span>
            <strong>{{ expectedAllowed() ? 'Policy selectors match' : 'Default-deny applies' }}</strong>
          </div>
          <button class="didaca-button" type="button" [disabled]="testing()" (click)="testEndpoint()">
            {{ testing() ? 'Calling PEP…' : 'Test protected REST endpoint' }}
          </button>
          @if (testMessage()) {
            <p class="didaca-alert" [class.is-error]="testState() === 'denied' || testState() === 'error'">{{ testMessage() }}</p>
          }
          <a class="policy-endpoint-link" href="http://localhost:8003/docs" target="_blank" rel="noreferrer">Open sample product API docs ↗</a>
          <small class="policy-demo-warning">The X-DiDaCa-User header is for local demonstration only, never production identity.</small>
        </div>
      </aside>
    </div>

    <section class="didaca-card policy-flow-card" aria-labelledby="policy-flow-title">
      <div class="didaca-card-header"><div><p class="didaca-eyebrow">PBAC runtime</p><h2 id="policy-flow-title">Publication and enforcement flow</h2></div><didaca-status-badge [tone]="api.policyUsingFallback() ? 'orange' : deploymentsAligned() ? 'green' : 'red'">{{ api.policyUsingFallback() ? 'Preview only' : deploymentsAligned() ? 'Targets aligned' : 'Deployment drift' }}</didaca-status-badge></div>
      <div class="didaca-card-body policy-flow">
        <div><span>PAP</span><strong>Data owner</strong><small>structured intent</small></div><i>→</i>
        <div><span>PIP</span><strong>DaCa catalog</strong><small>owner · product · class</small></div><i>→</i>
        <div><span>PDP</span><strong>OPA bundle</strong><small>revision {{ policy().opaRevision }}</small></div><i>→</i>
        <div class="policy-flow-split"><span>PEP</span><strong>REST guard</strong><small>per-request decision</small><b>or</b><strong>PostgreSQL RLS</strong><small>projected entitlement</small></div>
      </div>
    </section>

    <div class="security-bottom-grid">
      <section class="didaca-card">
        <div class="didaca-card-header"><h2>Generated Rego</h2><span>Read-only compiler output</span></div>
        <pre class="policy-code"><code>{{ policy().generatedRego }}</code></pre>
      </section>
      <section class="didaca-card">
        <div class="didaca-card-header"><h2>Deployment status</h2><span>Desired revision {{ policy().revision }}</span></div>
        <div class="didaca-card-body policy-targets">
          <article><span class="policy-target-icon">OPA</span><div><strong>HTTP policy decision point</strong><small>{{ api.policyUsingFallback() ? 'No live deployment observation' : 'Bundle deployment observation' }}</small></div><didaca-status-badge [tone]="deploymentTone(policy().opaRevision)">{{ deploymentLabel(policy().opaRevision) }}</didaca-status-badge></article>
          <article><span class="policy-target-icon">PG</span><div><strong>PostgreSQL enforcement</strong><small>{{ api.policyUsingFallback() ? 'No live deployment observation' : 'ACL + FORCE ROW LEVEL SECURITY' }}</small></div><didaca-status-badge [tone]="deploymentTone(policy().postgresRevision)">{{ deploymentLabel(policy().postgresRevision) }}</didaca-status-badge></article>
          <p class="didaca-alert is-warning">Publishing is complete only when both targets acknowledge the desired revision. Drift fails closed.</p>
        </div>
      </section>
    </div>
  `,
})
export class SecurityPolicyComponent {
  readonly api = inject(CatalogApiService);
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  readonly policy = signal<PolicyDefinition>(FALLBACK_POLICY);
  readonly selectedUser = signal('kanton-st-gallen');
  readonly expectedAllowed = computed(() => this.selectedUser() === 'kanton-st-gallen');
  readonly shortProductId = computed(() => `${this.policy().resources.productId.slice(0, 8)}…`);
  readonly deploymentsAligned = computed(() =>
    !this.api.policyUsingFallback()
      && this.policy().opaRevision === this.policy().revision
      && this.policy().postgresRevision === this.policy().revision,
  );
  readonly testing = signal(false);
  readonly testState = signal<'idle' | 'allowed' | 'denied' | 'error'>('idle');
  readonly testMessage = signal('');

  constructor() {
    this.api.selectProduct(this.route.snapshot.paramMap.get('id'));
    this.api.loadPolicy().subscribe((policy) => this.policy.set(policy));
  }

  deploymentTone(observedRevision: number): 'green' | 'orange' | 'red' {
    if (this.api.policyUsingFallback()) return 'orange';
    return observedRevision === this.policy().revision ? 'green' : 'red';
  }

  deploymentLabel(observedRevision: number): string {
    return this.api.policyUsingFallback() ? 'preview' : observedRevision ? `rev ${observedRevision}` : 'pending';
  }

  testEndpoint(): void {
    const user = this.selectedUser();
    const headers: Record<string, string> = user === 'anonymous' ? {} : { 'X-DiDaCa-User': user };
    this.testing.set(true);
    this.testMessage.set('');
    this.http
      .get<unknown>('http://localhost:8003/api/v1/estv/tax-statistics', { headers, observe: 'response' })
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
