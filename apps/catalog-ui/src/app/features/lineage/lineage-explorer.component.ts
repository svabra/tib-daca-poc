import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { StatusBadgeComponent } from '@bit-didaca/design-system';
import dagre from '@dagrejs/dagre';
import { CatalogApiService } from '../../core/catalog-api.service';
import { FALLBACK_EDGES, FALLBACK_NODES, FALLBACK_PROVENANCE } from '../../core/catalog.seed';
import { LineageEdge, LineageNode, ProvenanceEvent } from '../../core/catalog.models';
import { ProductWorkspaceNavComponent } from '../../shared/product-workspace-nav.component';

interface PositionedNode extends LineageNode { x: number; y: number; }
interface PositionedEdge extends LineageEdge { path: string; labelX: number; labelY: number; }

@Component({
  selector: 'didaca-lineage-explorer',
  standalone: true,
  imports: [DatePipe, ProductWorkspaceNavComponent, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <didaca-product-workspace-nav
      [productId]="api.product().id"
      [productTitle]="api.product().title"
      activeSection="lineage"
    />

    <section class="didaca-page-heading">
      <div>
        <p class="didaca-eyebrow">Datenprodukt · Herkunft</p>
        <h1>Lineage & Provenienz</h1>
        <p>Nachvollziehbare Quellen, Transformationen und deklarierte Konsumenten über Kataloggrenzen hinweg.</p>
      </div>
      <didaca-status-badge tone="green">{{ edges().length }} relations · current</didaca-status-badge>
    </section>

    <div class="lineage-toolbar didaca-card">
      <div class="lineage-legend" aria-label="Lineage legend">
        <span><i class="is-source"></i>Source</span><span><i class="is-transform"></i>Transform</span>
        <span><i class="is-product"></i>Product</span><span><i class="is-consumer"></i>Consumer</span>
        <span><b></b>Verified</span><span><b class="is-declared"></b>Declared</span>
      </div>
      <div class="lineage-controls"><button type="button" class="didaca-button is-secondary" (click)="focusProduct()">Focus product</button><span>Layout: left → right</span></div>
    </div>

    <div class="lineage-layout">
      <section class="didaca-card lineage-canvas-card" aria-labelledby="lineage-graph-title">
        <div class="didaca-card-header"><div><p class="didaca-eyebrow">Cross-catalog graph</p><h2 id="lineage-graph-title">{{ api.product().title }}</h2></div><span>Native SVG · Dagre layout</span></div>
        <div class="lineage-canvas">
          <svg viewBox="0 0 1000 430" role="img" aria-labelledby="lineage-graph-title lineage-graph-description">
            <desc id="lineage-graph-description">Data flows from cantonal aggregates through ESTV harmonisation to the tax statistics product and the authorised St. Gallen consumer.</desc>
            <defs>
              <marker id="lineage-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker>
              <filter id="node-shadow"><feDropShadow dx="0" dy="4" stdDeviation="5" flood-opacity=".12" /></filter>
            </defs>
            @for (edge of positionedEdges(); track edge.id) {
              <path class="lineage-edge" [class.is-declared]="edge.state === 'declared'" [attr.d]="edge.path" marker-end="url(#lineage-arrow)" />
              <text class="lineage-edge-label" [attr.x]="edge.labelX" [attr.y]="edge.labelY">{{ edge.label }}</text>
            }
            @for (node of positionedNodes(); track node.id) {
              <g
                class="lineage-node"
                [class.is-selected]="selectedNode().id === node.id"
                [attr.transform]="'translate(' + (node.x - 91) + ' ' + (node.y - 52) + ')'"
                role="button"
                tabindex="0"
                [attr.aria-label]="node.label + ', ' + node.kind"
                (click)="selectedNode.set(node)"
                (keydown.enter)="selectedNode.set(node)"
              >
                <rect width="182" height="104" rx="2" filter="url(#node-shadow)" />
                <rect class="lineage-node-accent" width="5" height="104" />
                <text class="lineage-node-kind" x="19" y="27">{{ node.kind }}</text>
                <text class="lineage-node-title" x="19" y="53">{{ node.label }}</text>
                <text class="lineage-node-catalog" x="19" y="79">{{ node.catalog }}</text>
              </g>
            }
          </svg>
        </div>
      </section>

      <aside class="didaca-card lineage-detail">
        <div class="didaca-card-header"><h2>Selected asset</h2><didaca-status-badge tone="blue">{{ selectedNode().kind }}</didaca-status-badge></div>
        <div class="didaca-card-body">
          <div class="lineage-detail-icon">{{ selectedNode().kind.slice(0, 1).toUpperCase() }}</div>
          <h3>{{ selectedNode().label }}</h3>
          <p>{{ selectedNode().detail }}</p>
          <dl class="metadata-definition-list">
            <div><dt>Catalog</dt><dd>{{ selectedNode().catalog }}</dd></div>
            <div><dt>Stable ID</dt><dd class="didaca-code">urn:didaca:lineage:{{ selectedNode().id }}</dd></div>
            <div><dt>Trust</dt><dd>Origin attested</dd></div>
          </dl>
        </div>
      </aside>
    </div>

    <section class="didaca-card provenance-card" aria-labelledby="provenance-title">
      <div class="didaca-card-header"><div><p class="didaca-eyebrow">Append-only evidence</p><h2 id="provenance-title">Provenance timeline</h2></div><didaca-status-badge tone="green">Signed chain intact</didaca-status-badge></div>
      <div class="didaca-card-body provenance-timeline">
        @for (event of provenance(); track event.id; let first = $first) {
          <article [class.is-latest]="first">
            <div class="provenance-marker"></div>
            <time [attr.datetime]="event.occurredAt">{{ event.occurredAt | date: 'dd MMM yyyy · HH:mm' }} UTC</time>
            <div><strong>{{ event.type }}</strong><p>{{ event.summary }}</p><small>{{ event.actor }} · Evidence <code>{{ event.evidence }}</code></small></div>
          </article>
        }
      </div>
    </section>
  `,
})
export class LineageExplorerComponent {
  readonly api = inject(CatalogApiService);
  private readonly route = inject(ActivatedRoute);
  readonly nodes = signal<readonly LineageNode[]>(FALLBACK_NODES);
  readonly edges = signal<readonly LineageEdge[]>(FALLBACK_EDGES);
  readonly provenance = signal<readonly ProvenanceEvent[]>(FALLBACK_PROVENANCE);
  readonly selectedNode = signal<LineageNode>(FALLBACK_NODES[2]);

  readonly positionedNodes = computed<readonly PositionedNode[]>(() => this.layout().nodes);
  readonly positionedEdges = computed<readonly PositionedEdge[]>(() => this.layout().edges);

  constructor() {
    this.api.selectProduct(this.route.snapshot.paramMap.get('id'));
    this.api.loadLineage().subscribe((result) => {
      this.nodes.set(result.nodes.length > 0 ? result.nodes : FALLBACK_NODES);
      this.edges.set(result.edges.length > 0 ? result.edges : FALLBACK_EDGES);
      this.provenance.set(result.provenance.length > 0 ? result.provenance : FALLBACK_PROVENANCE);
      this.focusProduct();
    });
  }

  focusProduct(): void {
    this.selectedNode.set(this.nodes().find((node) => node.kind === 'product') ?? this.nodes()[0] ?? FALLBACK_NODES[2]);
  }

  private layout(): { nodes: PositionedNode[]; edges: PositionedEdge[] } {
    const graph = new dagre.graphlib.Graph();
    graph.setGraph({ rankdir: 'LR', nodesep: 55, ranksep: 65, marginx: 90, marginy: 80 });
    graph.setDefaultEdgeLabel(() => ({}));
    for (const node of this.nodes()) graph.setNode(node.id, { width: 182, height: 104 });
    for (const edge of this.edges()) graph.setEdge(edge.source, edge.target, { id: edge.id });
    dagre.layout(graph);

    const nodes = this.nodes().map((node) => {
      const position = graph.node(node.id) as { x: number; y: number };
      return { ...node, x: position.x, y: position.y };
    });
    const edges = this.edges().map((edge) => {
      const layoutEdge = graph.edge(edge.source, edge.target) as { points: { x: number; y: number }[]; x?: number; y?: number };
      const points = layoutEdge.points;
      const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
      const midpoint = points[Math.floor(points.length / 2)] ?? { x: 0, y: 0 };
      const labelX = Number.isFinite(layoutEdge.x) ? layoutEdge.x! : midpoint.x;
      const labelY = Number.isFinite(layoutEdge.y) ? layoutEdge.y! - 9 : midpoint.y - 9;
      return { ...edge, path, labelX, labelY };
    });
    return { nodes, edges };
  }
}
