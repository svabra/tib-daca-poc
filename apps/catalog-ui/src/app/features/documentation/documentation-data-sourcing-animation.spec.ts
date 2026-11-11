import { SOURCING_CYCLE, SOURCING_EVENTS, SOURCING_GEOMETRY, SOURCING_STATION_TIMES, SourcingAnimator, sampleSourcingState } from './documentation-data-sourcing-animation';

describe('one PostgreSQL sourcing task', () => {
  it('gives each numbered station its own interval and submits exactly one task', () => {
    expect(SOURCING_CYCLE).toBe(24);
    expect(SOURCING_STATION_TIMES).toEqual([0, 5, 9, 14]);
    for (const [time, station] of [[0, 0], [4.99, 0], [5, 1], [8.99, 1], [9, 2], [13.99, 2], [14, 3], [24, 3]]) {
      expect(sampleSourcingState(time).station).toBe(station);
    }
    expect(sampleSourcingState(0)).toMatchObject({ wizardSteps: [0, 0, 0], jobStatus: 'created', jobReady: false, stored: { structured: 0, unstructured: 0 } });
    expect(sampleSourcingState(4).wizardSteps).toEqual([1, 1, 1]);
    expect(sampleSourcingState(6)).toMatchObject({ jobStatus: 'submitted', control: { opacity: 1 }, check: { opacity: 0 } });
    expect(sampleSourcingState(8).control.opacity).toBe(0);
    for (const time of [5, 6, 7, 7.99]) {
      const task = sampleSourcingState(time).control;
      expect(task.x).toBe(SOURCING_GEOMETRY.connector.x);
      expect(task.y).toBeGreaterThanOrEqual(SOURCING_GEOMETRY.task.y);
      expect(task.y).toBeLessThanOrEqual(SOURCING_GEOMETRY.taskArrival.y);
    }
    expect(sampleSourcingState(10)).toMatchObject({ control: { opacity: 0 }, check: { opacity: 1 }, introspection: { opacity: 0 }, jobStatus: 'checking' });
    expect(sampleSourcingState(12)).toMatchObject({ securityChecked: true, introspection: { opacity: 1 }, jobReady: false });
    expect(sampleSourcingState(13.5)).toMatchObject({ jobReady: true, introspection: { opacity: 0 } });
  });

  it('reveals source, transformation and target one at a time before task handover', () => {
    expect(sampleSourcingState(.3).wizardSteps).toEqual([0, 0, 0]);
    expect(sampleSourcingState(.8).wizardSteps).toEqual([.5, 0, 0]);
    expect(sampleSourcingState(1.4).wizardSteps).toEqual([1, 0, 0]);
    expect(sampleSourcingState(2).wizardSteps[1]).toBeCloseTo(.5);
    expect(sampleSourcingState(2.6).wizardSteps).toEqual([1, 1, 0]);
    expect(sampleSourcingState(3.2).wizardSteps[2]).toBeCloseTo(.5);
    for (const time of [4, 5, 12, 24]) expect(sampleSourcingState(time).wizardSteps).toEqual([1, 1, 1]);
    expect(sampleSourcingState(1.4).wizardSteps).toEqual([1, 0, 0]);
  });

  it('never emits payload before permission and blocks every target on denial', () => {
    for (const target of ['structured', 'unstructured'] as const) {
      for (let time = 0; time < 14; time += .1) expect(sampleSourcingState(time, target).packets.every(p => p.opacity === 0)).toBe(true);
      for (let time = 0; time <= 24; time += .1) {
        const denied = sampleSourcingState(time, target, false);
        expect(denied.jobReady).toBe(false);
        expect(denied.stored).toEqual({ structured: 0, unstructured: 0 });
        expect(denied.packets.every(p => p.opacity === 0)).toBe(true);
        expect(denied.doorOpen).toBe(0);
        expect(denied.beltTravel).toBe(0);
        expect(denied.extracting).toBe(false);
        expect(denied.bridge).toEqual({ deployment: 0, angle: 90, length: 32 });
        expect(denied.introspection.opacity).toBe(0);
        if (time >= 12) expect(denied.jobStatus).toBe('blocked');
      }
    }
    expect(sampleSourcingState(14).packets.filter(p => p.opacity === 1)).toHaveLength(1);
  });

  it('opens only after permission and closes after the last packet clears the doorway', () => {
    for (const time of [0, 9, 11.5, 12]) expect(sampleSourcingState(time).doorOpen).toBe(0);
    expect(sampleSourcingState(12.45).doorOpen).toBeCloseTo(.5);
    expect(sampleSourcingState(12.9).doorOpen).toBe(1);
    for (const target of ['structured', 'unstructured'] as const) {
      for (let time = 14; time <= 21.5; time += .01) {
        const state = sampleSourcingState(time, target);
        // Includes the packet halo: no closing door may intersect visible data.
        if (state.packets.some(p => p.opacity > 0 && p.x + 14 >= 366 && p.x - 14 <= 418)) expect(state.doorOpen).toBe(1);
      }
    }
    expect(sampleSourcingState(19.45).doorOpen).toBeCloseTo(.5);
    for (const time of [19.8, 21.5, 24]) expect(sampleSourcingState(time).doorOpen).toBe(0);
  });

  it('runs the conveyor only during extraction and freezes its final rotation', () => {
    for (const time of [0, 9, 12, 13.9]) expect(sampleSourcingState(time)).toMatchObject({ extracting: false, beltTravel: 0 });
    expect(sampleSourcingState(14).extracting).toBe(true);
    expect(sampleSourcingState(17).beltTravel).toBeGreaterThan(sampleSourcingState(16.5).beltTravel);
    expect(sampleSourcingState(21.49).extracting).toBe(true);
    const finished = sampleSourcingState(21.5);
    expect(finished.extracting).toBe(false);
    expect(sampleSourcingState(24).beltTravel).toBe(finished.beltTravel);
    expect(sampleSourcingState(0).beltTravel).toBe(0);
  });

  it('lowers the bridge with the door and keeps it deployed until all payloads clear it', () => {
    const g = SOURCING_GEOMETRY;
    for (const time of [0, 9, 11.5, 12]) expect(sampleSourcingState(time).bridge.deployment).toBe(0);
    for (const time of [12.1, 12.45, 12.7, 12.9]) {
      const state = sampleSourcingState(time);
      expect(state.bridge.deployment).toBe(state.doorOpen);
    }
    const ready = sampleSourcingState(12.9).bridge;
    expect(ready.angle).toBe(0);
    expect(g.bridgePivot.x - ready.length).toBe(g.bridgeLanding.x);
    for (const target of ['structured', 'unstructured'] as const) {
      for (let time = 0; time <= 24; time += .05) {
        const state = sampleSourcingState(time, target);
        if (state.packets.some(p => p.opacity > 0 && p.x + 14 >= g.bridgeLanding.x && p.x - 14 <= g.bridgePivot.x)) {
          expect(state.bridge.deployment).toBe(1);
          expect(state.bridge.angle).toBe(0);
        }
        const tipY = g.bridgePivot.y - state.bridge.length * Math.sin(state.bridge.angle * Math.PI / 180);
        const tipX = g.bridgePivot.x - state.bridge.length * Math.cos(state.bridge.angle * Math.PI / 180);
        expect(tipX - 11).toBeGreaterThan(422); // Entire rounded belt end stays outside the door sill.
        expect(tipY - 11).toBeGreaterThanOrEqual(305.999);
        expect([state.bridge.length, state.bridge.angle, tipY].every(Number.isFinite)).toBe(true);
      }
    }
    expect(sampleSourcingState(19.8)).toMatchObject({ doorOpen: 0, bridge: { deployment: 1 } });
    expect(sampleSourcingState(21.6).bridge.deployment).toBe(1);
    expect(sampleSourcingState(22.05).bridge.deployment).toBeCloseTo(.5);
    expect(sampleSourcingState(22.5).bridge).toEqual(sampleSourcingState(0).bridge);
  });

  it('passes every packet through SDAL PG and SC PG in order without jumps', () => {
    const g = SOURCING_GEOMETRY;
    for (const target of ['structured', 'unstructured'] as const) {
      for (const event of SOURCING_EVENTS) {
        const sample = (age: number) => sampleSourcingState(event.startTime + age, target).packets[event.id];
        for (const [age, point] of [[0, g.source], [1.2, g.security], [2.4, g.connector], [4, { x: g.rawX, y: target === 'structured' ? g.structuredY : g.unstructuredY }]] as const) {
          const at = sample(age);
          expect(at.x).toBeCloseTo(point.x);
          expect(at.y).toBeCloseTo(point.y);
          expect(at.opacity).toBe(age === 4 ? 0 : 1);
          if (age > 0) {
            const before = sample(age - .000001), after = sample(age + .000001);
            expect(Math.hypot(at.x - before.x, at.y - before.y)).toBeLessThan(.001);
            expect(Math.hypot(at.x - after.x, at.y - after.y)).toBeLessThan(.001);
          }
        }
      }
    }
  });

  it('stores six records only in the chosen target and never counts in-flight data', () => {
    expect(SOURCING_EVENTS).toHaveLength(6);
    expect(sampleSourcingState(17.99).stored).toEqual({ structured: 0, unstructured: 0 });
    expect(sampleSourcingState(18).stored).toEqual({ structured: 1, unstructured: 0 });
    expect(sampleSourcingState(21.5)).toMatchObject({ jobStatus: 'completed', stored: { structured: 6, unstructured: 0 } });
    expect(sampleSourcingState(21.5, 'unstructured')).toMatchObject({ jobStatus: 'completed', stored: { structured: 0, unstructured: 6 } });
    for (const target of ['structured', 'unstructured'] as const) {
      let previous = 0;
      for (let time = 0; time <= 24; time += .1) {
        const state = sampleSourcingState(time, target);
        const count = state.stored[target];
        expect(count).toBeGreaterThanOrEqual(previous);
        expect(count).toBeLessThanOrEqual(6);
        expect(state.packets.filter(p => p.opacity > 0).length + count).toBeLessThanOrEqual(6);
        expect(state.stored[target === 'structured' ? 'unstructured' : 'structured']).toBe(0);
        previous = count;
      }
    }
  });

  it('reconstructs state on reverse seeking and normalizes invalid time', () => {
    const saved = sampleSourcingState(16.8, 'unstructured');
    sampleSourcingState(24); sampleSourcingState(0);
    expect(sampleSourcingState(16.8, 'unstructured')).toEqual(saved);
    for (const time of [-1, NaN, Infinity]) expect(sampleSourcingState(time)).toEqual(sampleSourcingState(0));
    expect(sampleSourcingState(100)).toEqual(sampleSourcingState(24));
    for (let time = 0; time <= 24; time += .1) {
      const state = sampleSourcingState(time);
      for (const p of [state.control, state.check, state.introspection, ...state.packets]) {
        expect([p.x, p.y, p.opacity].every(Number.isFinite)).toBe(true);
      }
    }
  });
});

