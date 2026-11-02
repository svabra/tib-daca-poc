import { OrganizationCardContentComponent } from '../../shared/organization-card-content.component';
import { catalogCopy } from '../../core/catalog-localization';
import { CATALOG_COPY } from '../../core/catalog-copy';
import { HttpClient } from '@angular/common/http';
import { NgTemplateOutlet } from '@angular/common';
import { afterNextRender, afterRenderEffect, ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, HostListener, inject, Injector, signal, untracked, viewChild, viewChildren } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { UserPreferencesService } from '../../core/user-preferences.service';
import { optimizeOrganizationNetwork, NetworkPlacement, OrganizationLayoutEdge } from './organization-network-layout';
import { SearchIconComponent } from '../search/search-icon.component';
import { TooltipDirective } from '../../shared/tooltip.directive';
import { ORGANIZATION_BOUNDARY, ORGANIZATION_CARD, ORGANIZATION_FIELD, ORGANIZATION_OVERVIEW_FIELD, ORGANIZATION_TITLE, ORGANIZATION_ANCHOR_Y_OFFSET, OrganizationExclusion, OrganizationField, organizationFieldForHeading, clearsOrganizationHeading, clearsOrganizationBoundary, constrainOrganizationSatellite, organizationSatellite, scatterOrganizations, groupOrganizationDomains } from './organization-layout';
import { emptyOrganizationConfiguration, OrganizationConfiguration, OrganizationView } from './organization-view';
import { organizationCountLabel } from './organization-count-labels';
import { organizationFlow } from './organization-flow';
import { organizationHighway, organizationHighwayFlight, HighwayObstacle, HighwayHalfSize } from './organization-highway';
import { highwayPacketHalfSize } from '../../shared/data-highway';
import { CanvasSelectionAdapter, CanvasSelectionDirective } from '../../shared/canvas-selection.directive';

export interface OrganizationNode {
  id: string; parentId: string | null; code: string; label: string; kind: string;
  description: string; registry: boolean; productCount: number; directProductCount: number; domainIds: string[];
  consumedProductCount: number; directConsumedProductCount: number;
  objectKeys?: string[];
  localizations?: Partial<Record<'de'|'fr'|'it'|'en'|'rm', {label:string;code:string;description:string}>>;
}
export interface OrganizationNetwork {
  homeId: string | null; ownOrganizationId: string | null; nodes: OrganizationNode[]; satelliteIds: string[];
  domains: { id: string; label: string; description: string; organizationIds: string[]; productCount: number; objectKeys?: string[] }[];
  relations: { sourceId: string; targetId: string; count: number; inferred: boolean; evidence: string[] }[];
}
type Position = { x: number; y: number };
let organizationCanvasSequence = 0;

