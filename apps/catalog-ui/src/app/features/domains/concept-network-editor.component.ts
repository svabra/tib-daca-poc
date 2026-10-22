import { afterNextRender, ChangeDetectionStrategy, Component, computed, effect, ElementRef, HostListener, inject, Injector, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import dagre from '@dagrejs/dagre';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DataProduct, DomainSummary, GlossaryTermProposal, GlossaryTermRelation, GlossaryTermSummary, LocalizedConceptLabel, SkosRelationType } from '../../core/catalog.models';
import { printMappingCanvas } from '../data-models/mapping-canvas-print';
interface Point {
    x: number;
    y: number;
}
interface Node extends Point {
    id: string;
    label: string;
    definition: string;
    kind: 'domain' | 'product' | 'term' | 'relation';
}
interface Edge {
    id: string;
    source: string;
    target: string;
    label: string;
    relationId?: string;
    sourceTermId?: string;
    relation?: GlossaryTermRelation;
}
interface EdgeView extends Edge {
    start: Point;
    end: Point;
    path: string;
    x: number;
    y: number;
}
interface EdgeEdit {
    original: Edge | null;
    source: string;
    target: string;
    type: SkosRelationType;
}
interface DraftCache {
    terms: GlossaryTermSummary[];
    bases: Record<string, number>;
}
export const RELATION_DESCRIPTIONS: Record<SkosRelationType, string> = {
    broader: 'Der Zielbegriff ist allgemeiner als der Ausgangsbegriff, z. B. Mitarbeitende → Person.',
    narrower: 'Der Zielbegriff ist spezieller als der Ausgangsbegriff, z. B. Person → Mitarbeitende.',
    related: 'Die Begriffe sind fachlich verwandt, ohne eine Ober-/Unterbegriffsbeziehung.',
    exactMatch: 'Beide Begriffe haben dieselbe fachliche Bedeutung.',
    closeMatch: 'Die Bedeutungen sind ähnlich, aber nicht vollständig gleich.',
};
export function relationLabel(value: string): string { return ({ broader: 'hat Oberbegriff', narrower: 'hat Unterbegriff', related: 'verwandt mit', exactMatch: 'entspricht exakt', closeMatch: 'entspricht annähernd' } as Record<string, string>)[value] ?? value; }
@Component({ selector: 'daca-concept-network-editor', standalone: true, imports: [RouterLink, FormsModule], changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './concept-network-editor.component.html', styleUrl: './concept-network-editor.component.css' })
export class ConceptNetworkEditorComponent {
    readonly domain = input.required<DomainSummary>();
    readonly terms = input<readonly GlossaryTermSummary[]>([]);
    readonly products = input<readonly DataProduct[]>([]);
    private readonly injector = inject(Injector);
    private readonly api = inject(CatalogApiService);
    private readonly identity = inject(DemoIdentityService);
    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
    readonly values = signal<readonly GlossaryTermSummary[]>([]);
    readonly positions = signal<Record<string, Point>>({});
    readonly selectedNode = signal<string | null>(null);
    readonly selectedEdge = signal<string | null>(null);
    readonly hoveredEdge = signal<string | null>(null);
    readonly dirty = signal<Record<string, number>>({});
    readonly pending = signal<readonly {
        termId: string;
        proposalId: string;
    }[]>([]);
    readonly saving = signal(false);
    readonly notice = signal('');
    readonly error = signal('');
    readonly fullscreen = signal(false);
    readonly printing = signal(false);
    readonly zoom = signal(.8);
    readonly edgeEdit = signal<EdgeEdit | null>(null);
    readonly termEdit = signal<{
        id: string;
        label: string;
        definition: string;
    } | null>(null);
    readonly menu = signal<{
        nodeId: string | null;
        x: number;
        y: number;
    } | null>(null);
    readonly connecting = signal<string | null>(null);
    readonly endpointPoint = signal<Point | null>(null);
    readonly relationTypes: readonly SkosRelationType[] = ['broader', 'narrower', 'related', 'exactMatch', 'closeMatch'];
    readonly descriptions = RELATION_DESCRIPTIONS;
    readonly relationLabel = relationLabel;
    readonly dirtyCount = computed(() => Object.keys(this.dirty()).length);
    readonly editable = computed(() => this.domain().status === 'active' && !this.saving());
    readonly conflicts = computed(() => Object.entries(this.dirty()).some(([id, revision]) => this.terms().find(term => term.id === id)?.revision !== revision));
    readonly saveReason = computed(() => this.saving() ? 'Änderungen werden eingereicht.' : !this.editable() ? 'Die Domäne ist stillgelegt.' : this.conflicts() ? 'Ein Begriff wurde zwischenzeitlich geändert. Der lokale Entwurf bleibt erhalten; verwerfen Sie ihn vor einer erneuten Bearbeitung.' : this.pending().some(item => item.termId in this.dirty()) ? 'Ein betroffener Begriff hat bereits einen Vorschlag in Prüfung. Lokale Änderungen bleiben erhalten.' : !this.dirtyCount() ? 'Es gibt keine ungespeicherten fachlichen Änderungen.' : '');
    readonly layout = computed(() => this.initialLayout());
    readonly nodes = computed(() => this.layout().nodes.map(node => ({ ...node, ...this.positions()[node.id] })));
    readonly edges = computed(() => this.layout().edges.map(edge => this.positionEdge(edge)).filter((edge): edge is EdgeView => !!edge));
    readonly canvasWidth = computed(() => Math.max(1000, ...this.nodes().map(node => node.x + 270)));
    readonly canvasHeight = computed(() => Math.max(540, ...this.nodes().map(node => node.y + 140)));
    readonly activeEdge = computed(() => this.edges().find(edge => edge.id === this.selectedEdge()) ?? null);
    private scope = '';
    private drag: {
        nodeId?: string;
        edge?: Edge;
        side?: 'source' | 'target';
        pointerId: number;
        start: Point;
        position: Point;
        handle: Element;
        moved: boolean;
    } | null = null;
    private suppressedClick = false;
    private previousOverflow = '';
    private fullscreenTrigger: HTMLElement | null = null;
    constructor() {
        effect(() => {
            const domain = this.domain(), terms = this.terms(), actor = this.identity.userId();
            untracked(() => {
                const scope = `${actor}:${domain.id}`;
                if (scope !== this.scope) {
                    this.cancelDrag();
                this.scope = scope;
                    this.pending.set([]);
                    this.notice.set('');
                    this.error.set('');
                    this.selectedNode.set(null);
                    this.selectedEdge.set(null);
                    this.edgeEdit.set(null);
                    this.termEdit.set(null);
                    this.connecting.set(null);
                    this.loadLayout();
                }
                this.values.set(structuredClone(terms));
                this.dirty.set({});
                try {
                    const cached = JSON.parse(sessionStorage.getItem(this.draftKey()) ?? 'null') as DraftCache | null;
                    if (cached && cached.bases && Array.isArray(cached.terms)) {
                        const ids = new Set(terms.map(term => term.id));
                        const updates = cached.terms.filter(term => ids.has(term.id) && Array.isArray(term.labels) && Array.isArray(term.relations));
                        this.values.update(items => items.map(term => updates.find(value => value.id === term.id) ?? term));
                        this.dirty.set(Object.fromEntries(Object.entries(cached.bases).filter(([id, revision]) => ids.has(id) && Number.isInteger(revision))));
                        if (updates.length)
                            this.notice.set('Lokaler Entwurf wiederhergestellt. Fachliche Änderungen werden erst nach Domänenfreigabe publiziert.');
                    }
                }
                catch {
                    this.notice.set('Der lokale Entwurf konnte nicht wiederhergestellt werden.');
                }
            });
        });
        effect(onCleanup => { const domain = this.domain(), terms = this.terms(), actor = this.identity.userId(); const scope = `${actor}:${domain.id}`; const request = untracked(() => this.api.loadGlossaryTermProposals().subscribe({ next: proposals => { if (scope !== this.scope)
                return; const byTerm = new Map<string, GlossaryTermProposal>(); for (const proposal of [...proposals].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)))
                if (proposal.requesterUserId === actor && proposal.operation === 'update' && proposal.targetTermId && ['submitted', 'in_review'].includes(proposal.status) && terms.some(term => term.id === proposal.targetTermId))
                    byTerm.set(proposal.targetTermId, proposal); this.pending.set([...byTerm].map(([termId, proposal]) => ({ termId, proposalId: proposal.id }))); this.values.update(items => items.map(term => { const proposal = byTerm.get(term.id); if (!proposal || term.id in this.dirty())
                return term; const payload = proposal.reviewPayload as {
                localizations?: LocalizedConceptLabel[];
                relations?: {
                    relation: SkosRelationType;
                    targetTermId?: string | null;
                    targetUri?: string | null;
                }[];
            }; if (!Array.isArray(payload.localizations) || !Array.isArray(payload.relations))
                return term; const preferred = payload.localizations.find(label => label.language === 'de') ?? payload.localizations[0]; return { ...term, labels: payload.localizations, preferredLabel: preferred?.preferredLabel ?? term.preferredLabel, definition: preferred?.definition ?? term.definition, relations: payload.relations.map((relation, index) => ({ id: `pending:${proposal.id}:${index}`, relationType: relation.relation, targetTermId: relation.targetTermId ?? null, targetUri: relation.targetUri ?? '', targetLabel: terms.find(value => value.id === relation.targetTermId)?.preferredLabel ?? relation.targetUri ?? 'Verknüpfter Begriff' })) }; })); }, error: () => this.notice.set('Offene Begriffsvorschläge konnten nicht geladen werden. Der lokale Entwurf bleibt erhalten.') })); onCleanup(() => request.unsubscribe()); });
    }
    private layoutKey(): string { return `daca.concept-network.layout.v1:${this.scope}`; }
    private draftKey(): string { return `daca.concept-network.draft.v1:${this.scope}`; }
    private loadLayout(): void { try {
        const data = JSON.parse(localStorage.getItem(this.layoutKey()) ?? '{}') as Record<string, Point>;
        this.positions.set(Object.fromEntries(Object.entries(data).filter(([, p]) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 15 && p.y >= 15 && p.x <= 100000 && p.y <= 100000)));
    }
    catch {
        this.positions.set({});
    } }
    private storeLayout(): void { try {
        localStorage.setItem(this.layoutKey(), JSON.stringify(this.positions()));
    }
    catch {
        this.notice.set('Die Anordnung bleibt für diese Sitzung erhalten; der Browserspeicher ist nicht verfügbar.');
    } }
    private storeDraft(): void { try {
        if (this.dirtyCount())
            sessionStorage.setItem(this.draftKey(), JSON.stringify({ bases: this.dirty(), terms: this.values().filter(term => term.id in this.dirty()) }));
        else
            sessionStorage.removeItem(this.draftKey());
    }
    catch {
        this.error.set('Der lokale Entwurf kann nicht im Browser gesichert werden. Lassen Sie diese Seite bis zum Einreichen geöffnet.');
    } }
    moveNode(id: string, p: Point, persist = true): void { this.positions.update(items => ({ ...items, [id]: { x: Math.max(15, Math.min(100000, p.x)), y: Math.max(15, Math.min(100000, p.y)) } })); if (persist)
        this.storeLayout(); }
    resetLayout(): void { this.positions.set({}); this.storeLayout(); this.notice.set('Elemente automatisch angeordnet.'); }
    private initialLayout(): {
        nodes: Node[];
        edges: Edge[];
    } {
        const domain = this.domain(), nodes = new Map<string, Node>(), edges: Edge[] = [];
        const domainId = `domain:${domain.id}`;
        const add = (id: string, label: string, definition: string, kind: Node['kind']) => nodes.set(id, { id, label, definition, kind, x: 0, y: 0 });
        add(domainId, domain.preferredLabel, domain.definition, 'domain');
        for (const product of this.products()) {
            const id = `product:${product.id}`;
            add(id, product.title, 'Datenprodukt', 'product');
            edges.push({ id: `product:${product.id}`, source: domainId, target: id, label: 'klassifiziert' });
        }
        for (const term of this.values()) {
            const id = `term:${term.id}`;
            add(id, term.preferredLabel, term.definition, 'term');
            edges.push({ id: `domain-term:${term.id}`, source: domainId, target: id, label: 'verwaltet' });
        }
        for (const term of this.values())
            for (const relation of term.relations) {
                const target = relation.targetTermId ? `term:${relation.targetTermId}` : `uri:${relation.targetUri}`;
                if (!nodes.has(target))
                    add(target, relation.targetLabel, 'Verweis ausserhalb dieser Domäne', 'relation');
                edges.push({ id: `relation:${term.id}:${relation.id}`, source: `term:${term.id}`, target, label: relationLabel(relation.relationType), sourceTermId: term.id, relationId: relation.id, relation });
            }
        const graph = new dagre.graphlib.Graph({ multigraph: true });
        graph.setGraph({ rankdir: 'LR', nodesep: 35, ranksep: 80, marginx: 30, marginy: 30 });
        graph.setDefaultEdgeLabel(() => ({}));
        for (const node of nodes.values())
            graph.setNode(node.id, { width: 230, height: 100 });
        for (const edge of edges)
            graph.setEdge(edge.source, edge.target, {}, edge.id);
        dagre.layout(graph);
        return { nodes: [...nodes.values()].map(node => { const p = graph.node(node.id) as Point; return { ...node, x: p.x - 115, y: p.y - 50 }; }), edges };
    }
    private canvasPoint(event: PointerEvent): Point { const rect = this.host.nativeElement.querySelector('.graph-canvas')?.getBoundingClientRect(); return { x: (event.clientX - (rect?.left ?? 0)) / this.zoom(), y: (event.clientY - (rect?.top ?? 0)) / this.zoom() }; }
    readonly connectionPreview = computed(() => { const id = this.connecting(), point = this.endpointPoint(), node = this.nodes().find(value => value.id === `term:${id}`); if (!point || !node)
        return ''; const x = node.x + (point.x >= node.x + 115 ? 230 : 0), y = node.y + 50; return `M ${x} ${y} L ${point.x} ${point.y}`; });
    edgeDescription(edge: Edge): string { return edge.relation ? `${edge.label} · ${this.descriptions[edge.relation.relationType]}` : edge.label; }
    @HostListener('document:pointerdown', ['$event'])
    outsideMenu(event: PointerEvent): void { if (!(event.target as Element).closest('.concept-context-menu'))
        this.closeMenus(); }
    nodeLabel(id: string): string { return this.nodes().find(node => node.id === id)?.label ?? id; }
    translatedLabels(term: GlossaryTermSummary): string { return term.labels.map(label => `${label.language.toUpperCase()}: ${label.preferredLabel}${label.alternativeLabels.length ? ` (auch: ${label.alternativeLabels.join(', ')})` : ''}`).join(' · '); }
    isTermTarget(id: string): (term: GlossaryTermSummary) => boolean { return term => term.id === id; }
    closeDialog(): void { this.edgeEdit.set(null); this.termEdit.set(null); this.error.set(''); this.focusCanvas(); }
    private focusCanvas(): void { afterNextRender(() => { const node = [...this.host.nativeElement.querySelectorAll<HTMLElement>('[data-node-id]')].find(value => value.dataset['nodeId'] === this.selectedNode()); (node?.querySelector<HTMLElement>('header') ?? this.host.nativeElement.querySelector<HTMLElement>('.semantic-graph'))?.focus(); }, { injector: this.injector }); }
    trapDialog(event: KeyboardEvent): void { if (event.key !== 'Tab')
        return; const items = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('input,select,textarea,button:not(:disabled),a[href]')]; const first = items[0], last = items.at(-1); if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
    }
    else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
    } }
    menuKeydown(event: KeyboardEvent): void { if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key))
        return; event.preventDefault(); const items = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role=menuitem]:not(:disabled)')], index = items.indexOf(document.activeElement as HTMLElement); items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus(); }
    private pinLayout(): void {
        this.positions.set(Object.fromEntries(this.nodes().map(node => [node.id, {x: node.x, y: node.y}])));
        this.storeLayout();
    }
    private positionEdge(edge: Edge): EdgeView | null { const source = this.nodes().find(node => node.id === edge.source), target = this.nodes().find(node => node.id === edge.target); if (!source || !target)
        return null; const right = target.x + 115 >= source.x + 115; const start = { x: source.x + (right ? 230 : 0), y: source.y + 50 }, end = { x: target.x + (right ? 0 : 230), y: target.y + 50 }; const moving = this.endpointPoint(); if (moving && this.drag?.edge?.id === edge.id)
        Object.assign(this.drag.side === 'source' ? start : end, moving); const bend = Math.max(60, Math.abs(end.x - start.x) * .4), sign = right ? 1 : -1; return { ...edge, start, end, path: `M ${start.x} ${start.y} C ${start.x + sign * bend} ${start.y}, ${end.x - sign * bend} ${end.y}, ${end.x} ${end.y}`, x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - 7 }; }
    startNodeDrag(node: Node, event: PointerEvent): void { if (event.button !== 0 || this.saving())
        return; event.preventDefault(); this.closeMenus(); this.selectedNode.set(node.id); this.drag = { nodeId: node.id, pointerId: event.pointerId, start: this.canvasPoint(event), position: { x: node.x, y: node.y }, handle: event.currentTarget as Element, moved: false }; this.capture(event); }
    private capture(event: PointerEvent): void { try {
        (event.currentTarget as Element).setPointerCapture(event.pointerId);
    }
    catch { } }
    @HostListener('document:pointermove', ['$event'])
    pointerMove(event: PointerEvent): void { const drag = this.drag; if (!drag || drag.pointerId !== event.pointerId)
        return; const point = this.canvasPoint(event); const dx = point.x - drag.start.x, dy = point.y - drag.start.y; this.endpointPoint.set(point); if (Math.hypot(dx, dy) < 3 && !drag.moved)
        return; drag.moved = true; event.preventDefault(); if (drag.nodeId)
        this.moveNode(drag.nodeId, { x: drag.position.x + dx, y: drag.position.y + dy }, false); }
    @HostListener('document:pointerup', ['$event'])
    pointerUp(event: PointerEvent): void {
        const drag = this.drag;
        if (!drag || drag.pointerId !== event.pointerId)
            return;
        // Resolve the drop before clearing preview/capture: those updates can
        // change SVG hit testing and the current scroll position.
        const droppedTerm = document.elementsFromPoint(event.clientX,event.clientY)
            .map(element=>element.closest<HTMLElement>('[data-term-id]')).find(Boolean)?.dataset['termId'];
        this.drag = null;
        this.endpointPoint.set(null);
        try {
            drag.handle.releasePointerCapture(event.pointerId);
        }
        catch { }
        this.suppressedClick = !!drag.nodeId && drag.moved;
        if (drag.nodeId && drag.moved)
            this.storeLayout();
        if (drag.edge && drag.side) {
            const id = droppedTerm;
            if (id) {
                this.rewire(drag.edge, drag.side, id);
                if (!this.error()) this.notice.set(`Linienende auf „${this.nodeLabel(`term:${id}`)}“ abgelegt.`);
            } else this.notice.set('Linienende unverändert: auf einem Begriff dieser Domäne ablegen.');
        }
        if (!drag.edge && this.connecting() && drag.moved) {
            if (droppedTerm) this.finishConnection(droppedTerm);
        }
    }
    @HostListener('document:pointercancel', ['$event'])
    pointerCancel(event: PointerEvent): void { if (this.drag?.pointerId === event.pointerId)
        this.cancelDrag(); }
    private cancelDrag(): void { if (this.drag?.nodeId)
        this.moveNode(this.drag.nodeId, this.drag.position, false); try {
        this.drag?.handle.releasePointerCapture(this.drag.pointerId);
    }
    catch { } this.drag = null; this.endpointPoint.set(null); this.connecting.set(null); }
    nodeKeydown(node: Node, event: KeyboardEvent): void { if (event.key === 'F10' && event.shiftKey) {
        event.preventDefault();
        this.openNodeMenu(node.id, event);
        return;
    } const direction = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[event.key]; if (direction && !this.saving()) {
        event.preventDefault();
        event.stopPropagation();
        const step = event.shiftKey ? 40 : 10;
        this.moveNode(node.id, { x: node.x + direction[0] * step, y: node.y + direction[1] * step });
    } }
    nodeClicked(node: Node, event: Event): void { event.stopPropagation(); if (this.suppressedClick) {
        this.suppressedClick = false;
        return;
    } if (this.connecting() && node.kind === 'term') {
        this.finishConnection(node.id.slice(5));
        return;
    } this.selectedNode.set(node.id); }
    openNodeMenu(id: string | null, event: Event): void { event.preventDefault(); event.stopPropagation(); if (this.suppressedClick)
        this.suppressedClick = false; this.closeMenus(); this.selectedNode.set(id); const r = this.host.nativeElement.querySelector('.network-editor')!.getBoundingClientRect(); const target = (event.currentTarget as Element).getBoundingClientRect(); this.menu.set({ nodeId: id, x: Math.max(4, Math.min((event instanceof MouseEvent ? event.clientX : target.left) - r.left, r.width - 280)), y: Math.max(4, Math.min((event instanceof MouseEvent ? event.clientY : target.bottom) - r.top, Math.min(r.height, innerHeight - r.top) - 200)) }); afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('.concept-context-menu button,.concept-context-menu a')?.focus(), { injector: this.injector }); }
    closeMenus(): void { this.menu.set(null); }
    blankContext(event: MouseEvent): void { if (!(event.target as Element).closest('.graph-node,.graph-relationship,.concept-context-menu'))
        this.openNodeMenu(null, event); }
    beginConnection(termId: string, event?: PointerEvent): void { if (!this.editable())
        return; event?.preventDefault(); event?.stopPropagation(); this.closeMenus(); this.connecting.set(termId);  if (event) {
        this.drag = { pointerId: event.pointerId, start: this.canvasPoint(event), position: { x: 0, y: 0 }, handle: event.currentTarget as Element, moved: false };
        this.capture(event);
    } }
    finishConnection(targetId: string): void { const source = this.connecting(); if (!source || source === targetId) {
        this.connecting.set(null);
        return;
    } this.connecting.set(null); this.edgeEdit.set({ original: null, source, target: targetId, type: 'related' }); this.focusDialog(); }
    openEdge(edge: Edge, event?: Event): void { event?.preventDefault(); event?.stopPropagation(); this.closeMenus(); this.selectedEdge.set(edge.id); if (!edge.relation) {
        this.notice.set('Domänen- und Produktzuordnungen werden über die jeweilige Zuordnung bearbeitet.');
        return;
    } this.edgeEdit.set({ original: edge, source: edge.sourceTermId!, target: edge.relation.targetTermId ?? `uri:${edge.relation.targetUri}`, type: edge.relation.relationType }); this.error.set(''); this.focusDialog(); }
    private focusDialog(): void { afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('.concept-dialog input,.concept-dialog select')?.focus(), { injector: this.injector }); }
    changeEdge(field: 'source' | 'target' | 'type', value: string): void { this.edgeEdit.update(edit => edit ? { ...edit, [field]: value } : edit); }
    editTerm(id: string): void { const term = this.values().find(value => value.id === id); if (!term || !this.editable())
        return; if (this.pending().some(item => item.termId === id)) {
        this.error.set('Für diesen Begriff ist bereits ein Vorschlag in Prüfung.');
        return;
    } this.closeMenus(); this.termEdit.set({ id, label: term.preferredLabel, definition: term.definition }); this.focusDialog(); }
    changeTerm(field: 'label' | 'definition', value: string): void { this.termEdit.update(edit => edit ? { ...edit, [field]: value } : edit); }
    applyTerm(): void { const edit = this.termEdit(); if (!edit || !edit.label.trim() || !edit.definition.trim() || !this.editable())
        return; const current = this.values().find(term => term.id === edit.id); if (current?.preferredLabel === edit.label.trim() && current.definition === edit.definition.trim()) {
        this.termEdit.set(null);
        return;
    } this.markDirty(edit.id); this.pinLayout(); this.values.update(items => items.map(term => term.id === edit.id ? { ...term, preferredLabel: edit.label.trim(), definition: edit.definition.trim(), labels: term.labels.some(label => label.language === 'de') ? term.labels.map(label => label.language === 'de' ? { ...label, preferredLabel: edit.label.trim(), definition: edit.definition.trim() } : label) : [...term.labels, { language: 'de', preferredLabel: edit.label.trim(), definition: edit.definition.trim(), alternativeLabels: [] }] } : term)); this.termEdit.set(null); this.notice.set('Begriff im lokalen Entwurf geändert. Zum Freigeben Änderungen einreichen.'); this.storeDraft(); this.focusCanvas(); }
    private markDirty(id: string): void { if (id in this.dirty())
        return; const revision = this.terms().find(term => term.id === id)?.revision; if (revision)
        this.dirty.update(items => ({ ...items, [id]: revision })); }
    applyEdge(): void {
        const edit = this.edgeEdit();
        if (!edit || !this.editable())
            return;
        this.error.set('');
        if (edit.original?.sourceTermId === edit.source && edit.original.relation?.relationType === edit.type && (edit.original.relation.targetTermId ?? `uri:${edit.original.relation.targetUri}`) === edit.target) {
            this.closeDialog();
            return;
        }
        if (edit.source === edit.target) {
            this.error.set('Ein Begriff kann nicht mit sich selbst verbunden werden.');
            return;
        }
        const source = this.values().find(term => term.id === edit.source);
        if (!source) {
            this.error.set('Der Ausgangsbegriff gehört nicht zu dieser Domäne.');
            return;
        }
        if (this.pending().some(item => item.termId === edit.source || item.termId === edit.original?.sourceTermId)) {
            this.error.set('Für diesen Begriff ist bereits ein Vorschlag in Prüfung. Öffnen Sie dessen Prüfstatus.');
            return;
        }
        const external = edit.target.startsWith('uri:');
        const target = this.values().find(term => term.id === edit.target);
        if (!external && !target && edit.original?.relation?.targetTermId !== edit.target) {
            this.error.set('Bitte einen Begriff dieser Domäne auswählen.');
            return;
        }
        const duplicate = source.relations.some(relation => relation.id !== edit.original?.relationId && relation.relationType === edit.type && (external ? relation.targetUri === edit.target.slice(4) : relation.targetTermId === edit.target));
        if (duplicate) {
            this.error.set('Diese Beziehung besteht bereits.');
            return;
        }
        const relation: GlossaryTermRelation = { id: edit.original?.relationId ?? `draft:${crypto.randomUUID()}`, relationType: edit.type, targetTermId: external ? null : edit.target, targetUri: external ? edit.target.slice(4) : '', targetLabel: target?.preferredLabel ?? edit.original?.relation?.targetLabel ?? edit.target };
        const previous = this.values();
        const next = previous.map(term => ({ ...term, relations: [...term.relations.filter(item => !(term.id === edit.original?.sourceTermId && item.id === edit.original.relationId)), ...(term.id === edit.source ? [relation] : [])] }));
        if (this.hasHierarchyCycle(next)) {
            this.error.set('Diese Beziehung würde einen Kreis in der Ober-/Unterbegriffshierarchie erzeugen.');
            return;
        }
        if (edit.original?.sourceTermId)
            this.markDirty(edit.original.sourceTermId);
        this.markDirty(edit.source);
        this.pinLayout();
        this.values.set(next);
        this.edgeEdit.set(null);
        this.selectedEdge.set(`relation:${edit.source}:${relation.id}`);
        this.notice.set('Beziehung im lokalen Entwurf übernommen. Zum Freigeben Änderungen einreichen.');
        this.storeDraft();
        this.focusCanvas();
    }
    private hasHierarchyCycle(terms: readonly GlossaryTermSummary[]): boolean { const graph = new Map<string, string[]>(); for (const term of terms)
        for (const relation of term.relations) {
            if (!relation.targetTermId)
                continue;
            const source = relation.relationType === 'narrower' ? relation.targetTermId : term.id, target = relation.relationType === 'narrower' ? term.id : relation.targetTermId;
            if (relation.relationType === 'broader' || relation.relationType === 'narrower')
                graph.set(source, [...(graph.get(source) ?? []), target]);
        } const seen = new Set<string>(), active = new Set<string>(); const visit = (id: string): boolean => { if (active.has(id))
        return true; if (seen.has(id))
        return false; active.add(id); for (const target of graph.get(id) ?? [])
        if (visit(target))
            return true; active.delete(id); seen.add(id); return false; }; return [...graph.keys()].some(visit); }
    deleteEdge(): void { const edge = this.edgeEdit()?.original; if (!edge?.sourceTermId || !edge.relationId || !this.editable())
        return; if (this.pending().some(item => item.termId === edge.sourceTermId)) {
        this.error.set('Dieser Begriff hat bereits einen Vorschlag in Prüfung.');
        return;
    } this.markDirty(edge.sourceTermId); this.pinLayout(); this.values.update(items => items.map(term => term.id === edge.sourceTermId ? { ...term, relations: term.relations.filter(relation => relation.id !== edge.relationId) } : term)); this.edgeEdit.set(null); this.selectedEdge.set(null); this.notice.set('Beziehung im lokalen Entwurf entfernt. Zum Freigeben Änderungen einreichen.'); this.storeDraft(); this.focusCanvas(); }
    startEndpoint(edge: Edge, side: 'source' | 'target', event: PointerEvent): void { if (!edge.relation || !this.editable())
        return; event.preventDefault(); event.stopPropagation(); this.drag = { edge, side, pointerId: event.pointerId, start: this.canvasPoint(event), position: { x: 0, y: 0 }, handle: event.currentTarget as Element, moved: false }; this.capture(event); }
    rewire(edge: Edge, side: 'source' | 'target', termId: string): void { if (!edge.relation || !this.editable())
        return; this.edgeEdit.set({ original: edge, source: side === 'source' ? termId : edge.sourceTermId!, target: side === 'target' ? termId : edge.relation.targetTermId ?? `uri:${edge.relation.targetUri}`, type: edge.relation.relationType }); this.applyEdge(); }
    discard(): void { if (!this.dirtyCount() || !window.confirm('Lokale Begriffs- und Beziehungsänderungen verwerfen?'))
        return; const ids = new Set(Object.keys(this.dirty())); this.values.update(items => items.map(term => ids.has(term.id) ? this.terms().find(value => value.id === term.id) ?? term : term)); this.dirty.set({}); this.storeDraft(); this.error.set(''); }
    async submit(): Promise<void> { if (this.saveReason())
        return; this.saving.set(true); this.error.set(''); try {
        for (const id of Object.keys(this.dirty())) {
            const term = this.values().find(value => value.id === id)!;
            const proposal = await firstValueFrom(this.api.createGlossaryTermProposal({ operation: 'update', targetTermId: id, expectedTargetRevision: this.dirty()[id], autoAttach: false, domainIds: term.domains.map(domain => domain.id), labels: term.labels.map(label => ({ language: label.language, preferredLabel: label.preferredLabel, alternativeLabels: label.alternativeLabels, definition: label.definition })), relations: term.relations.map(relation => ({ relation: relation.relationType, targetTermId: relation.targetTermId, targetUri: relation.targetTermId ? null : relation.targetUri })) }));
            this.pending.update(items => [...items, { termId: id, proposalId: proposal.id }]);
            this.dirty.update(items => { const next = { ...items }; delete next[id]; return next; });
            this.storeDraft();
        }
        this.notice.set('Änderungen zur Domänenfreigabe eingereicht. Die angezeigte Vorschau ist noch nicht publiziert.');
    }
    catch (error) {
        this.error.set((error as {
            error?: {
                detail?: string;
            };
        })?.error?.detail ?? 'Einreichen fehlgeschlagen. Noch nicht eingereichte Änderungen bleiben im lokalen Entwurf erhalten.');
    }
    finally {
        this.saving.set(false);
    } }
    isDirtyTerm(id:string):boolean{return id in this.dirty();}
    isDirtyEdge(edge: Edge): boolean { return !!edge.sourceTermId && edge.sourceTermId in this.dirty(); }
    isDirtyNode(node: Node): boolean { return node.kind === 'term' && node.id.slice(5) in this.dirty(); }
    isPendingNode(node: Node): boolean { return this.pending().some(item => node.id === `term:${item.termId}`); }
    zoomGraph(delta: number): void { this.zoom.update(value => Math.min(1.6, Math.max(.4, Math.round((value + delta) * 10) / 10))); }
    async toggleFullscreen(trigger: HTMLElement): Promise<void> { if (this.fullscreen()) {
        await this.exitFullscreen();
        return;
    } this.fullscreenTrigger = trigger; this.previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; this.fullscreen.set(true); try {
        await this.host.nativeElement.querySelector<HTMLElement>('.network-editor')?.requestFullscreen?.();
    }
    catch { /* The same viewport-filling editor remains available without native fullscreen. */ } }
    private async exitFullscreen(): Promise<void> { if (document.fullscreenElement === this.host.nativeElement.querySelector('.network-editor'))
        await document.exitFullscreen(); this.restoreFullscreen(); }
    private restoreFullscreen(): void { if (!this.fullscreen())
        return; this.fullscreen.set(false); document.body.style.overflow = this.previousOverflow; this.fullscreenTrigger?.focus(); }
    @HostListener('document:fullscreenchange')
    fullscreenChanged(): void { if (!document.fullscreenElement)
        this.restoreFullscreen(); }
    @HostListener('document:keydown.escape', ['$event'])
    escape(event: Event): void { if (this.edgeEdit() || this.termEdit() || this.menu() || this.connecting() || this.drag) {
        event.preventDefault();
        event.stopPropagation();
        this.edgeEdit.set(null);
        this.termEdit.set(null);
        this.menu.set(null);
        this.cancelDrag();
        this.focusCanvas();
    }
    else if (this.fullscreen()) {
        event.preventDefault();
        void this.exitFullscreen();
    } }
    @HostListener('window:beforeunload', ['$event'])
    beforeUnload(event: BeforeUnloadEvent): void { if (this.dirtyCount() || this.saving()) {
        event.preventDefault();
        event.returnValue = '';
    } }
    canDeactivate(): boolean { return !this.saving() && (!this.dirtyCount() || window.confirm('Es gibt noch nicht eingereichte Änderungen am Begriffsnetz. Seite verlassen? Der lokale Entwurf bleibt in diesem Tab erhalten.')); }
    ngOnDestroy(): void { this.cancelDrag(); this.restoreFullscreen(); }
    async printCanvas(): Promise<void> { const canvas = this.host.nativeElement.querySelector<HTMLElement>('.graph-canvas'); if (!canvas)
        return; this.printing.set(true); try {
        await printMappingCanvas(canvas, `${this.domain().preferredLabel} · Begriffsnetz${this.dirtyCount() ? ' · Lokaler Entwurf' : this.pending().length ? ' · Vorschau in Prüfung' : ''}`, { modelUpdatedAt: [this.domain().updatedAt, ...this.values().map(term => term.updatedAt)].sort().at(-1) ?? this.domain().updatedAt, modelRevision: this.domain().revision });
    }
    catch {
        this.error.set('Die Druckansicht konnte nicht geöffnet werden.');
    }
    finally {
        this.printing.set(false);
    } }
}
