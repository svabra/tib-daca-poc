/** A shared clock keeps collection, refinement, aggregation and protection causally aligned. */
export const PIPELINE_CYCLE = 26;
export const PIPELINE_BATCHES = [0] as const;
export const RAW_COLORS = ['#e66a47', '#a779df', '#e5ad32', '#25af9b', '#e26b9c', '#6594dd'] as const;
export const REFINED_GOLD = '#d4a017';
export const PIPELINE_SOURCE_Y = [170, 260, 350, 440] as const;
export const PIPELINE_CONSUMER_Y = [190, 310, 430] as const;
const ARRIVAL = 11.4;
const SPACING = .58;
const GEAR_CONTACT_ANGLE = Math.atan2(48, 36) * 180 / Math.PI;
export const PRODUCT_UNION_START = 15.4;
export const PRODUCT_UNION_END = 16.8;
export const PRODUCT_DEPARTURE = 17.6;
export const PRODUCT_PROTECTION_ARRIVAL = 19.6;
export const PRODUCT_SHIELD_START = 19.8;
export const PRODUCT_SHIELD_END = 20.45;
export const PRODUCT_DISTRIBUTION_START = 20.8;
export const PRODUCT_DISTRIBUTION_END = 24.4;
type Point = { x: number; y: number };
export interface PipelineParticle extends Point { color: string; opacity: number; }
export interface PipelineProduct extends Point { radius: number; opacity: number; shield: number; }
export interface ProductUnion {
  active: boolean; radius: number; opacity: number; fillOpacity: number; strokeWidth: number;
  rotation: number; solid: boolean; waveRadius: number; waveOpacity: number;
}
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => t * t * (3 - 2 * t);
function curve(a: Point, b: Point, c: Point, d: Point, t: number): Point {
  const u = 1 - t;
  return { x: u ** 3 * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t ** 3 * d.x,
    y: u ** 3 * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t ** 3 * d.y };
}
/** Future input must remain in the future, never wrap into an already formed product. */
export const batchPhase = (seconds: number, batch: number) => seconds - batch * 8;

export function sampleParticle(phase: number, index: number): PipelineParticle {
  const age = phase - index * SPACING;
  const color = RAW_COLORS[index];
  const sourceY = PIPELINE_SOURCE_Y[index % PIPELINE_SOURCE_Y.length];
  const bucket = { x: 360, y: 320 };
  let point: Point = bucket;
  if (age < 0) return { ...point, color, opacity: 0 };
  if (phase >= PRODUCT_UNION_END) return { x: 840, y: 320, color: REFINED_GOLD, opacity: 0 };
  if (age < 2.4) point = curve({ x: 145, y: sourceY }, { x: 225, y: sourceY }, { x: 275, y: 275 + index * 15 }, bucket, age / 2.4);
  else if (age < 3.8) {
    const t = (age - 2.4) / 1.4, orbit = Math.sin(Math.PI * t) * 30;
    point = { x: 360 + Math.sin(t * Math.PI * 4 + index) * orbit, y: 320 + Math.cos(t * Math.PI * 4 + index) * orbit };
  } else if (age < 7.6) {
    const t = (age - 3.8) / 3.8;
    // Different cubic bends fan out inside the raw/refinement layers, then enter one gear.
    const bends = [-155, 135, -90, 165, -185, 75];
    point = curve(bucket, { x: 470, y: 320 + bends[index] }, { x: 490, y: 320 - bends[index] }, { x: 566, y: 320 }, t);
  } else if (age < 8.6) {
    const t = (age - 7.6), angle = Math.PI + 3 * Math.PI * t;
    point = { x: 600 + 34 * Math.cos(angle), y: 320 + 34 * Math.sin(angle) };
  } else if (age < ARRIVAL) {
    point = curve({ x: 634, y: 320 }, { x: 705, y: 320 + (index - 2.5) * 11 }, { x: 770, y: 320 }, { x: 840, y: 320 }, (age - 8.6) / (ARRIVAL - 8.6));
  } else {
    // Each point touches the center before joining one shared, evenly spaced orbit.
    // Welding uses absolute batch time so all six points spiral inward together.
    const joined = ease(clamp((age - ARRIVAL) / .25));
    const weld = ease(clamp((phase - PRODUCT_UNION_START) / (PRODUCT_UNION_END - PRODUCT_UNION_START)));
    const radius = 24 * joined * (1 - weld);
    const angle = 2 * Math.PI * ((phase - ARRIVAL) / 1.8 + index / RAW_COLORS.length);
    point = { x: 840 + radius * Math.cos(angle), y: 320 + radius * Math.sin(angle) };
  }
  return { ...point, color: age >= 8.35 ? REFINED_GOLD : color,
    opacity: clamp(age / .25) * clamp((PRODUCT_UNION_END - phase) / .35) };
}