@Component({
  selector: 'daca-organization-canvas', standalone: true, imports: [NgTemplateOutlet,OrganizationCardContentComponent,CanvasSelectionDirective,RouterLink, TooltipDirective, SearchIconComponent],
  host: {'[class.is-bit-power-ready]':'bitPowerHeld()'},
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './organization-canvas.component.html', styleUrls: ['./organization-canvas.component.css', '../../shared/data-highway.css', '../../shared/canvas-context-menu.css','../../shared/canvas-controls.css'],
})
export class OrganizationCanvasComponent {
  readonly bitPowerHeld = signal(false);
  @HostListener('document:keyup', ['$event'])
  bitPowerKeyUp(event:KeyboardEvent):void { this.bitPowerHeld.set(event.ctrlKey); }
  @HostListener('window:blur') clearBitPower():void { this.bitPowerHeld.set(false); }
  @HostListener('document:visibilitychange') hideBitPower():void {
    if(document.visibilityState!=='visible')this.clearBitPower();
  }
  readonly packetTailId = `org-highway-tail-${++organizationCanvasSequence}`;
  readonly organizationCard=ORGANIZATION_CARD;
  readonly organizationBoundary=ORGANIZATION_BOUNDARY;
  private selectionObjects(){return [...this.offices().map(item=>({...item,id:item.node.id,kind:'offices' as const})),...this.domainBubbles().map(item=>({...item,kind:'offices' as const})),...this.satellites().map(item=>({...item,id:item.node.id,kind:'satellites' as const,width:ORGANIZATION_CARD.width,height:ORGANIZATION_CARD.height}))];}
  readonly selection:CanvasSelectionAdapter={
    context:()=>this.identity.userId()+':'+this.scopeKey(),enabled:()=>this.canArrange(),
    scale:()=>{const rect=this.stage()?.nativeElement.getBoundingClientRect();return{x:(rect?.width||960)/960,y:(rect?.height||650)/650};},
    items:()=>this.selectionObjects().map(item=>({...item,minX:item.width/2+8,minY:item.height/2+8,maxX:(item.kind==='offices'?this.officeField().width:960)-item.width/2-8,maxY:(item.kind==='offices'?Math.max(this.officeField().height,...this.layout().map(node=>node.y+node.height/2+8)):650)-item.height/2-8})),
    accepts:items=>items.every(item=>{const object=this.selectionObjects().find(object=>object.id===item.id);if(!object)return true;return object.kind==='satellites'?clearsOrganizationBoundary({...item,width:object.width,height:object.height}):!this.focus()||clearsOrganizationHeading({...item,width:object.width,height:object.height},this.officeField());}),
    begin:()=>{const before=this.draft(),objects=this.selectionObjects(),scope=this.scopeKey(),current=before.scopes[scope]??{offices:{},satellites:{}};
      this.closeMenu();this.tooltips().forEach(tooltip=>tooltip.close());
      this.draft.set({schemaVersion:1,scopes:{...before.scopes,[scope]:{offices:{...current.offices,...Object.fromEntries(objects.filter(item=>item.kind==='offices').map(item=>[item.id,{x:item.x,y:item.y-(this.focus()?ORGANIZATION_ANCHOR_Y_OFFSET:0)}]))},satellites:{...current.satellites,...Object.fromEntries(objects.filter(item=>item.kind==='satellites').map(item=>[item.id,{x:item.x,y:item.y}]))}}}});return before;},
    move:items=>{const objects=new Map(this.selectionObjects().map(item=>[item.id,item])),scope=this.scopeKey(),current=this.draft().scopes[scope]??{offices:{},satellites:{}};
      const offices={...current.offices},satellites={...current.satellites};
      for(const item of items){const object=objects.get(item.id);if(object)(object.kind==='offices'?offices:satellites)[item.id]={x:item.x,y:item.y-(object.kind==='offices'&&this.focus()?ORGANIZATION_ANCHOR_Y_OFFSET:0)};}
      this.draft.update(value=>({schemaVersion:1,scopes:{...value.scopes,[scope]:{offices,satellites}}}));this.notice.set('');},
    finish:()=>{},cancel:snapshot=>this.draft.set(snapshot as OrganizationConfiguration),
  };
  private readonly http = inject(HttpClient);
  private readonly identity = inject(DemoIdentityService);
  private readonly preferences = inject(UserPreferencesService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly stage = viewChild<ElementRef<HTMLElement>>('stage');
  private readonly explorer = viewChild<ElementRef<HTMLElement>>('explorer');
  private readonly tooltips = viewChildren(TooltipDirective);
  private readonly childPositions = signal(new Map<string, Position>());
  private readonly cardSizes = signal(new Map<string, {width:number;height:number}>());
  private readonly measuredHeading = signal<{focusId:string;language:string;rect:OrganizationExclusion}|null>(null);
  readonly headingArea = computed(()=>{
    const measured=this.measuredHeading();
    return measured?.focusId===this.focusId()&&measured.language===this.preferences.language()?measured.rect:ORGANIZATION_TITLE;
  });
  private readonly focusTitle = signal<{ center: Position; halfWidth: number; halfHeight: number } | null>(null);
  private readonly fallbackTitlePosition: Position = { x: 480, y: 130 };
  private request?: Subscription;
  private generation = 0;
  private viewportWidth = 0;
  private menuTrigger?: HTMLElement;
  private viewRequest?: Subscription;
  private saveRequest?: Subscription;
  private bodyOverflow = '';
  private fullscreenTrigger?: HTMLElement;
  private ignoreClick = false;
  private drag: { id: string; kind: 'offices' | 'satellites'; pointerId: number; target: HTMLElement; start: Position; origin: Position; before: OrganizationConfiguration; moved: boolean; width: number; height: number } | null = null;
  readonly draggingId = signal<string | null>(null);
  readonly fullscreen = signal(false);
  private readonly viewportSize = signal({ width: 0, height: 0 });
  readonly fullscreenStageWidth = computed(() => Math.max(680, Math.min(this.viewportSize().width, this.viewportSize().height * 960 / 650)));
  readonly savedView = signal<OrganizationView | null>(null);
  readonly draft = signal<OrganizationConfiguration>(emptyOrganizationConfiguration());
  readonly viewLoading = signal(true);
  readonly saving = signal(false);
  readonly layoutError = signal('');
  readonly notice = signal('');
  readonly dirty = computed(() => this.savedView() !== null && JSON.stringify(this.draft()) !== JSON.stringify(this.savedView()!.configuration));
  readonly canArrange = computed(() => !!this.data() && this.savedView() !== null && !this.saving() && !this.viewLoading());
  readonly scopeKey = computed(() => this.focusId() ?? 'overview');
  readonly data = signal<OrganizationNetwork | null>(null);
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly focusId = signal<string | null>(null);
  readonly showDomains = signal(false);
  readonly hideUnrelatedOrganizations = signal(true);
  readonly hideUnrelatedLabel = computed(()=>this.tr(CATALOG_COPY.canvasHideUnrelatedOrganizations));
  readonly hideUnrelatedHint = computed(()=>this.tr(CATALOG_COPY.canvasHideUnrelatedOrganizationsHint));
  readonly viewOptionsLabel = computed(()=>this.tr(CATALOG_COPY.canvasViewOptions));
  readonly noRelatedOrganizationsLabel = computed(()=>this.tr(CATALOG_COPY.canvasNoRelatedOrganizations));
  readonly menu = signal<{ node: OrganizationNode | null; domain: OrganizationNetwork['domains'][number] | null; x: number; y: number; maxHeight: number } | null>(null);
  readonly nodes = computed(() => this.data()?.nodes.map(node => ({...node,...node.localizations?.[this.preferences.language()]})) ?? []);
  readonly byId = computed(() => new Map(this.nodes().map(node => [node.id, node])));
  readonly focus = computed(() => this.byId().get(this.focusId() ?? '') ?? null);
  private readonly allOverviewNodes = computed(() => this.data()?.nodes.filter(node => node.parentId === null || ['SBB', 'Post', 'ETH-Bereich'].includes(node.code) || (node.kind === 'federal_related' && node.parentId === 'context:public')).map(node=>this.byId().get(node.id)!) ?? []);
  readonly overviewNodes = computed(()=>this.allOverviewNodes().filter(node=>this.showOrganization(node)));
  readonly children = computed(() => this.focus() ? this.nodes().filter(node => node.parentId === this.focusId()&&this.showOrganization(node)) : this.overviewNodes());
  readonly officeField = computed<OrganizationField & Position>(() => this.focus() ? organizationFieldForHeading(this.headingArea()) : ORGANIZATION_OVERVIEW_FIELD);
  readonly layout = computed(() => {
    const domainIds = this.showDomains() ? this.domains().map(domain => `domain:${domain.id}`) : [];
    return scatterOrganizations([...this.children().map(node => node.id), ...domainIds], new Set(domainIds), this.officeField());
  });
  readonly domainOrganizations = computed(() => {
    const visible = [...this.children(), ...this.baseSatellites().map(item => item.node), ...(this.focus() ? [this.focus()!] : [])];
    const nodes = [...new Map(visible.map(node => [node.id, node])).values()];
    return new Map(this.domains().map(domain => {
      const matching = nodes.filter(node => domain.organizationIds.includes(node.id));
      return [domain.id, matching.filter(node => !matching.some(other => other.id !== node.id && this.inside(other.id, node.id)))];
    }));
  });
  readonly groupedLayout = computed(() => {
    const fixed = new Set<string>(), childIds = new Set(this.children().map(node => node.id));
    const positions = this.layout().map(item => {
      const saved = this.draft().scopes[this.scopeKey()]?.offices[item.id];
      if (!saved) return item;
      fixed.add(item.id); return { ...item, ...this.constrain('offices', {...saved,y:saved.y+(this.focus()?ORGANIZATION_ANCHOR_Y_OFFSET:0)}, item.width, item.height) };
    });
    const assignments = new Map([...this.domainOrganizations()].map(([id, nodes]) => [`domain:${id}`, nodes.filter(node => childIds.has(node.id)).map(node => node.id)]));
    return groupOrganizationDomains(positions, assignments, {...this.officeField(),height:Math.max(this.officeField().height,...positions.map(item=>item.y+item.height/2+8))}, fixed);
  });
  readonly networkLayout = computed(() => {
    const field=this.officeField(),scope=this.draft().scopes[this.scopeKey()];
    const inner={...field,height:Math.max(field.height,...this.groupedLayout().map(item=>item.y+item.height/2+8))};
    const outer={x:0,y:0,width:960,height:650};
    const items:NetworkPlacement[]=this.groupedLayout().map(item=>({...item,x:item.x+field.x,y:item.y+field.y,region:inner,group:item.id.startsWith('domain:')?'domain':'office',fixed:!!scope?.offices[item.id]}));
    items.push(...this.baseSatellites().map(item=>({id:item.node.id,x:item.x,y:item.y,width:ORGANIZATION_CARD.width,height:ORGANIZATION_CARD.height,delay:item.delay,duration:item.duration,region:outer,group:'satellite' as const,fixed:!!scope?.satellites[item.node.id]})));
    const heading=this.headingArea();
    if(this.focus())items.push({id:this.focusId()!,x:heading.x+heading.width/2,y:heading.y+heading.height/2,width:heading.width,height:heading.height,delay:'0s',duration:'0s',region:outer,group:'title',fixed:true});
    const edges:OrganizationLayoutEdge[]=[];
    for(const relation of this.data()?.relations??[]){
      if(this.focus()&&!this.inside(relation.sourceId,this.focusId())&&!this.inside(relation.targetId,this.focusId()))continue;
      const sourceId=this.visibleOrganizationId(relation.sourceId),targetId=this.visibleOrganizationId(relation.targetId);
      if(sourceId&&targetId&&sourceId!==targetId)edges.push({sourceId,targetId,weight:4*Math.sqrt(Math.min(9,relation.count))});
    }
    if(this.showDomains())for(const [id,nodes] of this.domainOrganizations())for(const node of nodes)edges.push({sourceId:node.id,targetId:`domain:${id}`,weight:1});
    return optimizeOrganizationNetwork(items,edges);
  });
  readonly satellites = computed(() => {
    const positions=new Map(this.networkLayout().filter(item=>item.group==='satellite').map(item=>[item.id,item]));
    return this.baseSatellites().map(item=>({...item,x:positions.get(item.node.id)?.x??item.x,y:positions.get(item.node.id)?.y??item.y}));
  });
  readonly offices = computed(() => {
    const nodes = this.children(), byId = new Map(nodes.map(node => [node.id, node]));
    return this.networkLayout().filter(position => byId.has(position.id)).map(position => ({ ...position, x:position.x-this.officeField().x, y:position.y-this.officeField().y, node: byId.get(position.id)! }));
  });
  readonly domainBubbles = computed(() => {
    const domains = new Map(this.domains().map(domain => [`domain:${domain.id}`, domain]));
    return this.networkLayout().filter(position => domains.has(position.id)).map(position => {
      const domain = domains.get(position.id)!;
      return { ...position, x:position.x-this.officeField().x, y:position.y-this.officeField().y, domain, organizationLabel: this.domainOrganizations().get(domain.id)?.map(node => node.code).join(' · ') ?? '' };
    });
  });
  readonly breadcrumbs = computed(() => {
    const path: OrganizationNode[] = [], seen = new Set<string>();
    let node = this.focus();
    while (node && !seen.has(node.id)) { seen.add(node.id); path.unshift(node); node = this.byId().get(node.parentId ?? '') ?? null; }
    return path;
  });
  readonly domains = computed(() => {
    const scope = this.focus() ? [this.focusId()!] : this.allOverviewNodes().map(node => node.id);
    return this.data()?.domains.filter(domain => domain.organizationIds.some(id => scope.includes(id))) ?? [];
  });
  readonly baseSatellites = computed(() => {
    const data = this.data(); if (!data || !this.focus()) return [];
    const ids = new Set(data.satelliteIds);
    if (data.homeId && data.homeId !== this.focusId()) ids.add(data.homeId);
    for (const edge of data.relations) {
      if (this.inside(edge.sourceId, this.focusId())) ids.add(edge.targetId);
      if (this.inside(edge.targetId, this.focusId())) ids.add(edge.sourceId);
    }
    const nodes = [...ids].map(id => this.byId().get(id)).filter((node): node is OrganizationNode => !!node && !this.inside(node.id, this.focusId())&&this.showOrganization(node));
    return nodes.map((node, index) => ({ node, connected: data.relations.some(edge =>
      (this.inside(edge.sourceId, this.focusId()) && this.inside(edge.targetId, node.id)) ||
      (this.inside(edge.targetId, this.focusId()) && this.inside(edge.sourceId, node.id))),
      ...organizationSatellite(index, nodes.length, node.id), ...this.anchor(node.id, 'satellites', organizationSatellite(index, nodes.length, node.id), ORGANIZATION_CARD.width, ORGANIZATION_CARD.height) }));
  });
  readonly threads = computed(() => {
    const relations = this.data()?.relations ?? [];
    const result: { id: string; sourceId: string; targetId: string; from: Position; to: Position; label: string; inferred: boolean; flow: ReturnType<typeof organizationFlow>; offset: Position; path: string; ribbonPath: string; motionPath: string; drawHighway: boolean }[] = [];
    const drawn = new Set<string>();
    for (const [index, relation] of relations.entries()) {
      if (this.focus() && !this.inside(relation.sourceId, this.focusId()) && !this.inside(relation.targetId, this.focusId())) continue;
      const from = this.project(relation.sourceId), to = this.project(relation.targetId);
      if (!from || !to || (from.x === to.x && from.y === to.y)) continue;
      const source = this.byId().get(relation.sourceId)?.label, target = this.byId().get(relation.targetId)?.label;
      const sourceId=this.visibleOrganizationId(relation.sourceId),targetId=this.visibleOrganizationId(relation.targetId);
      const obstacles:HighwayObstacle[]=this.networkLayout().filter(item=>item.id!==sourceId&&item.id!==targetId).map(item=>({...item,...this.cardSizes().get(item.id)}));
      // The exact subcurve ends inside the opaque cards, concealing head and trail.
      const ribbon=organizationHighway(sourceId===this.focusId()?this.titlePort(from,to):from,targetId===this.focusId()?this.titlePort(to,from):to,obstacles);
      const highway=organizationHighwayFlight(ribbon,this.relationshipHalfSize(relation.sourceId),this.relationshipHalfSize(relation.targetId));
      const start=highway.from,end=highway.to,dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy)||1;
      const reciprocal=relations.some(other=>other.sourceId===relation.targetId&&other.targetId===relation.sourceId);
      const offset=reciprocal?{x:-dy/length*3.5,y:dx/length*3.5}:{x:0,y:0};
      const pair=[sourceId,targetId].sort().join('|'),drawHighway=!drawn.has(pair),ribbonPath=ribbon.path;
      drawn.add(pair);
      const explanation = this.tr([
        'Ein Punkt steht für ein konsumiertes Datenprodukt. Bei zwei Produkten folgen zwei Punkte aufeinander, vom Produzenten zum Konsumenten. Die Geschwindigkeit bleibt gleich. Gegenläufige Punkte zeigen gegenseitigen Austausch. Die Darstellung beruht auf dem Katalog, nicht auf Live-Abrufen, und ist kein Zugriffsbeleg.',
        'Un point représente un produit de données consommé. Pour deux produits, deux points se suivent du producteur au consommateur, à vitesse constante. Des points en sens opposés indiquent un échange réciproque. Cette représentation repose sur le catalogue, pas sur des appels en direct, et ne prouve pas un accès.',
        'Un punto rappresenta un prodotto di dati consumato. Per due prodotti, due punti si susseguono dal produttore al consumatore, a velocità costante. Punti in direzioni opposte indicano uno scambio reciproco. La visualizzazione si basa sul catalogo, non su richieste in tempo reale, e non è una prova di accesso.',
        'One point represents one consumed data product. Two products appear as two successive points from producer to consumer, at a constant speed. Opposing points show reciprocal exchange. This visualization is based on the catalog, not live requests, and is not an access receipt.',
      ]);
      const inferred = relation.inferred ? this.tr(['Abgeleitete Beziehung.', 'Relation déduite.', 'Relazione dedotta.', 'Inferred relationship.']) + ' ' : '';
      result.push({ id: String(index), sourceId: relation.sourceId, targetId: relation.targetId, from: start, to: end,
        label: `${source} → ${target} · ${organizationCountLabel('consumed',relation.count,this.preferences.language())}. ${inferred}${explanation}`,
        inferred: relation.inferred, flow: organizationFlow(relation.count,highway.length), offset, path:highway.path, ribbonPath, motionPath:`path("${highway.path}")`, drawHighway });
    }
    return result;
  });
  readonly domainThreads = computed(() => {
    if (!this.showDomains()) return [];
    const result: { id: string; sourceId: string; domainId: string; from: Position; to: Position; label: string }[] = [];
    for (const bubble of this.domainBubbles()) {
      const measured = this.childPositions().get(`domain:${bubble.domain.id}`);
      // A measured canvas omits clipped bubbles; the geometric fallback also
      // allows the first render before DOM measurements are available.
      if (!measured && this.stage()?.nativeElement.getBoundingClientRect().width) continue;
      const to = measured ?? { x: this.officeField().x + bubble.x, y: this.officeField().y + bubble.y };
      const sources = this.domainOrganizations().get(bubble.domain.id) ?? [];
      for (const source of sources) {
        const from = this.project(source.id); if (!from) continue;
        result.push({ id: `${source.id}:${bubble.domain.id}`, sourceId: source.id, domainId: bubble.domain.id, from: this.titlePort(from, to), to,
          label: `${this.tr(['Domänenzuordnung', 'Affectation de domaine', 'Assegnazione del dominio', 'Domain assignment'])}: ${source.label} — ${bubble.domain.label}` });
      }
    }
    return result;
  });

