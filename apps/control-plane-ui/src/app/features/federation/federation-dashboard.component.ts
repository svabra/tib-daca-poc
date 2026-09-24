import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StatusBadgeComponent } from '@bit-daca/design-system';
import { ControlPlaneApiService } from '../../core/control-plane-api.service';

@Component({
  selector: 'daca-federation-dashboard',
  standalone: true,
  imports: [RouterLink, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="daca-page-heading">
      <div>
        <p class="daca-eyebrow">Central Data Catalog · operations</p>
        <h1>Central catalog status</h1>
        <p>Observe DaCa operations and review historical PoC configuration records. The central catalog is the authoritative metadata store.</p>
      </div>
      <daca-status-badge [tone]="api.eventStreamConnected() ? 'green' : api.usingFallback() ? 'orange' : 'blue'">
        {{ api.eventStreamConnected() ? 'Health SSE connected' : api.usingFallback() ? 'Preview topology' : 'Health polling active' }}
      </daca-status-badge>
    </section>

    @if (api.usingFallback()) {
      <p class="daca-alert is-warning">The control-plane API is starting or unavailable. A deterministic operations preview is displayed and controls do not mutate local data.</p>
    }

    <section class="control-kpis" aria-label="Catalog operations status">
      <article><span>PoC catalog records</span><strong>{{ api.catalogs().length }}</strong><small>{{ healthyCount() }} healthy · {{ degradedCount() }} needs attention</small></article>
      <article><span>PoC trust records</span><strong>{{ approvedGrants() }}</strong><small>{{ api.trustGrants().length }} historical grants total</small></article>
      <article><span>PoC sync records</span><strong>{{ enabledSyncs() }}</strong><small>Historical configuration only</small></article>
      <article><span>Recorded config drift</span><strong>{{ driftCount() }}</strong><small>desired ≠ observed revision</small></article>
    </section>

    <div class="federation-main-grid">
      <section class="daca-card topology-card" aria-labelledby="topology-title">
        <div class="daca-card-header">
          <div><p class="daca-eyebrow">Historical PoC topology</p><h2 id="topology-title">Prototype catalog records</h2></div>
          <div class="topology-legend"><span><i></i>Approved</span><span><i class="is-draft"></i>Draft</span></div>
        </div>
        <div class="topology-canvas">
          <svg viewBox="0 0 900 500" role="img" aria-labelledby="topology-title topology-description">
            <desc id="topology-description">ESTV and Kanton St. Gallen have bilateral directed trust. ESTV has a draft grant to the BIT integration catalog.</desc>
            <defs><marker id="trust-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" /></marker></defs>
            <path class="topology-link" d="M330 205 C430 125 520 125 610 198" marker-end="url(#trust-arrow)" />
            <text class="topology-label" x="463" y="134">metadata · lineage · provenance</text>
            <path class="topology-link is-reverse" d="M603 241 C510 312 421 312 333 245" marker-end="url(#trust-arrow)" />
            <text class="topology-label" x="468" y="322">metadata · lineage</text>
            <path class="topology-link is-draft" d="M285 284 C318 385 420 411 523 404" marker-end="url(#trust-arrow)" />
            <text class="topology-label" x="393" y="400">metadata · draft</text>

            <g class="catalog-node is-estv" transform="translate(90 150)">
              <rect width="240" height="135" rx="3"/><rect class="node-accent" width="6" height="135"/>
              <circle cx="43" cy="45" r="24"/><text class="node-monogram" x="43" y="50">E</text>
              <text class="node-title" x="78" y="39">ESTV Data Catalog</text><text class="node-org" x="78" y="58">Federal · production</text>
              <circle class="node-health is-healthy" cx="27" cy="101" r="6"/><text class="node-status" x="41" y="105">Healthy · 42 ms</text>
              <text class="node-revision" x="182" y="105">rev 12/12</text>
            </g>
            <g class="catalog-node is-sg" transform="translate(610 150)">
              <rect width="240" height="135" rx="3"/><rect class="node-accent" width="6" height="135"/>
              <circle cx="43" cy="45" r="24"/><text class="node-monogram" x="43" y="50">SG</text>
              <text class="node-title" x="78" y="39">St. Gallen Catalog</text><text class="node-org" x="78" y="58">Canton · production</text>
              <circle class="node-health is-healthy" cx="27" cy="101" r="6"/><text class="node-status" x="41" y="105">Healthy · 58 ms</text>
              <text class="node-revision" x="188" y="105">rev 8/8</text>
            </g>
            <g class="catalog-node is-bit" transform="translate(520 350)">
              <rect width="240" height="135" rx="3"/><rect class="node-accent" width="6" height="135"/>
              <circle cx="43" cy="45" r="24"/><text class="node-monogram" x="43" y="50">BIT</text>
              <text class="node-title" x="78" y="39">BIT Integration</text><text class="node-org" x="78" y="58">Federal · integration</text>
              <circle class="node-health is-degraded" cx="27" cy="101" r="6"/><text class="node-status" x="41" y="105">Degraded · 318 ms</text>
              <text class="node-revision is-drift" x="176" y="105">rev 20/21</text>
            </g>
          </svg>
        </div>
        <div class="topology-footer"><span>Arrows depict historical PoC grants; DaCa operates as a central catalog.</span><a routerLink="/trust">Review trust records →</a></div>
      </section>

      <aside class="federation-side-stack">
        <section class="daca-card">
          <div class="daca-card-header"><h2>Attention required</h2><span class="attention-count">2</span></div>
          <div class="daca-card-body attention-list">
            <article><span class="attention-icon is-warning">!</span><div><strong>BIT configuration drift</strong><p>Observed revision 20, desired 21.</p><small>Detected 20 minutes ago</small></div></article>
            <article><span class="attention-icon is-info">i</span><div><strong>Trust approval pending</strong><p>ESTV → BIT metadata grant is draft.</p><small>No sync can be enabled yet</small></div></article>
          </div>
        </section>
        <section class="daca-card">
          <div class="daca-card-header"><h2>Prototype configuration rules</h2><daca-status-badge [tone]="api.usingFallback() ? 'orange' : 'green'">{{ api.usingFallback() ? 'Preview rules' : 'Stored' }}</daca-status-badge></div>
          <div class="daca-card-body guardrail-list">
            <p><span>✓</span><strong>Directed trust required</strong><small>Every route needs a matching approved grant.</small></p>
            <p><span>✓</span><strong>Origin always wins</strong><small>Consumers cannot overwrite origin records.</small></p>
            <p><span>✓</span><strong>Policies excluded by default</strong><small>Explicit opt-in is required per grant and route.</small></p>
          </div>
        </section>
      </aside>
    </div>

    <section class="daca-card control-activity-card" aria-labelledby="control-activity-title">
      <div class="daca-card-header"><h2 id="control-activity-title">Recent control-plane observations</h2><span>{{ api.usingFallback() ? 'Deterministic preview · not operational evidence' : 'Read-only operational evidence' }}</span></div>
      <div class="daca-table-wrap">
        <table class="daca-table">
          <thead><tr><th>Time</th><th>Instance</th><th>Observation</th><th>Revision</th><th>Status</th></tr></thead>
          <tbody>
            <tr><td>09:14:22</td><td>ESTV Data Catalog</td><td>Health probe completed</td><td>12 / 12</td><td><daca-status-badge [tone]="api.usingFallback() ? 'orange' : 'green'">{{ api.usingFallback() ? 'Preview healthy' : 'Healthy' }}</daca-status-badge></td></tr>
            <tr><td>09:13:54</td><td>BIT Integration Catalog</td><td>Desired configuration not observed</td><td>20 / 21</td><td><daca-status-badge tone="orange">{{ api.usingFallback() ? 'Preview drift' : 'Drift' }}</daca-status-badge></td></tr>
            <tr><td>08:30:05</td><td>ESTV Data Catalog</td><td>Policy deployment acknowledged</td><td>3 / 3</td><td><daca-status-badge [tone]="api.usingFallback() ? 'orange' : 'green'">{{ api.usingFallback() ? 'Preview aligned' : 'Aligned' }}</daca-status-badge></td></tr>
          </tbody>
        </table>
      </div>
    </section>
  `,
})
export class FederationDashboardComponent {
  readonly api = inject(ControlPlaneApiService);
  readonly healthyCount = computed(() => this.api.catalogs().filter((catalog) => catalog.health === 'healthy').length);
  readonly degradedCount = computed(() => this.api.catalogs().filter((catalog) => catalog.health !== 'healthy').length);
  readonly approvedGrants = computed(() => this.api.trustGrants().filter((grant) => grant.state === 'approved').length);
  readonly enabledSyncs = computed(() => this.api.syncConfigurations().filter((sync) => sync.enabled).length);
  readonly driftCount = computed(() => this.api.catalogs().filter((catalog) => catalog.desiredRevision !== catalog.observedRevision).length);
}