function svgScene() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.innerHTML = '<g data-sourcing-control/><g data-sourcing-check/><g data-sourcing-introspection/>'
    + '<g data-sourcing-door/><path data-sourcing-door-leaf/><circle data-sourcing-door-handle/><g data-sourcing-belt/><path data-sourcing-belt-tread/><path data-sourcing-roller/>'
    + '<g data-sourcing-bridge/><rect data-sourcing-bridge-track/><g data-sourcing-bridge-end/><g data-sourcing-roller-mount="28"/><g data-sourcing-roller-mount="280"/>'
    + '<g data-sourcing-wizard-step="0"/><g data-sourcing-wizard-step="1"/><g data-sourcing-wizard-step="2"/>'
    + SOURCING_EVENTS.map(event => '<g data-sourcing-packet="' + event.id + '"/><g class="sourcing-structured-cell" data-slot="' + event.id + '"/><circle class="sourcing-unstructured-dot" data-slot="' + event.id + '"/>').join('');
  return svg;
}
describe('SourcingAnimator', () => {
  it('changes the target at the retained time and clears every record on restart', () => {
    const svg = svgScene(), animator = new SourcingAnimator(svg, window);
    animator.seek(22);
    expect(svg.querySelectorAll('.sourcing-structured-cell[opacity="1"]')).toHaveLength(6);
    expect(svg.querySelectorAll('.sourcing-unstructured-dot[opacity="1"]')).toHaveLength(0);
    animator.setTarget('unstructured');
    expect(svg.querySelectorAll('.sourcing-structured-cell[opacity="1"]')).toHaveLength(0);
    expect(svg.querySelectorAll('.sourcing-unstructured-dot[opacity="1"]')).toHaveLength(6);
    animator.seek(0);
    expect(svg.querySelectorAll('[opacity="1"]')).toHaveLength(0);
    for (const time of [.8, 2, 3.2, 12.45, 12.7, 16.4, 19.45, 22.05]) {
      animator.seek(time);
      const frame = svg.innerHTML;
      animator.seek(22); animator.seek(time);
      expect(svg.innerHTML).toBe(frame);
    }
    animator.stop();
  });

  it('uses a single cancellable clock, freezes on pause and resets after 24 seconds', () => {
    let id = 0;
    const pending = new Map<number, FrameRequestCallback>();
    const view = { requestAnimationFrame: (callback: FrameRequestCallback) => { pending.set(++id, callback); return id; },
      cancelAnimationFrame: (key: number) => pending.delete(key) } as unknown as Window;
    const frame = (time: number) => { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(c => c(time)); };
    const reports = vi.fn(), svg = svgScene(), animator = new SourcingAnimator(svg, view, reports);
    animator.setRunning(true);
    for (let time = 0; time <= 1000; time += 20) frame(time);
    expect(pending.size).toBe(1);
    expect(reports.mock.calls.length).toBeLessThanOrEqual(11);
    animator.stop();
    const frozen = svg.innerHTML;
    frame(4000);
    expect(svg.innerHTML).toBe(frozen);
    expect(pending.size).toBe(0);
    animator.seek(23.95); animator.setRunning(true); frame(5000); frame(5100);
    expect(reports.mock.calls.at(-1)?.[0]).toBeLessThan(.1);
    expect(svg.querySelectorAll('[opacity="1"]')).toHaveLength(0);
    animator.stop();
    expect(pending.size).toBe(0);
  });
});
