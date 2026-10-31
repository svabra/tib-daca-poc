import { afterNextRender, ChangeDetectionStrategy, Component, computed, effect, ElementRef, HostListener, inject, Injector, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { StatusBadgeComponent } from '@bit-daca/design-system';
import dagre from '@dagrejs/dagre';
import { CatalogApiService } from '../../core/catalog-api.service';
import { FALLBACK_EDGES, FALLBACK_NODES, FALLBACK_PROVENANCE } from '../../core/catalog.seed';
import { LineageEdge, LineageNode, ProvenanceEvent } from '../../core/catalog.models';
import { ProductWorkspaceNavComponent } from '../../shared/product-workspace-nav.component';
import { TooltipDirective } from '../../shared/tooltip.directive';
import { SearchIconComponent } from '../search/search-icon.component';

export interface PositionedNode extends LineageNode { x: number; y: number; }
export interface PositionedEdge extends LineageEdge { path: string; labelX: number; labelY: number; labelWidth: number; }
export const LINEAGE_CARD = { width: 208, height: 112 };
const KIND_ICONS = { source: 'database', transform: 'adjustments-horizontal', product: 'box', consumer: 'server' };

/** Round routed bends without discarding Dagre's obstacle-avoiding waypoints. */
function roundedPath(points: { x: number; y: number }[]): string {
  if (!points.length) return '';
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length - 1; index++) {
    const previous = points[index - 1], point = points[index], next = points[index + 1];
    const before = Math.hypot(point.x - previous.x, point.y - previous.y);
    const after = Math.hypot(next.x - point.x, next.y - point.y);
    const radius = Math.min(14, before / 2, after / 2);
    if (!before || !after) continue;
    path += ` L ${point.x - (point.x - previous.x) * radius / before} ${point.y - (point.y - previous.y) * radius / before}`;
    path += ` Q ${point.x} ${point.y} ${point.x + (next.x - point.x) * radius / after} ${point.y + (next.y - point.y) * radius / after}`;
  }
  const last = points[points.length - 1];
  return `${path} L ${last.x} ${last.y}`;
}

export function layoutLineage(nodes: readonly LineageNode[], edges: readonly LineageEdge[]) {
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 36, edgesep: 28, marginx: 24, marginy: 32 });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const node of nodes) graph.setNode(node.id, { width: LINEAGE_CARD.width, height: LINEAGE_CARD.height });
  const validEdges = edges.filter(edge => nodes.some(node => node.id === edge.source) && nodes.some(node => node.id === edge.target));
  for (const edge of validEdges) graph.setEdge(edge.source, edge.target, {
    width: Math.max(88, Math.min(210, edge.label.length * 6.5 + 24)), height: 28, labelpos: 'l', labeloffset: 12,
  }, edge.id);
  dagre.layout(graph);
  const width = Math.max(380, graph.graph().width ?? 380), height = Math.max(380, graph.graph().height ?? 380);
  const offsetY = (height - (graph.graph().height ?? height)) / 2;
  return {
    width, height,
    nodes: nodes.map(node => ({ ...node, x: graph.node(node.id).x, y: graph.node(node.id).y + offsetY })),
    edges: validEdges.map(edge => {
      const item = graph.edge(edge.source, edge.target, edge.id) as { points: {x: number; y: number}[]; x: number; y: number; width: number };
      return { ...edge, path: roundedPath(item.points.map(point => ({ x: point.x, y: point.y + offsetY }))),
        labelX: item.x!, labelY: item.y! + offsetY, labelWidth: item.width! };
    }),
  };
}

