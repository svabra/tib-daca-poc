import {
  REFINED_GOLD, PIPELINE_CYCLE, PRODUCT_DEPARTURE, PRODUCT_UNION_START, PRODUCT_UNION_END,
  RAW_COLORS, batchPhase, sampleParticle, sampleProduct, sampleProductUnion,
} from './documentation-pipeline-animation';

describe('pipeline animation narrative', () => {
  const distanceFromCenter = (point: { x: number; y: number }) => Math.hypot(point.x - 840, point.y - 320);

  it('preserves distinct raw colors, rotates particles through refinement, then emits only gold', () => {
    for (let index = 0; index < RAW_COLORS.length; index++) {
      const stagger = index * .58;
      expect(sampleParticle(2 + stagger, index).color).toBe(RAW_COLORS[index]);
      expect(sampleParticle(6 + stagger, index).color).toBe(RAW_COLORS[index]);
      const inside = sampleParticle(8 + stagger, index);
      expect(Math.hypot(inside.x - 600, inside.y - 320)).toBeCloseTo(34);
      expect(sampleParticle(9 + stagger, index).color).toBe(REFINED_GOLD);
      expect(sampleParticle(10 + stagger, index).x).toBeGreaterThan(634);
    }
  });

  it('flies each refined point through the center before joining a visible shared orbit', () => {
    for (let index = 0; index < RAW_COLORS.length; index++) {
      const arrival = 11.4 + index * .58;
      const before = sampleParticle(arrival - .000001, index);
      const arrived = sampleParticle(arrival, index);
      expect(distanceFromCenter(before)).toBeLessThan(.001);
      expect(arrived.x).toBeCloseTo(840, 6);
      expect(arrived.y).toBeCloseTo(320, 6);
      expect(arrived).toMatchObject({ color: REFINED_GOLD, opacity: 1 });
      expect(distanceFromCenter(sampleParticle(arrival + .000001, index))).toBeLessThan(.001);
      expect(distanceFromCenter(sampleParticle(arrival + .25, index))).toBeCloseTo(24);
    }

    const collected = RAW_COLORS.map((_, index) => sampleParticle(14.6, index));
    for (let index = 0; index < collected.length; index++) {
      const point = collected[index], next = collected[(index + 1) % collected.length];
      expect(point).toMatchObject({ color: REFINED_GOLD, opacity: 1 });
      expect(distanceFromCenter(point)).toBeCloseTo(24);
      // Equal 60-degree spacing leaves a chord equal to the orbit radius.
      expect(Math.hypot(next.x - point.x, next.y - point.y)).toBeCloseTo(24);
      const quarterTurn = sampleParticle(15.05, index);
      expect(Math.hypot(quarterTurn.x - point.x, quarterTurn.y - point.y)).toBeCloseTo(24 * Math.SQRT2);
    }
  });

  it('waits for collection, then spirals all six points inward as one product grows beneath them', () => {
    for (const time of [0, 11, 12, 13.5, 14.7, PRODUCT_UNION_START - .001]) {
      expect(sampleProduct(time, 0)).toMatchObject({ radius: 0, opacity: 0 });
    }
    const early = sampleProduct(15.7, 0), later = sampleProduct(16.3, 0), full = sampleProduct(PRODUCT_UNION_END, 0);
    expect(early.radius).toBeGreaterThan(0);
    expect(later.radius).toBeGreaterThan(early.radius);
    expect(full.radius).toBeCloseTo(29);
    expect(full.x).toBe(840);
    expect(sampleProduct(PRODUCT_DEPARTURE, 0).x).toBe(840);
    expect(sampleProduct(PRODUCT_DEPARTURE + .1, 0).x).toBeGreaterThan(840);

    for (let index = 0; index < RAW_COLORS.length; index++) {
      const start = sampleParticle(PRODUCT_UNION_START, index);
      const justBefore = sampleParticle(PRODUCT_UNION_START - .000001, index);
      expect(Math.hypot(start.x - justBefore.x, start.y - justBefore.y)).toBeLessThan(.001);
      expect(distanceFromCenter(start)).toBeCloseTo(24);
      const midway = sampleParticle((PRODUCT_UNION_START + PRODUCT_UNION_END) / 2, index);
      expect(distanceFromCenter(midway)).toBeGreaterThan(0);
      expect(distanceFromCenter(midway)).toBeLessThan(24);
      expect(midway).toMatchObject({ color: REFINED_GOLD, opacity: 1 });
      const finishing = sampleParticle(16.6, index);
      expect(finishing.opacity).toBeGreaterThan(0);
      expect(finishing.opacity).toBeLessThan(1);
      expect(distanceFromCenter(sampleParticle(PRODUCT_UNION_END - .000001, index))).toBeLessThan(.001);
      expect(sampleParticle(PRODUCT_UNION_END, index).opacity).toBe(0);
    }
  });

  it('attaches a shield before simultaneously distributing the same product to three consumers', () => {
    expect(sampleProduct(19.5, 0).shield).toBe(0);
    expect(sampleProduct(20.6, 0)).toMatchObject({ x: 1080, shield: 1 });
    expect([0, 1, 2].map(consumer => sampleProduct(20.6, consumer)).filter(product => product.opacity > 0)).toHaveLength(1);
    const branches = [0, 1, 2].map(consumer => sampleProduct(22.6, consumer));
    expect(branches.every(product => product.opacity === 1 && product.shield === 1 && product.radius === 29)).toBe(true);
    expect(new Set(branches.map(product => product.y)).size).toBe(3);
    expect(branches[2].y - branches[0].y).toBeGreaterThan(160);
    for (const consumer of [0, 1, 2]) {
      const delivered = sampleProduct(24.3, consumer);
      expect(delivered.shield).toBe(1);
      expect(delivered.x).toBeGreaterThan(1319);
      expect(delivered.y).toBeCloseTo([190, 310, 430][consumer], 0);
      expect(sampleProduct(24.5, consumer).opacity).toBe(0);
    }
  });

  it('processes the collected points before pulsing once and departing with the completed product', () => {
    expect(sampleProductUnion(PRODUCT_UNION_START - .01).active).toBe(false);
    expect(sampleProductUnion(PRODUCT_UNION_START).waveOpacity).toBe(0);
    expect(sampleProduct(PRODUCT_UNION_START, 0).radius).toBe(0);
    const gathered = sampleProductUnion(PRODUCT_UNION_END - .1);
    expect(gathered.active).toBe(true);
    expect(gathered.solid).toBe(true);
    expect(gathered.radius).toBeLessThan(34);
    expect(gathered.rotation).toBeGreaterThan(300);
    expect(gathered.waveOpacity).toBe(0);
    expect(sampleProduct(PRODUCT_UNION_END + .4, 0)).toMatchObject({ x: 840, radius: 29 });
    const pulse = sampleProductUnion(PRODUCT_UNION_END + .4);
    expect(pulse.waveOpacity).toBeGreaterThan(.5);
    expect(pulse.waveRadius).toBeGreaterThan(48);
    expect(sampleProductUnion(PRODUCT_DEPARTURE).active).toBe(false);
    expect(sampleProduct(PRODUCT_DEPARTURE + .1, 0).x).toBeGreaterThan(840);
    expect(sampleProductUnion(PRODUCT_DEPARTURE + .1)).toMatchObject({ radius: 48, solid: false, waveOpacity: 0 });
  });

  it('never wraps future input into a preformed product and keeps all positions valid for 26 seconds', () => {
    expect(PIPELINE_CYCLE).toBe(26);
    expect(batchPhase(0, 1)).toBe(-8);
    expect(batchPhase(0, 2)).toBe(-16);
    expect(batchPhase(PIPELINE_CYCLE, 0)).toBe(PIPELINE_CYCLE);
    for (const batch of [0, 1, 2]) {
      for (const consumer of [0, 1, 2]) {
        expect(sampleProduct(batchPhase(0, batch), consumer)).toMatchObject({ radius: 0, opacity: 0, shield: 0 });
      }
    }
    for (let time = 0; time <= PIPELINE_CYCLE; time += .1) {
      for (const batch of [0, 1, 2]) {
        const phase = batchPhase(time, batch);
        for (let index = 0; index < 6; index++) {
          const particle = sampleParticle(phase, index);
          expect(Number.isFinite(particle.x) && Number.isFinite(particle.y)).toBe(true);
          expect(particle.opacity).toBeGreaterThanOrEqual(0);
          expect(particle.opacity).toBeLessThanOrEqual(1);
          if (particle.opacity > 0 && particle.x > 635) expect(particle.color).toBe(REFINED_GOLD);
        }
        for (let consumer = 0; consumer < 3; consumer++) {
          const product = sampleProduct(phase, consumer);
          expect([product.x, product.y, product.radius, product.opacity, product.shield].every(Number.isFinite)).toBe(true);
          expect(product.radius).toBeGreaterThanOrEqual(0);
          expect(product.radius).toBeLessThanOrEqual(29);
        }
      }
    }
  });
});
