/** Illustrative SDAL flow; these samples never evaluate or publish a real access policy. */
export const ACCESS_CYCLE = 32;
export const ACCESS_PHASE_TIMES = [0, 6, 10, 14, 20] as const;
export const APPLICATION_RECEIVED_AT = 9.2;
export const OWNER_REVIEW_START = 12.2;
export const POLICY_DRAFT_START = 14;
export const POLICY_DISTRIBUTE_START = 16.4;
export const POLICY_ASSIGNED_AT = 19.2;
export const POLICY_ACTIVE_AT = 20;
export const ACCESS_READ_START = 20.8;
export const ACCESS_DATA_START = 24.9;
export const ACCESS_RETURN_END = 28.4;
export const ACCESS_LANE_Y = [190, 350, 510] as const;

type Point = { x: number; y: number };
export interface AccessPacket extends Point { opacity: number; }
export interface AccessRequest { consumer: string; action: string; }
export type AccessScope = 'logical-model' | 'persistences';
export interface AccessPolicyScope { level: AccessScope; persistenceIndexes?: readonly number[]; }
export interface AccessAuditEntry {
  readonly id: string; readonly at: number; readonly lane: number; readonly consumer: string; readonly action: string;
  readonly decision: 'allow' | 'deny';
  readonly reason: 'no-active-policy' | 'policy-unavailable' | 'out-of-scope' | 'request-mismatch' | 'allowed';
}
export interface AccessLaneState {
  y: number; inScope: boolean; assigned: boolean; active: boolean; allowed: boolean; delivered: boolean;
  request: AccessPacket; rejection: AccessPacket; data: AccessPacket; policy: AccessPacket;
}
export interface AccessState {
  phase: 0 | 1 | 2 | 3 | 4;
  applicationStage: 'none' | 'submitting' | 'submitted' | 'forwarding' | 'review' | 'approved';
  applicationToken: AccessPacket; reviewToken: AccessPacket;
  policyStage: 'absent' | 'draft' | 'distributing' | 'assigned' | 'active' | 'unavailable';
  allowed: boolean; authoring: boolean; authorProgress: number; authorToken: AccessPacket;
  scope: AccessScope; scopeCount: number; policyStored: boolean; audit: readonly AccessAuditEntry[];
  receivedCount: number; lanes: AccessLaneState[];
}
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (t: number) => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
function curve(a: Point, b: Point, c: Point, d: Point, t: number): Point {
  const u = 1 - t;
  return { x: u ** 3 * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t ** 3 * d.x,
    y: u ** 3 * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t ** 3 * d.y };
}
const consumerGate = (y: number, t: number) => curve({ x: 250, y: 350 }, { x: 430, y: 350 }, { x: 520, y }, { x: 760, y }, t);
const gateStore = (y: number, t: number): Point => ({ x: mix(760, 1010, t), y });
const hidden = (point: Point): AccessPacket => ({ ...point, opacity: 0 });
function moving(seconds: number, start: number, end: number, path: (t: number) => Point): AccessPacket {
  if (seconds < start || seconds >= end) return hidden(path(seconds < start ? 0 : 1));
  return { ...path(ease(clamp((seconds - start) / (end - start)))), opacity: 1 };
}

/** Invalid selections deny every persistence; valid repeats represent one selected resource. */
function selectedScope(config: AccessPolicyScope): { scope: AccessScope; indexes: ReadonlySet<number> } {
  if (config?.level === 'logical-model') return { scope: 'logical-model', indexes: new Set(ACCESS_LANE_Y.map((_, index) => index)) };
  const indexes = config?.persistenceIndexes;
  const valid = config?.level === 'persistences' && Array.isArray(indexes) && indexes.length > 0
    && Array.from(indexes).every(index => Number.isInteger(index) && index >= 0 && index < ACCESS_LANE_Y.length);
  return { scope: 'persistences', indexes: new Set(valid ? indexes : []) };
}

