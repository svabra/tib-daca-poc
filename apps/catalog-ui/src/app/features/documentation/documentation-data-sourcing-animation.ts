/** One illustrative PostgreSQL sourcing task. No real tasks, credentials or data access. */
export const SOURCING_CYCLE = 24;
export const SOURCING_STATION_TIMES = [0, 5, 9, 14] as const;
export const SOURCING_WIZARD_TIMES = [.4, 1.6, 2.8] as const;
export const SOURCING_COLOR = '#6594dd';
export const SOURCING_FLIGHT_SECONDS = 4;
export const SOURCING_GEOMETRY = {
  source: { x: 145, y: 330 }, security: { x: 390, y: 330 }, connector: { x: 650, y: 330 },
  task: { x: 650, y: 190 }, taskArrival: { x: 650, y: 250 },
  checkStart: { x: 650, y: 250 }, checkEnd: { x: 390, y: 245 },
  rawX: 1035, structuredY: 215, unstructuredY: 450,
  // The end roller sits outside the doorway; its 11 px belt cap clears the frame and sill.
  bridgePivot: { x: 692, y: 349 }, bridgeLanding: { x: 440, y: 349 }, bridgeFoldedLength: 32,
} as const;
export type SourcingKind = 'structured' | 'unstructured';
export interface SourcingPoint { x: number; y: number; opacity: number; }
export const SOURCING_EVENTS = Object.freeze(Array.from({ length: 6 }, (_, id) => Object.freeze({ id, startTime: 14 + id * .7 })));
export const SOURCING_MOTION = {
  doorOpenStart: 12, doorOpenEnd: 12.9,
  // Close only after the last packet and its halo have cleared the doorway.
  doorCloseStart: SOURCING_EVENTS.at(-1)!.startTime + 1.6,
  doorCloseEnd: SOURCING_EVENTS.at(-1)!.startTime + 2.3,
  beltStart: SOURCING_EVENTS[0].startTime,
  beltEnd: SOURCING_EVENTS.at(-1)!.startTime + SOURCING_FLIGHT_SECONDS,
  bridgeFoldStart: 21.6, bridgeFoldEnd: 22.5,
} as const;
export interface SourcingPacket extends SourcingPoint { id: number; kind: SourcingKind; }
export interface SourcingState {
  station: 0 | 1 | 2 | 3; wizardSteps: readonly number[]; securityChecked: boolean; jobReady: boolean;
  jobStatus: 'created' | 'submitted' | 'checking' | 'running' | 'completed' | 'blocked';
  control: SourcingPoint; check: SourcingPoint; introspection: SourcingPoint;
  packets: readonly SourcingPacket[]; stored: { structured: number; unstructured: number };
  doorOpen: number; beltTravel: number; extracting: boolean;
  bridge: { deployment: number; angle: number; length: number };
}
type Point = { x: number; y: number };
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => n * n * (3 - 2 * n);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
function curve(a: Point, b: Point, c: Point, d: Point, t: number): Point {
  const u = 1 - t;
  return { x: u ** 3 * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t ** 3 * d.x,
    y: u ** 3 * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t ** 3 * d.y };
}
export function sampleSourcingState(seconds: number, target: SourcingKind = 'structured', authorized = true): SourcingState {
  const time = Number.isFinite(seconds) ? Math.max(0, Math.min(SOURCING_CYCLE, seconds)) : 0;
  const station = time < 5 ? 0 : time < 9 ? 1 : time < 14 ? 2 : 3;
  const securityChecked = time >= 12, jobReady = authorized && time >= 13.5;
  const g = SOURCING_GEOMETRY;
  const transfer = (start: number, end: number, path: (progress: number) => Point): SourcingPoint => ({
    ...path(ease(clamp((time - start) / (end - start)))), opacity: time >= start && time < end ? 1 : 0,
  });
  const control = transfer(5, 8, t => ({ x: g.task.x, y: mix(g.task.y, g.taskArrival.y, t) }));
  const check = transfer(9, 11.5, t => curve(g.checkStart, { x: 610, y: 205 }, { x: 430, y: 205 }, g.checkEnd, t));
  const introspection = transfer(12, 13.5, t => curve(g.checkEnd, { x: 430, y: 205 }, { x: 610, y: 205 }, g.checkStart, t));
  if (!authorized) introspection.opacity = 0;
  const motion = SOURCING_MOTION;
  const doorOpen = authorized ? ease(clamp((time - motion.doorOpenStart) / (motion.doorOpenEnd - motion.doorOpenStart)))
    * (1 - ease(clamp((time - motion.doorCloseStart) / (motion.doorCloseEnd - motion.doorCloseStart)))) : 0;
  const beltTravel = authorized ? Math.max(0, Math.min(time, motion.beltEnd) - motion.beltStart) * 36 : 0;
  const extracting = authorized && time >= motion.beltStart && time < motion.beltEnd;
  const deployment = authorized ? ease(clamp((time - motion.doorOpenStart) / (motion.doorOpenEnd - motion.doorOpenStart)))
    * (1 - ease(clamp((time - motion.bridgeFoldStart) / (motion.bridgeFoldEnd - motion.bridgeFoldStart)))) : 0;
  const angle = 90 * (1 - deployment);
  // Telescope while lowering so the raised end stays below the connector heading.
  const bridge = { deployment, angle, length: Math.min(g.bridgePivot.x - g.bridgeLanding.x,
    g.bridgeFoldedLength / Math.max(.001, Math.sin(angle * Math.PI / 180))) };
  const destination: Point = { x: g.rawX, y: target === 'structured' ? g.structuredY : g.unstructuredY };
  let storedCount = 0;
  const packets = SOURCING_EVENTS.map(event => {
    const age = time - event.startTime;
    let point: Point = g.source;
    if (!authorized || age < 0) return { ...event, kind: target, ...point, opacity: 0 };
    if (age + 1e-9 >= SOURCING_FLIGHT_SECONDS) {
      storedCount++;
      return { ...event, kind: target, ...destination, opacity: 0 };
    }
    if (age < 1.2) point = { x: mix(g.source.x, g.security.x, ease(age / 1.2)), y: g.source.y };
    else if (age < 2.4) point = { x: mix(g.security.x, g.connector.x, ease((age - 1.2) / 1.2)), y: g.source.y };
    else point = curve(g.connector, { x: 805, y: 330 }, { x: 875, y: destination.y }, destination, ease((age - 2.4) / 1.6));
    return { ...event, kind: target, ...point, opacity: 1 };
  });
  return { station, wizardSteps: SOURCING_WIZARD_TIMES.map(start => ease(clamp((time - start) / .8))), securityChecked, jobReady,
    jobStatus: time < 5 ? 'created' : time < 9 ? 'submitted' : !authorized && securityChecked ? 'blocked'
      : !jobReady ? 'checking' : storedCount === SOURCING_EVENTS.length ? 'completed' : 'running',
    control, check, introspection, packets, doorOpen, beltTravel, extracting, bridge,
    stored: { structured: target === 'structured' ? storedCount : 0, unstructured: target === 'unstructured' ? storedCount : 0 } };
}