export function sampleProduct(phase: number, consumer: number): PipelineProduct {
  const weld = ease(clamp((phase - PRODUCT_UNION_START) / (PRODUCT_UNION_END - PRODUCT_UNION_START)));
  const radius = 29 * Math.sqrt(weld);
  let point = { x: 840, y: 320 };
  if (phase >= PRODUCT_DEPARTURE && phase < PRODUCT_PROTECTION_ARRIVAL) {
    point.x = mix(840, 1080, ease((phase - PRODUCT_DEPARTURE) / (PRODUCT_PROTECTION_ARRIVAL - PRODUCT_DEPARTURE)));
  } else if (phase >= PRODUCT_PROTECTION_ARRIVAL && phase < PRODUCT_DISTRIBUTION_START) point.x = 1080;
  else if (phase >= PRODUCT_DISTRIBUTION_START) {
    const targetY = PIPELINE_CONSUMER_Y[consumer];
    point = curve({ x: 1080, y: 320 }, { x: 1150, y: targetY }, { x: 1240, y: targetY }, { x: 1320, y: targetY }, ease(clamp((phase - PRODUCT_DISTRIBUTION_START) / (PRODUCT_DISTRIBUTION_END - PRODUCT_DISTRIBUTION_START))));
  }
  // One product reaches protection. Additional copies appear together only after shielding.
  const branchOpacity = consumer === 0 ? 1 : clamp((phase - PRODUCT_DISTRIBUTION_START) / .25);
  return { ...point, radius,
    opacity: (weld > 0 && phase < PRODUCT_DISTRIBUTION_END ? clamp((PRODUCT_DISTRIBUTION_END - phase) / .35) : 0) * branchOpacity,
    shield: clamp((phase - PRODUCT_SHIELD_START) / (PRODUCT_SHIELD_END - PRODUCT_SHIELD_START)) };
}

/** The ring welds collected points, then confirms the completed product with one pulse. */
export function sampleProductUnion(phase: number): ProductUnion {
  const t = phase - PRODUCT_UNION_START;
  const active = t >= 0 && phase < PRODUCT_DEPARTURE;
  if (!active) return { active: false, radius: 48, opacity: .25, fillOpacity: 0, strokeWidth: 1.5, rotation: 0, solid: false, waveRadius: 34, waveOpacity: 0 };
  const weld = clamp(t / (PRODUCT_UNION_END - PRODUCT_UNION_START));
  const wave = clamp((phase - PRODUCT_UNION_END) / (PRODUCT_DEPARTURE - PRODUCT_UNION_END));
  const intensity = Math.sin(Math.PI / 2 * (phase < PRODUCT_UNION_END ? weld : 1 - wave));
  return { active: true, radius: mix(mix(48, 31, ease(weld)), 48, ease(wave)),
    opacity: .25 + .75 * intensity, fillOpacity: .12 * intensity, strokeWidth: 1.5 + 1.2 * intensity,
    rotation: 360 * ease(weld), solid: phase >= PRODUCT_UNION_END - .3,
    waveRadius: mix(34, 76, ease(wave)), waveOpacity: .65 * Math.sin(Math.PI * wave) };
}