  constructor() {
    effect(() => { this.identity.userId(); untracked(() => this.load()); });
    effect(() => { this.preferences.language(); this.closeMenu(); });
    afterRenderEffect(cleanup => {
      this.focusId(); this.showDomains(); this.data(); this.draft(); this.fullscreen(); this.preferences.language();
      const stage = this.stage()?.nativeElement; if (!stage) return;
      this.centerViewport();
      this.measureChildren();
      if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(() => { this.centerViewport(); this.measureChildren(); });
        observer.observe(stage); if (stage.parentElement) observer.observe(stage.parentElement);
        for(const card of stage.querySelectorAll('.org-office,.org-satellite,.org-focus'))observer.observe(card);
        cleanup(() => observer.disconnect());
      }
    });
    this.destroy.onDestroy(() => { this.cancelDrag(); this.exitFullscreen(); this.viewRequest?.unsubscribe(); this.saveRequest?.unsubscribe(); });
  }
  tr(copy: readonly [string, string, string, string]): string { return catalogCopy(copy, this.preferences.language()); }
  private showOrganization(node: OrganizationNode): boolean {
    return !this.hideUnrelatedOrganizations() || node.productCount > 0 || node.consumedProductCount > 0;
  }
  setHideUnrelatedOrganizations(value: boolean): void {
    this.cancelDrag();
    this.hideUnrelatedOrganizations.set(value);
    this.closeMenu(!!this.menu());
    this.recenter();
  }
  load(): void {
    const generation = ++this.generation;
    this.cancelDrag(); this.exitFullscreen(); this.saveRequest?.unsubscribe(); this.savedView.set(null); this.draft.set(emptyOrganizationConfiguration()); this.saving.set(false); this.layoutError.set(''); this.notice.set('');
    this.loadView(generation);
    this.request?.unsubscribe(); this.loading.set(true); this.failed.set(false); this.data.set(null); this.menu.set(null);
    this.request = this.http.get<OrganizationNetwork>('/api/v1/organization-network', { headers: this.identity.headers() }).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: data => { if (generation !== this.generation) return; this.data.set(data); const requested = this.route.snapshot.queryParamMap.get('organization'); this.focusId.set(requested === 'all' ? null : data.nodes.some(node => node.id === requested) ? requested : data.homeId); this.loading.set(false); },
      error: () => { if (generation !== this.generation) return; this.loading.set(false); this.failed.set(true); },
    });
  }
  enter(node: OrganizationNode): void { this.cancelDrag(); this.focusId.set(node.id); this.closeMenu(); this.recenter(); }
  organizationViewUrl(node:OrganizationNode|null):string { return '/?organization='+encodeURIComponent(node?.id??'all'); }
  homeViewUrl():string { return '/?organization='+encodeURIComponent(this.data()?.homeId??'all'); }
  openViewFromMenu(event:MouseEvent,action:'enter'|'home'|'overview',node?:OrganizationNode):void {
    if(event.ctrlKey||event.metaKey||event.shiftKey||event.button!==0){this.closeMenu();return;}
    event.preventDefault();
    if(action==='home')this.home();else if(action==='overview')this.overview();else if(node)this.enter(node);
  }
  overview(): void { this.cancelDrag(); this.focusId.set(null); this.closeMenu(); this.recenter(); }
  home(): void { this.cancelDrag(); this.focusId.set(this.data()?.homeId ?? null); this.closeMenu(); this.recenter(); }
  private loadView(generation = this.generation): void {
    this.viewRequest?.unsubscribe(); this.viewLoading.set(true);
    this.viewRequest = this.http.get<OrganizationView>('/api/v1/organization-network/view', { headers: this.identity.headers() }).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: view => { if (generation !== this.generation) return; this.savedView.set(view); this.draft.set(structuredClone(view.configuration)); this.viewLoading.set(false); this.layoutError.set(''); },
      error: () => { if (generation !== this.generation) return; this.viewLoading.set(false); this.layoutError.set(this.tr(['Die gespeicherte Anordnung konnte nicht geladen werden.', 'Impossible de charger la disposition enregistrée.', 'Impossibile caricare la disposizione salvata.', 'The saved layout could not be loaded.'])); },
    });
  }
  reloadView(): void {
    if (this.saving() || (this.dirty() && !window.confirm(this.tr(['Lokalen Entwurf verwerfen und die gespeicherte Anordnung laden?', 'Abandonner le brouillon et charger la disposition enregistrée ?', 'Scartare la bozza e caricare la disposizione salvata?', 'Discard the draft and load the saved layout?'])))) return;
    this.cancelDrag(); this.loadView();
  }
  saveLayout(): void {
    if (!this.canArrange() || !this.dirty()) return;
    this.finishDrag(); const generation = this.generation, configuration = structuredClone(this.draft());
    this.saving.set(true); this.layoutError.set(''); this.notice.set('');
    this.saveRequest = this.http.put<OrganizationView>('/api/v1/organization-network/view', { revision: this.savedView()!.revision, configuration }, { headers: this.identity.headers() }).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: view => { if (generation !== this.generation) return; this.savedView.set(view); this.draft.set(structuredClone(view.configuration)); this.saving.set(false); this.notice.set(this.tr(['Ihre Anordnung ist im Benutzerprofil gespeichert.', 'Votre disposition est enregistrée dans votre profil.', 'La disposizione è salvata nel profilo utente.', 'Your layout is saved in your profile.'])); },
      error: error => { if (generation !== this.generation) return; this.saving.set(false); this.layoutError.set(error.status === 409 ? this.tr(['Die Anordnung wurde inzwischen in einem anderen Fenster geändert. Ihr Entwurf bleibt erhalten. Laden Sie die gespeicherte Anordnung, bevor Sie erneut speichern.', 'La disposition a changé dans une autre fenêtre. Votre brouillon est conservé. Rechargez la disposition enregistrée.', 'La disposizione è cambiata in un’altra finestra. La bozza è conservata. Ricaricare la disposizione salvata.', 'The layout changed in another window. Your draft is retained. Reload the saved layout before saving again.']) : this.tr(['Die Anordnung konnte nicht gespeichert werden. Ihr Entwurf bleibt erhalten.', 'Impossible d’enregistrer la disposition. Votre brouillon est conservé.', 'Impossibile salvare la disposizione. La bozza è conservata.', 'The layout could not be saved. Your draft is retained.'])); },
    });
  }
  discardLayout(): void { if (this.saving()) return; this.cancelDrag(); const view = this.savedView(); if (view) this.draft.set(structuredClone(view.configuration)); this.layoutError.set(''); this.notice.set(''); }
  autoLayout(): void {
    if (!this.canArrange()) return; this.cancelDrag();
    const scopes = { ...this.draft().scopes }; delete scopes[this.scopeKey()];
    this.draft.set({ schemaVersion: 1, scopes }); this.notice.set(''); this.recenter();
  }
  private anchor(id: string, kind: 'offices' | 'satellites', automatic: Position, width: number, height: number): Position {
    const saved = this.draft().scopes[this.scopeKey()]?.[kind]?.[id];
    return this.constrain(kind, saved ?? automatic, width, height);
  }
  private constrain(kind: 'offices' | 'satellites', point: Position, width: number, height: number, avoidHeading=false): Position {
    if(kind==='satellites')return constrainOrganizationSatellite(point,width,height);
    const field = this.officeField(), maxWidth = kind === 'offices' ? field.width : 960;
    const maxHeight = kind === 'offices' ? Math.max(field.height, ...this.layout().map(item => item.y + item.height / 2 + 8)) : 650;
    const bounded=(value:Position)=>({ x: Math.max(width / 2 + 8, Math.min(maxWidth - width / 2 - 8, value.x)), y: Math.max(height / 2 + 8, Math.min(maxHeight - height / 2 - 8, value.y)) });
    const position=bounded(point);
    if(!avoidHeading||kind!=='offices'||!this.focus()||clearsOrganizationHeading({...position,width,height},field))return position;
    const rect=field.exclusions![0];
    return [
      {x:rect.x-width/2-14,y:position.y},
      {x:rect.x+rect.width+width/2+14,y:position.y},
      {x:position.x,y:rect.y+rect.height+height/2+14},
    ].map(bounded).filter(value=>clearsOrganizationHeading({...value,width,height},field))
      .sort((a,b)=>Math.hypot(a.x-point.x,a.y-point.y)-Math.hypot(b.x-point.x,b.y-point.y))[0]??position;
  }
  private place(id: string, kind: 'offices' | 'satellites', point: Position, width: number, height: number): void {
    const scope = this.scopeKey(), current = this.draft().scopes[scope] ?? { offices: {}, satellites: {} };
    const position=this.constrain(kind,point,width,height,true);
    // Retain the original y=240 anchor origin; the new title-side strip uses
    // negative office y coordinates while all existing saved anchors stay put.
    if(kind==='offices'&&this.focus())position.y-=ORGANIZATION_ANCHOR_Y_OFFSET;
    this.draft.update(value => ({ schemaVersion: 1, scopes: { ...value.scopes, [scope]: { ...current, [kind]: { ...current[kind], [id]: position } } } }));
    this.notice.set('');
  }
  cardClick(event: MouseEvent, node: OrganizationNode): void {
    if (this.ignoreClick && event.detail > 0) { this.ignoreClick = false; event.preventDefault(); event.stopPropagation(); return; }
    this.enter(node);
  }
  domainClick(event: MouseEvent): void {
    if (this.ignoreClick && event.detail > 0) {
      this.ignoreClick = false; event.preventDefault(); event.stopPropagation();
    }
  }
  startDrag(event: PointerEvent, id: string, kind: 'offices' | 'satellites', point: Position, width: number, height: number): void {
    if (event.button !== 0 || !this.canArrange()) return;
    this.ignoreClick = false; this.closeMenu();
    const target = event.currentTarget as HTMLElement;
    this.drag = { id, kind, pointerId: event.pointerId, target, start: { x: event.clientX, y: event.clientY }, origin: { x: point.x, y: point.y }, before: this.draft(), moved: false, width, height };
    try { target.setPointerCapture(event.pointerId); } catch { /* Synthetic pointer events may not support capture. */ }
  }
  @HostListener('document:pointermove', ['$event']) moveDrag(event: PointerEvent): void {
    this.bitPowerHeld.set(event.ctrlKey);
    const drag = this.drag, bounds = this.stage()?.nativeElement.getBoundingClientRect();
    if (!drag || drag.pointerId !== event.pointerId || !bounds?.width || !bounds.height) return;
    const dx = event.clientX - drag.start.x, dy = event.clientY - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    if (!drag.moved) { drag.moved = true; this.draggingId.set(drag.id); this.tooltips().forEach(tooltip => tooltip.close()); }
    event.preventDefault(); this.place(drag.id, drag.kind, { x: drag.origin.x + dx / bounds.width * 960, y: drag.origin.y + dy / bounds.height * 650 }, drag.width, drag.height);
  }
  @HostListener('document:pointerup', ['$event']) dropDrag(event: PointerEvent): void { if (this.drag?.pointerId === event.pointerId) this.finishDrag(); }
  @HostListener('document:pointercancel', ['$event']) cancelPointer(event: PointerEvent): void { if (this.drag?.pointerId === event.pointerId) this.cancelDrag(); }
  private finishDrag(): void {
    const drag = this.drag; this.drag = null; this.draggingId.set(null); if (!drag) return;
    this.ignoreClick = drag.moved;
    try { drag.target.releasePointerCapture(drag.pointerId); } catch { /* Capture may already be released. */ }
  }
  private cancelDrag(): void { const before = this.drag?.before; this.finishDrag(); if (before) this.draft.set(before); this.ignoreClick = false; }
  cardKey(event: KeyboardEvent, id: string, kind: 'offices' | 'satellites', point: Position, width: number, height: number): void {
    const delta = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[event.key];
    if (!delta || !this.canArrange() || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault(); event.stopPropagation(); this.cancelDrag(); this.tooltips().forEach(tooltip => tooltip.close());
    const step = event.shiftKey ? 40 : 10; this.place(id, kind, { x: point.x + delta[0] * step, y: point.y + delta[1] * step }, width, height);
  }
  toggleFullscreen(event: Event): void {
    if (this.fullscreen()) { this.exitFullscreen(); return; }
    this.fullscreenTrigger = event.currentTarget as HTMLElement; this.bodyOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    this.closeMenu(); this.fullscreen.set(true); this.recenter();
    afterNextRender(() => this.explorer()?.nativeElement.querySelector<HTMLElement>('.org-fullscreen')?.focus(), { injector: this.injector });
  }
  private exitFullscreen(): void {
    if (!this.fullscreen()) return; document.body.style.overflow = this.bodyOverflow; this.fullscreen.set(false); this.fullscreenTrigger?.focus({ preventScroll: true });
  }
  private recenter(): void { afterNextRender(() => { this.centerViewport(true); this.measureChildren(); }, { injector: this.injector }); }
  @HostListener('document:keydown', ['$event']) trapFocus(event: KeyboardEvent): void {
    this.bitPowerHeld.set(event.ctrlKey);
    if (!this.fullscreen() || event.key !== 'Tab') return;
    const root = this.explorer()?.nativeElement;
    const elements = [...(root?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),summary,[tabindex="0"]') ?? [])].filter(element => {
      const closed = element.closest('details:not([open])');
      return element.getClientRects().length && (!closed || element === closed.querySelector(':scope > summary'));
    });
    const first = elements[0], last = elements.at(-1);
    if (!root?.contains(document.activeElement)) { event.preventDefault(); first?.focus(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  canDeactivate(): boolean { return !this.saving() && (!this.dirty() || window.confirm(this.tr(['Ungespeicherte Änderungen der Anordnung verwerfen?', 'Abandonner les changements de disposition non enregistrés ?', 'Scartare le modifiche non salvate alla disposizione?', 'Discard unsaved layout changes?']))); }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(event: BeforeUnloadEvent): void { if (this.dirty() || this.saving()) { event.preventDefault(); event.returnValue = ''; } }
  hasChildren(node: OrganizationNode): boolean { return this.data()?.nodes.some(child => child.parentId === node.id) ?? false; }
  isCanton(node: OrganizationNode | null): boolean { return node?.kind === 'cantonal'; }
  isOwn(node: OrganizationNode): boolean { return this.inside(this.data()?.ownOrganizationId ?? '', node.id); }
  organizationCode(node: OrganizationNode | null): string {
    if (!node) return '';
    const parent=this.byId().get(node.parentId??'');
    const canonicalParent=this.data()?.nodes.find(item=>item.id===node.parentId)?.code;
    for(const prefix of [parent?.code,canonicalParent].filter((value):value is string=>!!value).sort((a,b)=>b.length-a.length)){
      if(node.code.startsWith(prefix+'-')) return node.code.slice(prefix.length+1);
    }
    return node.code;
  }
  productCountsLabel(node: OrganizationNode | null): string {
    if (!node) return '';
    return `${this.offeredProductsLabel(node.productCount)} · ${organizationCountLabel('consumed',node.consumedProductCount,this.preferences.language())}`;
  }
  offeredProductsLabel(count:number):string{return organizationCountLabel('offered',count,this.preferences.language());}
  organizationTooltip(node: OrganizationNode | null): string {
    if (!node) return '';
    const normalize = (value: string) => value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase(this.preferences.language());
    const description = node.description.trim();
    const detail = description && normalize(description) !== normalize(node.label) ? ` ${description}` : '';
    return `${node.label}. ${this.productCountsLabel(node)}. ${this.tr(['Aktive, sichtbare Datenprodukte inkl. Untereinheiten, je Produkt einmal gezählt. Konsum bezeichnet Katalogzuordnungen und gültige Freigaben, keine Abrufstatistik.', 'Produits actifs et visibles, unités incluses, comptés une seule fois. La consommation désigne les affectations du catalogue et les autorisations valides, sans statistiques d’accès.', 'Prodotti attivi e visibili, incluse le unità, contati una sola volta. Il consumo indica assegnazioni del catalogo e autorizzazioni valide, non statistiche di accesso.', 'Active, visible products including subordinate units, each counted once. Consumption represents catalog assignments and valid grants, not access statistics.'])}${detail}`;
  }
  search(node: OrganizationNode): Record<string, string> { return { organization: node.id, kind: 'product' }; }
  hasProducts(node: OrganizationNode): boolean { return node.objectKeys ? node.objectKeys.some(key => key.startsWith('product:')) : node.productCount > 0 || node.consumedProductCount > 0; }
  view(node: OrganizationNode): Record<string, string> { return { organization: node.id }; }
  objectSearch(node: OrganizationNode): Record<string, string> { return { organization: node.id }; }
  domainObjectSearch(domain: OrganizationNetwork['domains'][number]): Record<string, string> { return { domain: domain.id }; }
  hasObjects(item: {objectKeys?:string[]}): boolean { return !!item.objectKeys?.length; }
  openMenu(event: Event, node: OrganizationNode): void {
    this.showMenu(event, {node,domain:null});
  }
  openDomainMenu(event: Event, domain: OrganizationNetwork['domains'][number]): void {
    this.showMenu(event, {node:null,domain});
  }
  private showMenu(event:Event, context:{node:OrganizationNode|null;domain:OrganizationNetwork['domains'][number]|null}):void {
    this.cancelDrag();
    event.preventDefault(); event.stopPropagation();
    const target = event.currentTarget as HTMLElement, viewport = target.closest('.org-viewport') as HTMLElement;
    if(event instanceof KeyboardEvent)target.scrollIntoView?.({behavior:'instant',block:'nearest',inline:'nearest'});
    const stage = viewport.getBoundingClientRect(), bounds = target.getBoundingClientRect();
    const mouse = event instanceof MouseEvent && event.clientX > 0 ? event : null;
    this.menuTrigger = target;
    const place=(width:number,height:number)=>{
      const rect=viewport.getBoundingClientRect();
      const left=Math.max(8,12-rect.left),top=Math.max(8,12-rect.top);
      const right=Math.min(viewport.clientWidth,innerWidth-rect.left)-12,bottom=Math.min(viewport.clientHeight,innerHeight-rect.top)-12;
      const maxHeight=Math.max(48,bottom-top),actualHeight=Math.min(height,maxHeight);
      return {...context,maxHeight,x:viewport.scrollLeft+Math.max(left,Math.min((mouse?mouse.clientX:bounds.left)-rect.left,right-width)),y:viewport.scrollTop+Math.max(top,Math.min((mouse?mouse.clientY:bounds.bottom)-rect.top,bottom-actualHeight))};
    };
    const initial=place(Math.min(310,stage.width-24),340);this.menu.set(initial);
    afterNextRender(() => {
      if(this.menu()!==initial)return;
      const menu = target.closest('daca-organization-canvas')?.querySelector<HTMLElement>('[role="menu"]');
      const rect=menu?.getBoundingClientRect();
      this.menu.set(place(rect?.width??310,menu?.scrollHeight||rect?.height||340));
      menu?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled),[role="menuitemcheckbox"]:not(:disabled)')?.focus({preventScroll:true});
    }, { injector: this.injector });
  }
  closeMenu(restore = false): void { this.menu.set(null); if (restore) this.menuTrigger?.focus(); }
  @HostListener('document:keydown.escape') escape(): void {
    if (this.drag) { this.cancelDrag(); return; }
    if (this.menu()) { this.closeMenu(true); return; }
    if (this.fullscreen()) this.exitFullscreen();
  }
  @HostListener('document:click') dismissMenu(): void { this.closeMenu(); }
  menuKeys(event: KeyboardEvent): void {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled),[role="menuitemcheckbox"]:not(:disabled)')];
    const index = items.indexOf(document.activeElement as HTMLElement);
    items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length]?.focus();
  }
  leaveMenu(event: FocusEvent): void {
    if (!(event.relatedTarget instanceof Node) || !(event.currentTarget as HTMLElement).contains(event.relatedTarget)) this.closeMenu();
  }
  measureChildren(): void {
    const stage = this.stage()?.nativeElement; if (!stage) return;
    const bounds = stage.getBoundingClientRect(); if (!bounds.width || !bounds.height) return;
    const heading=stage.querySelector('.org-focus')?.getBoundingClientRect();
    if(heading?.width&&heading.height&&this.focusId()){
      const rect={x:(heading.left-bounds.left)/bounds.width*960,y:(heading.top-bounds.top)/bounds.height*650,width:heading.width/bounds.width*960,height:heading.height/bounds.height*650};
      const previous=untracked(()=>this.measuredHeading()),focusId=this.focusId()!,language=this.preferences.language();
      if(!previous||previous.focusId!==focusId||previous.language!==language||(['x','y','width','height'] as const).some(key=>Math.abs(previous.rect[key]-rect[key])>.25))this.measuredHeading.set({focusId,language,rect});
    }
    const title = stage.querySelector('.org-focus-title')?.getBoundingClientRect();
    this.focusTitle.set(title?.width && title.height ? {
      center: { x: (title.left + title.width / 2 - bounds.left) / bounds.width * 960, y: (title.top + title.height / 2 - bounds.top) / bounds.height * 650 },
      halfWidth: (title.width / 2 + 6) / bounds.width * 960,
      halfHeight: (title.height / 2 + 6) / bounds.height * 650,
    } : null);
    const area = stage.querySelector('.org-office-field')?.getBoundingClientRect();
    const sizes=new Map<string,{width:number;height:number}>();
    for(const card of stage.querySelectorAll<HTMLElement>('.org-office[data-organization-id],.org-satellite[data-organization-id]')){
      const rect=card.getBoundingClientRect();if(rect.width&&rect.height)sizes.set(card.dataset['organizationId']!,{width:rect.width/bounds.width*960,height:rect.height/bounds.height*650});
    }
    this.cardSizes.set(sizes);
    const positions = new Map<string, Position>();
    for (const child of stage.querySelectorAll<HTMLElement>('.org-office[data-organization-id],.org-domain-bubble[data-domain-id]')) {
      const rect = child.getBoundingClientRect();
      if (area && (rect.bottom < area.top || rect.top > area.bottom)) continue;
      const id = child.dataset['organizationId'] ?? `domain:${child.dataset['domainId']}`;
      positions.set(id, { x: (rect.left + rect.width / 2 - bounds.left) / bounds.width * 960, y: (rect.top + rect.height / 2 - bounds.top) / bounds.height * 650 });
    }
    this.childPositions.set(positions);
  }
  domainTooltip(domain: OrganizationNetwork['domains'][number]): string {
    const assigned = domain.organizationIds.map(id => this.byId().get(id)).filter((node): node is OrganizationNode => !!node);
    const leaves = assigned.filter(node => !assigned.some(other => other.id !== node.id && this.inside(other.id, node.id)));
    const paths = leaves.map(leaf => {
      const path: string[] = [], seen = new Set<string>(); let node: OrganizationNode | undefined = leaf;
      while (node && !seen.has(node.id)) { seen.add(node.id); path.unshift(node.code); node = this.byId().get(node.parentId ?? ''); }
      return path.join(' › ');
    });
    return `${domain.label}. ${domain.description} ${this.offeredProductsLabel(domain.productCount)}. ${this.tr(['Organisationszuordnung', 'Affectation organisationnelle', 'Assegnazione organizzativa', 'Organization assignment'])}: ${paths.join(' · ')}`;
  }
  private centerViewport(force = false): void {
    const stage = this.stage()?.nativeElement, viewport = stage?.parentElement;
    if (!stage || !viewport) return;
    const size = { width: viewport.clientWidth, height: viewport.clientHeight };
    if (size.width !== this.viewportSize().width || size.height !== this.viewportSize().height) this.viewportSize.set(size);
    if (force || viewport.clientWidth !== this.viewportWidth) viewport.scrollLeft = Math.max(0, (stage.clientWidth - viewport.clientWidth) / 2);
    this.viewportWidth = viewport.clientWidth;
  }
  private inside(identity: string, parent: string | null): boolean {
    const seen = new Set<string>(); let node = this.byId().get(identity);
    while (node && !seen.has(node.id)) { if (node.id === parent) return true; seen.add(node.id); node = this.byId().get(node.parentId ?? ''); }
    return false;
  }
  private visibleOrganizationId(identity:string):string|null {
    const node=this.byId().get(identity);if(node&&node.id!==this.focusId()&&!this.showOrganization(node))return null;
    const visible=this.focus()?this.children():this.overviewNodes();
    if(this.focus()&&this.baseSatellites().some(item=>item.node.id===identity))return identity;
    const ids=new Set(visible.map(node=>node.id)),seen=new Set<string>();
    let current=this.byId().get(identity);
    while(current&&!seen.has(current.id)){if(ids.has(current.id))return current.id;seen.add(current.id);current=this.byId().get(current.parentId??'');}
    if(this.focus()&&this.inside(identity,this.focusId()))return this.focusId();
    return this.focus()?this.baseSatellites().find(item=>this.inside(identity,item.node.id))?.node.id??null:null;
  }
  private relationshipHalfSize(identity:string):HighwayHalfSize|undefined {
    const id=this.visibleOrganizationId(identity);
    if(id===this.focusId())return undefined;
    const office=this.offices().find(item=>item.id===id),satellite=this.satellites().some(item=>item.node.id===id);
    if(!office&&!satellite)return undefined;
    const size=this.cardSizes().get(id!);
    return highwayPacketHalfSize(size?.width??office?.width??ORGANIZATION_CARD.width,size?.height??office?.height??ORGANIZATION_CARD.height);
  }

  private titlePort(point: Position, toward: Position): Position {
    const title = this.focusTitle();
    if (!title || point !== title.center) return point;
    const dx = toward.x - point.x, dy = toward.y - point.y;
    if (!dx && !dy) return point;
    const scale = Math.min(dx ? title.halfWidth / Math.abs(dx) : Infinity, dy ? title.halfHeight / Math.abs(dy) : Infinity, 1);
    return { x: point.x + dx * scale, y: point.y + dy * scale };
  }
  private project(identity: string): Position | null {
    const id=this.visibleOrganizationId(identity);if(!id)return null;
    if(this.focus()&&id===this.focusId())return this.focusTitle()?.center??this.fallbackTitlePosition;
    const satellite=this.satellites().find(item=>item.node.id===id);if(satellite)return satellite;
    return this.childPositions().get(id)??(this.focus()&&this.inside(identity,this.focusId())?this.focusTitle()?.center??this.fallbackTitlePosition:null);
  }
}