/** Missing/unavailable policy and every nonmatching request remain denied, even after activation. */
export function sampleAccessState(seconds: number, request: AccessRequest | null = { consumer: 'consumer-a', action: 'read' }, policyAvailable = true,
  policyScope: AccessPolicyScope = { level: 'logical-model' }): AccessState {
  const time = Number.isFinite(seconds) ? Math.max(0, Math.min(ACCESS_CYCLE, seconds)) : 0;
  const phase = time < ACCESS_PHASE_TIMES[1] ? 0 : time < ACCESS_PHASE_TIMES[2] ? 1
    : time < POLICY_DRAFT_START ? 2 : time < POLICY_ACTIVE_AT ? 3 : 4;
  const applicationStage = time < ACCESS_PHASE_TIMES[1] ? 'none' : time < APPLICATION_RECEIVED_AT ? 'submitting'
    : time < 10.4 ? 'submitted' : time < OWNER_REVIEW_START ? 'forwarding'
      : time < POLICY_DRAFT_START ? 'review' : 'approved';
  const selected = selectedScope(policyScope);
  const requestMatches = request?.consumer === 'consumer-a' && request.action === 'read';
  const policyStage = time < POLICY_DRAFT_START ? 'absent' : time < POLICY_DISTRIBUTE_START ? 'draft'
    : time < POLICY_ASSIGNED_AT ? 'distributing' : time < POLICY_ACTIVE_AT ? 'assigned'
      : policyAvailable ? 'active' : 'unavailable';
  const lanes = ACCESS_LANE_Y.map((y, index): AccessLaneState => {
    const inScope = selected.indexes.has(index);
    const active = time >= POLICY_ACTIVE_AT && policyAvailable && inScope;
    const allowed = active && requestMatches;
    const stagger = index * .18;
    const assignedAt = [18.8, 19, POLICY_ASSIGNED_AT][index];
    const earlyStart = .8 + stagger, earlyGate = 2.2 + stagger, earlyReturn = 3 + stagger, earlyEnd = 4.5 + stagger;
    const readStart = ACCESS_READ_START + stagger, readGate = 22.4 + stagger, readStore = 24.2 + stagger;
    let outbound = hidden({ x: 250, y: 350 }), rejection = hidden({ x: 760, y }), data = hidden({ x: 1010, y });
    if (time < POLICY_DRAFT_START) {
      outbound = moving(time, earlyStart, earlyGate, t => consumerGate(y, t));
      if (time >= earlyGate && time < earlyReturn) rejection = { x: 760, y, opacity: 1 };
      else rejection = moving(time, earlyReturn, earlyEnd, t => consumerGate(y, 1 - t));
    } else if (time >= ACCESS_READ_START) {
      if (time < readGate) outbound = moving(time, readStart, readGate, t => consumerGate(y, t));
      else if (allowed) outbound = moving(time, readGate, readStore, t => gateStore(y, t));
      else if (time < 23.1 + stagger && time >= readGate) rejection = { x: 760, y, opacity: 1 };
      else if (!allowed) rejection = moving(time, 23.1 + stagger, 25 + stagger, t => consumerGate(y, 1 - t));
      // Data originates only after this matching request reached its protected store.
      if (allowed) {
        const fromStore = ACCESS_DATA_START + stagger, throughGate = 26.1 + stagger;
        data = time < throughGate
          ? moving(time, fromStore, throughGate, t => gateStore(y, 1 - t))
          : moving(time, throughGate, ACCESS_RETURN_END, t => consumerGate(y, 1 - t));
      }
    }
    return { y, inScope, assigned: inScope && time >= assignedAt, active, allowed,
      delivered: allowed && time >= ACCESS_RETURN_END, request: outbound, rejection, data,
      policy: inScope ? moving(time, POLICY_DISTRIBUTE_START + index * .15, assignedAt,
        t => curve({ x: 535, y: 155 }, { x: 595, y: 185 }, { x: 645, y }, { x: 760, y }, t)) : hidden({ x: 760, y }) };
  });
  const audit: AccessAuditEntry[] = [];
  for (let index = 0; index < ACCESS_LANE_Y.length; index++) {
    for (const [attempt, at] of [[0, 2.2 + index * .18], [1, 22.4 + index * .18]] as const) {
      if (time < at) continue;
      const reason: AccessAuditEntry['reason'] = at < POLICY_ACTIVE_AT ? 'no-active-policy'
        : !policyAvailable ? 'policy-unavailable' : !selected.indexes.has(index) ? 'out-of-scope'
          : !requestMatches ? 'request-mismatch' : 'allowed';
      audit.push({ id: `access-${attempt}-${index}`, at, lane: index,
        consumer: request?.consumer ?? 'unknown', action: request?.action ?? 'unknown',
        decision: reason === 'allowed' ? 'allow' : 'deny', reason });
    }
  }
  audit.sort((a, b) => a.at - b.at || a.lane - b.lane);
  return { phase, applicationStage, policyStage, allowed: lanes.some(lane => lane.allowed), lanes,
    applicationToken: moving(time, 6.6, APPLICATION_RECEIVED_AT,
      t => curve({ x: 250, y: 315 }, { x: 315, y: 315 }, { x: 325, y: 135 }, { x: 400, y: 135 }, t)),
    reviewToken: moving(time, 10.4, OWNER_REVIEW_START,
      t => curve({ x: 535, y: 35 }, { x: 535, y: 12 }, { x: 232, y: 12 }, { x: 232, y: 40 }, t)),
    scope: selected.scope, scopeCount: selected.indexes.size, policyStored: time >= POLICY_DISTRIBUTE_START, audit,
    authoring: time >= POLICY_DRAFT_START && time < POLICY_DISTRIBUTE_START,
    authorProgress: clamp((time - POLICY_DRAFT_START) / (POLICY_DISTRIBUTE_START - POLICY_DRAFT_START)),
    authorToken: moving(time, 14.4, POLICY_DISTRIBUTE_START,
      t => curve({ x: 315, y: 85 }, { x: 355, y: 65 }, { x: 395, y: 85 }, { x: 535, y: 105 }, t)),
    receivedCount: lanes.filter(lane => lane.delivered).length };
}

