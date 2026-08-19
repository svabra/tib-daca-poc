import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'daca-quality-context-graph',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure class="quality-context-graph" aria-label="Kontextgraph des Datenprodukts">
      <figcaption>
        <span>
          <strong>Beziehungsübersicht</strong>
          <small>Quelle, Verantwortung, Fachgebiet und technische Bereitstellung</small>
        </span>
        <span class="quality-context-graph-direction">
          <b aria-hidden="true">→</b>
          Pfeile zeigen die Beziehungsrichtung
        </span>
      </figcaption>

      <div class="quality-context-graph-canvas" data-testid="quality-context-graph">
        <svg
          class="quality-context-graph-edges"
          viewBox="0 0 1000 420"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <marker
              id="quality-context-arrow"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="5"
              orient="auto-start-reverse"
              markerUnits="strokeWidth"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
          </defs>
          <path data-graph-edge="source-product" d="M 160 210 L 270 210" marker-end="url(#quality-context-arrow)" />
          <path data-graph-edge="product-owner" d="M 600 210 C 690 210, 680 72, 760 72" marker-end="url(#quality-context-arrow)" />
          <path data-graph-edge="product-domain" d="M 600 210 L 760 210" marker-end="url(#quality-context-arrow)" />
          <path data-graph-edge="product-service" d="M 600 210 C 690 210, 680 348, 760 348" marker-end="url(#quality-context-arrow)" />
          <circle cx="600" cy="210" r="5" />
        </svg>

        <span class="quality-context-edge-label is-source-product">publiziert</span>
        <span class="quality-context-edge-label is-product-owner">verantwortet durch</span>
        <span class="quality-context-edge-label is-product-domain">fachlicher Kontext</span>
        <span class="quality-context-edge-label is-product-service">bereitgestellt über</span>

        <article class="quality-context-node is-source" data-graph-node="source">
          <span>Datenquelle</span>
          <strong>{{ sourceLabel() }}</strong>
        </article>
        <article class="quality-context-node is-product" data-graph-node="product">
          <span>Datenprodukt</span>
          <strong>{{ productTitle() }}</strong>
        </article>
        <article class="quality-context-node is-owner" data-graph-node="owner">
          <span>Verantwortliche Organisation</span>
          <strong>{{ ownerLabel() }}</strong>
        </article>
        <article class="quality-context-node is-domain" data-graph-node="domain">
          <span>Fachgebiet</span>
          <strong>{{ domainLabel() }}</strong>
        </article>
        <article class="quality-context-node is-service" data-graph-node="service">
          <span>Schnittstelle</span>
          <strong>{{ serviceLabel() }}</strong>
          @if (serviceDetail()) { <small>{{ serviceDetail() }}</small> }
        </article>
      </div>

      <ul class="quality-context-graph-relations" aria-label="Beziehungen im Kontextgraph">
        <li>
          <span>{{ sourceLabel() }}</span><b><small>publiziert</small><i aria-hidden="true">→</i></b><span>{{ productTitle() }}</span>
        </li>
        <li>
          <span>{{ productTitle() }}</span><b><small>verantwortet durch</small><i aria-hidden="true">→</i></b><span>{{ ownerLabel() }}</span>
        </li>
        <li>
          <span>{{ productTitle() }}</span><b><small>fachlicher Kontext</small><i aria-hidden="true">→</i></b><span>{{ domainLabel() }}</span>
        </li>
        <li>
          <span>{{ productTitle() }}</span><b><small>bereitgestellt über</small><i aria-hidden="true">→</i></b><span>{{ serviceLabel() }}</span>
        </li>
      </ul>
    </figure>
  `,
})
export class QualityContextGraphComponent {
  readonly sourceLabel = input('DAAIF');
  readonly productTitle = input.required<string>();
  readonly ownerLabel = input.required<string>();
  readonly domainLabel = input.required<string>();
  readonly serviceLabel = input('REST Data Service');
  readonly serviceDetail = input('');
}