/** SVG projection and one cancellable scene clock, shared by playback and seeking. */
export class SourcingAnimator {
  private readonly packets: SVGElement[];
  private readonly control: SVGElement | null;
  private readonly check: SVGElement | null;
  private readonly introspection: SVGElement | null;
  private readonly structured: SVGElement[];
  private readonly unstructured: SVGElement[];
  private readonly door: SVGElement | null;
  private readonly doorLeaf: SVGElement | null;
  private readonly doorHandle: SVGElement | null;
  private readonly belt: SVGElement | null;
  private readonly beltTread: SVGElement | null;
  private readonly bridge: SVGElement | null;
  private readonly bridgeTrack: SVGElement | null;
  private readonly bridgeEnd: SVGElement | null;
  private readonly rollerMounts: SVGElement[];
  private readonly rollers: SVGElement[];
  private readonly wizardSteps: SVGElement[];
  private elapsed = 0;
  private target: SourcingKind = 'structured';
  private frame?: number;
  private lastTime?: number;
  private lastReported = -Infinity;
  constructor(svg: SVGElement, private readonly view: Window, private readonly reportPosition: (seconds: number) => void = () => {}, initialPosition = 0, target: SourcingKind = 'structured') {
    this.packets = [...svg.querySelectorAll<SVGElement>('[data-sourcing-packet]')];
    this.control = svg.querySelector('[data-sourcing-control]');
    this.check = svg.querySelector('[data-sourcing-check]');
    this.introspection = svg.querySelector('[data-sourcing-introspection]');
    this.structured = [...svg.querySelectorAll<SVGElement>('.sourcing-structured-cell[data-slot]')];
    this.unstructured = [...svg.querySelectorAll<SVGElement>('.sourcing-unstructured-dot[data-slot]')];
    this.door = svg.querySelector('[data-sourcing-door]');
    this.doorLeaf = svg.querySelector('[data-sourcing-door-leaf]');
    this.doorHandle = svg.querySelector('[data-sourcing-door-handle]');
    this.belt = svg.querySelector('[data-sourcing-belt]');
    this.beltTread = svg.querySelector('[data-sourcing-belt-tread]');
    this.bridge = svg.querySelector('[data-sourcing-bridge]');
    this.bridgeTrack = svg.querySelector('[data-sourcing-bridge-track]');
    this.bridgeEnd = svg.querySelector('[data-sourcing-bridge-end]');
    this.rollerMounts = [...svg.querySelectorAll<SVGElement>('[data-sourcing-roller-mount]')];
    this.rollers = [...svg.querySelectorAll<SVGElement>('[data-sourcing-roller]')];
    this.wizardSteps = [...svg.querySelectorAll<SVGElement>('[data-sourcing-wizard-step]')];
    this.target = target;
    this.seek(initialPosition);
  }
  setRunning(running: boolean): void {
    this.stop();
    if (!running) return;
    const tick = (time: number) => {
      if (this.lastTime !== undefined) this.elapsed = (this.elapsed + Math.min((time - this.lastTime) / 1000, .1)) % SOURCING_CYCLE;
      this.lastTime = time;
      this.draw();
      if (Math.abs(this.elapsed - this.lastReported) >= .1) this.report();
      this.frame = this.view.requestAnimationFrame(tick);
    };
    this.frame = this.view.requestAnimationFrame(tick);
  }
  stop(): void {
    if (this.frame !== undefined) this.view.cancelAnimationFrame(this.frame);
    this.frame = undefined; this.lastTime = undefined;
  }
  seek(seconds: number): void {
    if (!Number.isFinite(seconds)) return;
    this.elapsed = Math.max(0, Math.min(SOURCING_CYCLE, seconds));
    this.lastTime = undefined; this.draw(); this.report();
  }
  setTarget(target: SourcingKind): void { this.target = target; this.draw(); }
  private report(): void { this.lastReported = this.elapsed; this.reportPosition(this.elapsed); }
  private point(node: SVGElement | null, point: SourcingPoint): void {
    node?.setAttribute('transform', 'translate(' + point.x + ' ' + point.y + ')');
    node?.setAttribute('opacity', String(point.opacity));
  }
  private draw(): void {
    const state = sampleSourcingState(this.elapsed, this.target);
    this.wizardSteps.forEach(node => {
      const progress = state.wizardSteps[Number(node.getAttribute('data-sourcing-wizard-step'))];
      node.setAttribute('opacity', String(progress));
      node.setAttribute('transform', `translate(0 ${6 * (1 - progress)})`);
    });
    const doorWidth = 48 * Math.cos(state.doorOpen * Math.PI * .45), skew = state.doorOpen * 8;
    this.door?.setAttribute('data-open', String(state.doorOpen));
    this.doorLeaf?.setAttribute('d', `M366 302L${366 + doorWidth} ${302 + skew}V${358 + skew}L366 358Z`);
    this.doorHandle?.setAttribute('cx', String(366 + doorWidth * .78));
    this.doorHandle?.setAttribute('cy', String(332 + skew * .78));
    this.belt?.setAttribute('data-running', String(state.extracting));
    const length = state.bridge.length;
    this.bridge?.setAttribute('transform', `rotate(${state.bridge.angle})`);
    this.bridge?.setAttribute('data-deployment', String(state.bridge.deployment));
    this.bridge?.setAttribute('data-length', String(length));
    this.bridgeTrack?.setAttribute('x', String(-length - 11));
    this.bridgeTrack?.setAttribute('width', String(length + 22));
    this.bridgeEnd?.setAttribute('transform', `translate(${-length} 0)`);
    this.beltTread?.setAttribute('d', `M${-length} -11H0A11 11 0 0 1 0 11H${-length}A11 11 0 0 1 ${-length} -11Z`);
    this.rollerMounts.forEach(node => {
      const distance = Number(node.getAttribute('data-sourcing-roller-mount'));
      node.setAttribute('opacity', distance === 0 || distance < length - 18 ? '1' : '0');
    });
    this.beltTread?.setAttribute('stroke-dashoffset', String(-state.beltTravel));
    this.rollers.forEach(node => node.setAttribute('transform', `rotate(${state.beltTravel / 7 * 180 / Math.PI})`));
    this.packets.forEach(node => this.point(node, state.packets[Number(node.getAttribute('data-sourcing-packet'))]));
    this.point(this.control, state.control); this.point(this.check, state.check); this.point(this.introspection, state.introspection);
    this.structured.forEach(node => node.setAttribute('opacity', Number(node.getAttribute('data-slot')) < state.stored.structured ? '1' : '0'));
    this.unstructured.forEach(node => node.setAttribute('opacity', Number(node.getAttribute('data-slot')) < state.stored.unstructured ? '1' : '0'));
  }
}