/** One decorative SVG clock, cancellable on pause, hidden tabs and navigation. */
export class AccessAnimator {
  private readonly packets: Array<{ node: SVGGElement; lane: number; kind: 'request' | 'rejection' | 'data' | 'policy' }>;
  private readonly gates: SVGGElement[];
  private readonly authorToken: SVGGElement | null;
  private readonly applicationToken: SVGGElement | null;
  private readonly reviewToken: SVGGElement | null;
  private readonly authorLine: SVGLineElement | null;
  private readonly rule: SVGGElement | null;
  private readonly receipt: SVGGElement | null;
  private elapsed = 0;
  private frame: number | undefined;
  private lastTime: number | undefined;
  private lastReported = -Infinity;
  private policyScope: AccessPolicyScope = { level: 'logical-model' };

  constructor(svg: SVGElement, private readonly view: Window, private readonly reportPosition: (seconds: number) => void = () => {}, initialPosition = 0) {
    this.packets = [...svg.querySelectorAll<SVGGElement>('[data-packet]')].map(node => ({ node,
      lane: Number(node.getAttribute('data-lane')), kind: node.getAttribute('data-packet') as 'request' | 'rejection' | 'data' | 'policy' }));
    this.gates = [...svg.querySelectorAll<SVGGElement>('.access-gate')];
    this.authorToken = svg.querySelector('.access-author-token');
    this.applicationToken = svg.querySelector('.access-application-token');
    this.reviewToken = svg.querySelector('.access-review-token');
    this.authorLine = svg.querySelector('.access-author-line');
    this.rule = svg.querySelector('.access-policy-rule');
    this.receipt = svg.querySelector('.access-receipt');
    this.seek(initialPosition);
  }

  setRunning(running: boolean): void {
    this.stop();
    if (!running) return;
    const tick = (time: number) => {
      if (this.lastTime !== undefined) this.elapsed = (this.elapsed + Math.min((time - this.lastTime) / 1000, .1)) % ACCESS_CYCLE;
      this.lastTime = time;
      this.draw();
      if (Math.abs(this.elapsed - this.lastReported) >= .1) this.report();
      this.frame = this.view.requestAnimationFrame(tick);
    };
    this.frame = this.view.requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.frame !== undefined) this.view.cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.lastTime = undefined;
  }

  /** Re-project a changed grant at the retained playhead; no reset or new audit writes. */
  setPolicyScope(config: AccessPolicyScope): void {
    const selected = selectedScope(config);
    this.policyScope = { level: selected.scope, persistenceIndexes: [...selected.indexes] };
    this.draw();
  }

  seek(seconds: number): void {
    if (!Number.isFinite(seconds)) return;
    this.elapsed = Math.max(0, Math.min(ACCESS_CYCLE, seconds));
    this.lastTime = undefined;
    this.draw();
    this.report();
  }

  private report(): void { this.lastReported = this.elapsed; this.reportPosition(this.elapsed); }
  private packet(node: SVGGElement, packet: AccessPacket): void {
    node.setAttribute('transform', `translate(${packet.x} ${packet.y})`);
    node.setAttribute('opacity', String(packet.opacity));
  }
  private draw(): void {
    const state = sampleAccessState(this.elapsed, undefined, true, this.policyScope);
    this.packets.forEach(({ node, lane, kind }) => this.packet(node, state.lanes[lane][kind]));
    this.gates.forEach((node, index) => {
      const lane = state.lanes[index];
      node.setAttribute('data-active', String(lane.active));
      node.querySelector('.gate-cross')?.setAttribute('opacity', lane.allowed ? '0' : '1');
      node.querySelector('.gate-tick')?.setAttribute('opacity', lane.allowed ? '1' : '0');
      node.querySelector('.gate-policy-check')?.setAttribute('opacity', lane.assigned ? '1' : '0');
    });
    if (this.authorToken) this.packet(this.authorToken, state.authorToken);
    if (this.applicationToken) this.packet(this.applicationToken, state.applicationToken);
    if (this.reviewToken) this.packet(this.reviewToken, state.reviewToken);
    this.authorLine?.setAttribute('x2', String(445 + 140 * state.authorProgress));
    this.rule?.setAttribute('opacity', state.authorProgress >= 1 ? '1' : '0');
    this.receipt?.setAttribute('opacity', state.receivedCount > 0 ? '1' : '0');
    this.receipt?.querySelectorAll<SVGCircleElement>('circle').forEach((node, index) => {
      const lane = node.hasAttribute('data-receipt-lane') ? Number(node.getAttribute('data-receipt-lane')) : index;
      node.setAttribute('opacity', state.lanes[lane]?.delivered ? '1' : '0');
    });
  }
}
