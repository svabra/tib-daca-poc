import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StatusBadgeComponent } from '@bit-daca/design-system';
import { CatalogApiService } from '../../core/catalog-api.service';

@Component({
  selector: 'daca-catalog-overview',
  standalone: true,
  imports: [RouterLink, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="daca-page-heading">
      <div>
        <p class="daca-eyebrow">Distributed Data Catalog</p>
        <h1>Govern data products with confidence</h1>
        <p>Metadata, lineage, provenance, endpoints and access policy in one revisioned catalog record.</p>
      </div>
      <daca-status-badge [tone]="api.usingFallback() ? 'orange' : 'green'">{{ api.connectionLabel() }}</daca-status-badge>
    </section>

    @if (api.usingFallback()) {
      <p class="daca-alert is-warning" role="status">
        The live catalog is starting or unavailable. Deterministic preview content is shown; mutations remain network-only.
      </p>
    }

    <section class="catalog-kpi-grid" aria-label="Catalog summary">
      <article class="catalog-kpi"><span>Data products</span><strong>{{ api.products().length }}</strong><small>1 restricted</small></article>
      <article class="catalog-kpi"><span>Policy targets</span><strong>2/2</strong><small>OPA + PostgreSQL aligned</small></article>
      <article class="catalog-kpi"><span>Lineage coverage</span><strong>100%</strong><small>3 verified relations</small></article>
      <article class="catalog-kpi"><span>Origin catalog</span><strong>ESTV</strong><small>Standalone & federation-ready</small></article>
    </section>

    <div class="catalog-overview-grid">
      <section class="daca-card catalog-product-card" aria-labelledby="featured-product-title">
        <div class="daca-card-header">
          <div>
            <p class="daca-eyebrow">Featured product</p>
            <h2 id="featured-product-title">{{ product().title }}</h2>
          </div>
          <daca-status-badge tone="red">{{ product().classification }}</daca-status-badge>
        </div>
        <div class="daca-card-body">
          <div class="catalog-product-owner">
            <span class="catalog-owner-mark">CH</span>
            <div><strong>{{ product().owner }}</strong><span>{{ product().domain }} · revision {{ product().revision }}</span></div>
          </div>
          <p>{{ product().description }}</p>
          <dl class="catalog-summary-list">
            <div><dt>Global identifier</dt><dd class="daca-code">{{ product().globalId }}</dd></div>
            <div><dt>Endpoints</dt><dd>HTTP/REST · PostgreSQL</dd></div>
            <div><dt>Update cycle</dt><dd>{{ product().updateFrequency }}</dd></div>
            <div><dt>Policy</dt><dd>PBAC · default deny</dd></div>
          </dl>
          <div class="catalog-actions">
            <a class="daca-button" routerLink="/exposure">Freigabe konfigurieren</a>
            <a class="daca-button is-secondary" routerLink="/products">Meine Datenprodukte bearbeiten</a>
            <a class="daca-button is-secondary" routerLink="/lineage">Lineage ansehen</a>
          </div>
        </div>
      </section>

      <aside class="daca-card" aria-labelledby="governance-title">
        <div class="daca-card-header"><h2 id="governance-title">Governance readiness</h2><span class="catalog-score">92</span></div>
        <div class="daca-card-body">
          <div class="catalog-readiness-row"><span>Descriptive metadata</span><meter min="0" max="100" value="96">96%</meter><strong>96%</strong></div>
          <div class="catalog-readiness-row"><span>Lineage & provenance</span><meter min="0" max="100" value="91">91%</meter><strong>91%</strong></div>
          <div class="catalog-readiness-row"><span>Endpoint contract</span><meter min="0" max="100" value="87">87%</meter><strong>87%</strong></div>
          <div class="catalog-readiness-row"><span>Access policy</span><meter min="0" max="100" value="100">100%</meter><strong>100%</strong></div>
          <div class="catalog-divider"></div>
          <p class="catalog-caption">Next review</p>
          <strong>15 September 2026</strong>
          <p class="catalog-muted">Owner: ESTV Data Office · all required controls assigned</p>
        </div>
      </aside>
    </div>

    <section class="daca-card catalog-flow-card" aria-labelledby="pbac-title">
      <div class="daca-card-header"><div><p class="daca-eyebrow">Policy-based access control</p><h2 id="pbac-title">One policy, two enforcement paths</h2></div><a routerLink="/security">Open policy studio →</a></div>
      <div class="daca-card-body catalog-flow">
        <div><span class="catalog-flow-icon">1</span><strong>Data owner / PAP</strong><small>publishes structured intent</small></div><i aria-hidden="true">→</i>
        <div><span class="catalog-flow-icon">2</span><strong>Catalog / PIP</strong><small>adds trusted attributes</small></div><i aria-hidden="true">→</i>
        <div><span class="catalog-flow-icon">3</span><strong>OPA / PDP</strong><small>decides HTTP access</small></div><i aria-hidden="true">↘</i>
        <div><span class="catalog-flow-icon">4</span><strong>PEP</strong><small>REST guard + PostgreSQL RLS</small></div>
      </div>
    </section>
  `,
})
export class CatalogOverviewComponent {
  readonly api = inject(CatalogApiService);
  readonly product = computed(() => this.api.product());
}