@Component({
  selector: 'daca-lineage-explorer', standalone: true,
  imports: [DatePipe, RouterLink, ProductWorkspaceNavComponent, StatusBadgeComponent, TooltipDirective, SearchIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lineage-explorer.component.html', styleUrl: './lineage-explorer.component.css',
})
export class LineageExplorerComponent {
  readonly api = inject(CatalogApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly capabilityActor = signal('');
  readonly nodes = signal<readonly LineageNode[]>(FALLBACK_NODES);
  readonly edges = signal<readonly LineageEdge[]>(FALLBACK_EDGES);
  readonly provenance = signal<readonly ProvenanceEvent[]>(FALLBACK_PROVENANCE);
  readonly selectedId = signal<string | null>(null);
  readonly displayNodes = computed(() => {
    const product = this.api.product();
    return this.nodes().map(node => node.productId === product.id ? {...node, label: product.title, detail: product.description} : node);
  });
  readonly selectedNode = computed(() => this.displayNodes().find(node => node.id === this.selectedId())
    ?? this.displayNodes().find(node => node.kind === 'product') ?? this.displayNodes()[0]);
  readonly graph = computed(() => layoutLineage(this.displayNodes(), this.edges()));
  readonly card = LINEAGE_CARD;
  readonly pulsePhases = ['0s', '-1.5s'];
  readonly edgeMenu = signal<{edge: LineageEdge; x: number; y: number} | null>(null);
  private menuTrigger: HTMLElement | SVGElement | null = null;
  readonly accessHelp = 'Zugriffsprotokolle sind nur für den aktuellen Data Owner der Quelle oder des Produkts sichtbar.';
  readonly legend = [
    { label: 'Source', kind: 'source', explanation: 'Ursprungsquelle der Daten, zum Beispiel ein Fachsystem oder eine physische Deklaration.' },
    { label: 'Transform', kind: 'transform', explanation: 'Verarbeitungsschritt, der Daten bereinigt, verbindet oder umformt.' },
    { label: 'Product', kind: 'product', explanation: 'Katalogisiertes Datenprodukt mit fachlicher Verantwortung und beschriebenen Zugriffsmöglichkeiten.' },
    { label: 'Consumer', kind: 'consumer', explanation: 'Deklarierter Nutzer der Daten, zum Beispiel eine Anwendung oder ein nachgelagertes System.' },
  ];
  readonly verifiedHelp = 'Zertifikat dieser Quelle verfügbar';
  readonly declaredHelp = 'Quelle wurde durch den Data Owner manuell deklariert';

  constructor() {
    this.api.selectProduct(this.route.snapshot.paramMap.get('id'));
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => this.selectedId.set(params.get('asset')));
    effect(onCleanup => {
      const actor = this.api.identityUserId(), productId = this.api.product().id;
      this.capabilityActor.set(''); this.edgeMenu.set(null);
      if (!productId || (this.route.snapshot.paramMap.get('id') && productId !== this.route.snapshot.paramMap.get('id'))) return;
      const subscription = untracked(() => this.api.loadLineage().subscribe(result => {
        if (actor !== this.api.identityUserId() || productId !== this.api.product().id) return;
        this.nodes.set(result.nodes); this.edges.set(result.edges); this.provenance.set(result.provenance);
        this.capabilityActor.set(actor);
      }));
      onCleanup(() => subscription.unsubscribe());
    });
  }

  focusProduct(): void { this.selectedId.set(this.nodes().find(node => node.kind === 'product')?.id ?? null); }
  openEdgeMenu(edge: LineageEdge, event: Event): void {
    event.preventDefault(); event.stopPropagation();
    this.menuTrigger = event.currentTarget as HTMLElement;
    const rect = this.menuTrigger.getBoundingClientRect();
    const x = event instanceof MouseEvent ? event.clientX : rect.left + rect.width / 2;
    const y = event instanceof MouseEvent ? event.clientY : rect.top + rect.height / 2;
    this.edgeMenu.set({edge, x: Math.max(12, Math.min(x, document.documentElement.clientWidth - 322)), y: Math.max(12, Math.min(y, innerHeight - 150))});
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('.lineage-edge-menu a, .lineage-edge-menu [tabindex="0"]')?.focus(), {injector: this.injector});
  }
  canOpenLogs(edge: LineageEdge): boolean { return edge.canViewAccessLogs === true && this.capabilityActor() === this.api.identityUserId(); }
  @HostListener('document:pointerdown', ['$event'])
  dismissMenu(event: PointerEvent): void {
    if (!(event.target as Element)?.closest?.('.lineage-edge-menu')) this.edgeMenu.set(null);
  }
  @HostListener('document:keydown.escape')
  escapeMenu(): void { if (this.edgeMenu()) { this.edgeMenu.set(null); this.menuTrigger?.focus(); } }
  kindLabel(kind: LineageNode['kind']): string { return ({ source: 'Source', transform: 'Transform', product: 'Product', consumer: 'Consumer' })[kind]; }
  icon(kind: LineageNode['kind']): string { return KIND_ICONS[kind]; }
  urn(node: LineageNode): string { return node.urn || (node.id.startsWith('urn:') ? node.id : `urn:daca:lineage:${node.id}`); }
  owner(node: LineageNode): string {
    const product = this.api.product();
    if (node.productId === product.id) return this.api.identityUsers().find(user => user.id === product.ownerUserId)?.displayName || product.owner || 'Nicht erfasst';
    return node.owner || 'Nicht erfasst';
  }
  routeFor(node: LineageNode): string[] {
    return node.productId ? ['/products', node.productId, 'overview'] : ['/products', this.api.product().id, 'lineage'];
  }
  paramsFor(node: LineageNode): Record<string, string> { return node.productId ? {} : { asset: node.id }; }
  linkLabel(node: LineageNode): string {
    return ({ source: 'Quelle öffnen', transform: 'Transformation öffnen', product: 'Datenprodukt öffnen', consumer: 'Consumer öffnen' })[node.kind];
  }
  edgeHelp(edge: LineageEdge): string {
    const source = this.nodes().find(node => node.id === edge.source)?.label ?? edge.source;
    const target = this.nodes().find(node => node.id === edge.target)?.label ?? edge.target;
    return `Datenfluss: ${source} → ${target}. ${edge.label}. ${edge.state === 'verified' ? this.verifiedHelp : this.declaredHelp}`;
  }
}