/** Updates only decorative SVG attributes; Angular does not rerender the app on each frame. */
export class PipelineAnimator {
  private readonly particles: SVGGElement[];
  private readonly products: SVGGElement[];
  private frame: number | undefined;
  private elapsed = 0;
  private lastTime: number | undefined;
  private lastReported = -Infinity;
  private readonly gears: SVGGElement[];
  private readonly unionRing: SVGCircleElement | null;
  private readonly unionWave: SVGCircleElement | null;

  constructor(svg: SVGElement, private readonly view: Window, private readonly reportPosition: (seconds: number) => void = () => {}, initialPosition = 0) {
    this.particles = [...svg.querySelectorAll<SVGGElement>('.flow-particle')];
    this.products = [...svg.querySelectorAll<SVGGElement>('.flow-product')];
    this.gears = [...svg.querySelectorAll<SVGGElement>('.gear-rotor')];
    this.unionRing = svg.querySelector<SVGCircleElement>('.product-union-ring');
    this.unionWave = svg.querySelector<SVGCircleElement>('.product-union-wave');
    this.seek(initialPosition);
  }

  setRunning(running: boolean): void {
    this.stop();
    if (!running) return;
    const tick = (time: number) => {
      if (this.lastTime !== undefined) this.elapsed = (this.elapsed + Math.min((time - this.lastTime) / 1000, .1)) % PIPELINE_CYCLE;
      this.lastTime = time;
      this.draw(this.elapsed);
      // Publish the accessible clock at most ten times per second; drawing stays at display rate.
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

  seek(seconds: number): void {
    if (!Number.isFinite(seconds)) return;
    this.elapsed = Math.max(0, Math.min(PIPELINE_CYCLE, seconds));
    this.lastTime = undefined;
    this.draw(this.elapsed);
    this.report();
  }

  private report(): void {
    this.lastReported = this.elapsed;
    this.reportPosition(this.elapsed);
  }

  private draw(seconds: number): void {
    const union = PIPELINE_BATCHES.map(batch => sampleProductUnion(batchPhase(seconds, batch))).find(state => state.active) ?? sampleProductUnion(-1);
    if (this.unionRing) {
      this.unionRing.setAttribute('r', String(union.radius));
      this.unionRing.setAttribute('opacity', String(union.opacity));
      this.unionRing.setAttribute('fill-opacity', String(union.fillOpacity));
      this.unionRing.setAttribute('stroke-width', String(union.strokeWidth));
      this.unionRing.setAttribute('stroke-dasharray', union.solid ? 'none' : '2 7');
      this.unionRing.setAttribute('transform', `rotate(${union.rotation} 840 320)`);
    }
    if (this.unionWave) {
      this.unionWave.setAttribute('r', String(union.waveRadius));
      this.unionWave.setAttribute('opacity', String(union.waveOpacity));
    }
    this.gears.forEach(node => {
      const small = node.classList.contains('gear-small');
      // A large tooth faces a small gap; 12/8 teeth require opposite 40/-60 degree speeds.
      const angle = small ? GEAR_CONTACT_ANGLE + 180 - 22.5 - seconds * 60 : GEAR_CONTACT_ANGLE + seconds * 40;
      node.setAttribute('transform', `rotate(${angle})`);
    });
    this.particles.forEach((node, index) => {
      const state = sampleParticle(batchPhase(seconds, Math.floor(index / 6)), index % 6);
      node.setAttribute('transform', `translate(${state.x} ${state.y})`);
      node.setAttribute('opacity', String(state.opacity));
      node.style.color = state.color;
    });
    this.products.forEach((node, index) => {
      const batch = Math.floor(index / PIPELINE_CONSUMER_Y.length);
      const consumer = index % PIPELINE_CONSUMER_Y.length;
      const state = sampleProduct(batchPhase(seconds, batch), consumer);
      node.setAttribute('transform', `translate(${state.x} ${state.y})`);
      node.setAttribute('opacity', String(state.opacity));
      node.querySelector('.product-body')!.setAttribute('r', String(state.radius));
      node.querySelector('.product-halo')!.setAttribute('r', String(state.radius + 8));
      node.querySelector('.product-shield')!.setAttribute('transform', `scale(${state.shield})`);
    });
  }
}
