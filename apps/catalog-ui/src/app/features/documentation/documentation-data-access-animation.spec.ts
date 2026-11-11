import {
  ACCESS_CYCLE, ACCESS_DATA_START, ACCESS_READ_START, ACCESS_RETURN_END, POLICY_ACTIVE_AT,
  POLICY_ASSIGNED_AT, POLICY_DISTRIBUTE_START, AccessAnimator, AccessPolicyScope, sampleAccessState,
} from './documentation-data-access-animation';

describe('illustrative SDAL access narrative', () => {
  it('requires an application through DaCa and Data Owner review before any approval or policy', () => {
    expect(sampleAccessState(5.9)).toMatchObject({ phase: 0, applicationStage: 'none' });
    expect(sampleAccessState(7.8)).toMatchObject({ phase: 1, applicationStage: 'submitting', applicationToken: { opacity: 1 }, reviewToken: { opacity: 0 } });
    expect(sampleAccessState(9.2)).toMatchObject({ applicationStage: 'submitted', applicationToken: { opacity: 0 } });
    expect(sampleAccessState(11)).toMatchObject({ phase: 2, applicationStage: 'forwarding', reviewToken: { opacity: 1 } });
    expect(sampleAccessState(12.2)).toMatchObject({ applicationStage: 'review', reviewToken: { opacity: 0 } });
    for (let time = 6; time < 14; time += .1) {
      const state = sampleAccessState(time);
      expect(state).toMatchObject({ policyStage: 'absent', policyStored: false, authoring: false, authorProgress: 0, authorToken: { opacity: 0 }, allowed: false });
      expect(state.lanes.every(lane => !lane.assigned && !lane.active && lane.data.opacity === 0 && lane.policy.opacity === 0)).toBe(true);
      expect(state.audit).toHaveLength(3);
      expect(state.audit.every(entry => entry.decision === 'deny')).toBe(true);
    }
    expect(sampleAccessState(14)).toMatchObject({ phase: 3, applicationStage: 'approved', authoring: true, allowed: false });
    expect(sampleAccessState(20)).toMatchObject({ phase: 4, applicationStage: 'approved', allowed: true });
    const reviewing = sampleAccessState(13);
    sampleAccessState(32);
    expect(sampleAccessState(13)).toEqual(reviewing);
    expect(sampleAccessState(0)).toMatchObject({ applicationStage: 'none', applicationToken: { opacity: 0 }, reviewToken: { opacity: 0 }, policyStored: false });
  });

  it('defaults to deny through authoring and assignment, then activates all gates together', () => {
    expect(sampleAccessState(0)).toMatchObject({ phase: 0, policyStage: 'absent', allowed: false, receivedCount: 0 });
    expect(sampleAccessState(14)).toMatchObject({ phase: 3, policyStage: 'draft', authoring: true, allowed: false });
    expect(sampleAccessState(POLICY_DISTRIBUTE_START)).toMatchObject({ policyStage: 'distributing', authoring: false });
    const assigned = sampleAccessState(POLICY_ASSIGNED_AT);
    expect(assigned.policyStage).toBe('assigned');
    expect(assigned.lanes.every(lane => lane.assigned && !lane.active && !lane.allowed)).toBe(true);
    expect(sampleAccessState(POLICY_ACTIVE_AT - .001).lanes.every(lane => !lane.active)).toBe(true);
    expect(sampleAccessState(POLICY_ACTIVE_AT).lanes.every(lane => lane.assigned && lane.active && lane.allowed)).toBe(true);
    for (let time = 0; time < POLICY_ACTIVE_AT; time += .05) {
      const state = sampleAccessState(time);
      expect(state.allowed).toBe(false);
      expect(state.receivedCount).toBe(0);
      expect(state.lanes.every(lane => lane.data.opacity === 0 && lane.request.x <= 760)).toBe(true);
    }
  });

  it('keeps missing, unavailable and nonmatching permissions denied after the activation time', () => {
    for (const request of [null, { consumer: 'consumer-b', action: 'read' }, { consumer: 'consumer-a', action: 'write' }, { consumer: '', action: 'read' }]) {
      for (const time of [20, 23.3, 26.4, 31]) {
        const state = sampleAccessState(time, request);
        expect(state.allowed).toBe(false);
        expect(state.receivedCount).toBe(0);
        expect(state.lanes.every(lane => !lane.allowed && lane.data.opacity === 0 && lane.request.x <= 760)).toBe(true);
      }
    }
    const unavailable = sampleAccessState(26.4, { consumer: 'consumer-a', action: 'read' }, false);
    expect(unavailable.policyStage).toBe('unavailable');
    expect(unavailable.allowed).toBe(false);
    expect(unavailable.lanes.every(lane => !lane.active && lane.data.opacity === 0)).toBe(true);
    expect(sampleAccessState(26.4, { consumer: 'consumer-a', action: 'read' }).allowed).toBe(true);
  });

  it('returns rejected requests from each gate without reaching any store', () => {
    const requests = sampleAccessState(1.8).lanes;
    expect(requests.every(lane => lane.request.opacity === 1 && lane.request.x < 760)).toBe(true);
    const rejected = sampleAccessState(3.8).lanes;
    expect(rejected.every(lane => lane.rejection.opacity === 1 && lane.rejection.x < 760 && lane.data.opacity === 0)).toBe(true);
    const lateRejected = sampleAccessState(24, { consumer: 'consumer-b', action: 'read' }).lanes;
    expect(lateRejected.every(lane => lane.rejection.opacity === 1 && lane.data.opacity === 0)).toBe(true);
  });

  it('reads each protected store before returning gold data through its own gate', () => {
    expect(sampleAccessState(POLICY_ACTIVE_AT).lanes.every(lane => lane.request.opacity === 0 && lane.data.opacity === 0)).toBe(true);
    expect(sampleAccessState(ACCESS_READ_START).lanes[0].request.opacity).toBe(1);
    expect(sampleAccessState(24).lanes.every(lane => lane.request.opacity === 1 && lane.request.x > 760 && lane.data.opacity === 0)).toBe(true);
    expect(sampleAccessState(ACCESS_DATA_START - .001).lanes.every(lane => lane.data.opacity === 0)).toBe(true);
    for (let index = 0; index < 3; index++) {
      const start = ACCESS_DATA_START + index * .18;
      const data = sampleAccessState(start).lanes[index].data;
      expect(data).toMatchObject({ x: 1010, opacity: 1 });
      expect(sampleAccessState(start).lanes[index].request.opacity).toBe(0);
      const gateTime = 26.1 + index * .18;
      const before = sampleAccessState(gateTime - .000001).lanes[index].data;
      const at = sampleAccessState(gateTime).lanes[index].data;
      const after = sampleAccessState(gateTime + .000001).lanes[index].data;
      expect(at.x).toBeCloseTo(760, 6);
      expect(Math.hypot(before.x - at.x, before.y - at.y)).toBeLessThan(.001);
      expect(Math.hypot(after.x - at.x, after.y - at.y)).toBeLessThan(.001);
      const returning = sampleAccessState(27.6).lanes[index].data;
      expect(returning.opacity).toBe(1);
      expect(returning.x).toBeLessThan(760);
    }
    expect(sampleAccessState(ACCESS_RETURN_END)).toMatchObject({ receivedCount: 3, allowed: true });
    expect(sampleAccessState(31).receivedCount).toBe(3);
    expect(sampleAccessState(ACCESS_CYCLE).lanes.every(lane => lane.data.opacity === 0)).toBe(true);
  });

  it('keeps all sampled coordinates finite and resets invalid or negative time to default deny', () => {
    expect(ACCESS_CYCLE).toBe(32);
    expect(sampleAccessState(-1).policyStage).toBe('absent');
    expect(sampleAccessState(NaN).allowed).toBe(false);
    for (let time = 0; time <= ACCESS_CYCLE; time += .1) {
      const state = sampleAccessState(time);
      expect([state.authorToken.x, state.authorToken.y, state.authorToken.opacity, state.authorProgress].every(Number.isFinite)).toBe(true);
      for (const lane of state.lanes) {
        for (const packet of [lane.request, lane.rejection, lane.policy, lane.data]) {
          expect([packet.x, packet.y, packet.opacity].every(Number.isFinite)).toBe(true);
          expect(packet.opacity).toBeGreaterThanOrEqual(0);
          expect(packet.opacity).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('applies a logical-model policy to all related physical representations', () => {
    const state = sampleAccessState(31, undefined, true, { level: 'logical-model' });
    expect(state).toMatchObject({ scope: 'logical-model', scopeCount: 3, allowed: true, receivedCount: 3, policyStored: true });
    expect(state.lanes.every(lane => lane.inScope && lane.assigned && lane.active && lane.allowed && lane.delivered)).toBe(true);
  });

  it('enforces single or multiple persistence selections independently and deduplicates them', () => {
    const one: AccessPolicyScope = { level: 'persistences', persistenceIndexes: [1] };
    const distributed = sampleAccessState(17.5, undefined, true, one);
    expect(distributed.lanes.map(lane => lane.policy.opacity)).toEqual([0, 1, 0]);
    const assigned = sampleAccessState(POLICY_ASSIGNED_AT, undefined, true, one);
    expect(assigned.lanes.map(lane => lane.assigned)).toEqual([false, true, false]);
    expect(assigned.lanes.every(lane => !lane.active && !lane.allowed)).toBe(true);
    const inFlight = sampleAccessState(24, undefined, true, one);
    expect(inFlight.allowed).toBe(true);
    expect(inFlight.lanes.map(lane => lane.active)).toEqual([false, true, false]);
    expect(inFlight.lanes.map(lane => lane.rejection.opacity)).toEqual([1, 0, 1]);
    expect(inFlight.lanes[0].request.x).toBeLessThanOrEqual(760);
    expect(inFlight.lanes[2].request.x).toBeLessThanOrEqual(760);
    expect(sampleAccessState(26.4, undefined, true, one).lanes.map(lane => lane.data.opacity)).toEqual([0, 1, 0]);
    const delivered = sampleAccessState(31, undefined, true, one);
    expect(delivered).toMatchObject({ scope: 'persistences', scopeCount: 1, receivedCount: 1 });
    expect(delivered.lanes.map(lane => lane.delivered)).toEqual([false, true, false]);
    const several = sampleAccessState(31, undefined, true, { level: 'persistences', persistenceIndexes: [2, 0, 2] });
    expect(several.scopeCount).toBe(2);
    expect(several.receivedCount).toBe(2);
    expect(several.lanes.map(lane => lane.allowed)).toEqual([true, false, true]);
  });

  it('grants no persistence for missing, empty or malformed selections', () => {
    const invalid = [
      { level: 'persistences' }, { level: 'persistences', persistenceIndexes: [] },
      { level: 'persistences', persistenceIndexes: [-1] }, { level: 'persistences', persistenceIndexes: [3] },
      { level: 'persistences', persistenceIndexes: [1, 3] }, { level: 'persistences', persistenceIndexes: [.5] },
      { level: 'persistences', persistenceIndexes: [NaN] }, { level: 'persistences', persistenceIndexes: '1' },
      { level: 'persistences', persistenceIndexes: new Array(2) },
      { level: 'persistences', persistenceIndexes: [null] }, { level: 'other', persistenceIndexes: [1] }, null,
    ] as unknown as AccessPolicyScope[];
    for (const scope of invalid) {
      const state = sampleAccessState(31, undefined, true, scope);
      expect(state).toMatchObject({ allowed: false, scopeCount: 0, receivedCount: 0 });
      expect(state.lanes.every(lane => !lane.inScope && !lane.assigned && !lane.active && !lane.allowed && !lane.delivered)).toBe(true);
      expect(sampleAccessState(17.5, undefined, true, scope).lanes.every(lane => lane.policy.opacity === 0)).toBe(true);
      expect(sampleAccessState(26.4, undefined, true, scope).lanes.every(lane => lane.data.opacity === 0)).toBe(true);
    }
  });

  it('keeps the authored PAP policy stored independently of enforcement availability', () => {
    expect(sampleAccessState(POLICY_DISTRIBUTE_START - .001).policyStored).toBe(false);
    for (const time of [POLICY_DISTRIBUTE_START, 17, POLICY_ASSIGNED_AT, POLICY_ACTIVE_AT, 31, ACCESS_CYCLE]) {
      const state = sampleAccessState(time, undefined, false, { level: 'persistences', persistenceIndexes: [1] });
      expect(state.policyStored).toBe(true);
      expect(state.allowed).toBe(false);
      expect(state.receivedCount).toBe(0);
    }
    expect(sampleAccessState(0).policyStored).toBe(false);
  });

  it('derives one chronological audit entry for every denied and allowed gate decision', () => {
    expect(sampleAccessState(0).audit).toEqual([]);
    expect(sampleAccessState(2.2 - .001).audit).toEqual([]);
    const first = sampleAccessState(2.6).audit;
    expect(first).toHaveLength(3);
    expect(first.map(entry => entry.lane)).toEqual([0, 1, 2]);
    expect(first.every(entry => entry.decision === 'deny' && entry.reason === 'no-active-policy')).toBe(true);
    const all = sampleAccessState(23).audit;
    expect(all).toHaveLength(6);
    expect(all.filter(entry => entry.decision === 'allow')).toHaveLength(3);
    expect(all.map(entry => entry.at)).toEqual([...all.map(entry => entry.at)].sort((a, b) => a - b));
    expect(all.every(entry => entry.consumer === 'consumer-a' && entry.action === 'read')).toBe(true);
    const selected = sampleAccessState(23, undefined, true, { level: 'persistences', persistenceIndexes: [1] }).audit;
    expect(selected.filter(entry => entry.decision === 'deny')).toHaveLength(5);
    expect(selected.filter(entry => entry.decision === 'allow').map(entry => entry.lane)).toEqual([1]);
    expect(selected.filter(entry => entry.reason === 'out-of-scope').map(entry => entry.lane)).toEqual([0, 2]);
    for (const entry of selected) {
      expect(Object.keys(entry).sort()).toEqual(['action', 'at', 'consumer', 'decision', 'id', 'lane', 'reason']);
    }
    expect(sampleAccessState(23, undefined, false).audit.slice(3).every(entry => entry.reason === 'policy-unavailable')).toBe(true);
    expect(sampleAccessState(23, { consumer: 'consumer-b', action: 'read' }).audit.slice(3).every(entry => entry.reason === 'request-mismatch')).toBe(true);
  });

  it('recomputes audit history when seeking without duplicates or future decision leakage', () => {
    const complete = sampleAccessState(31).audit;
    expect(sampleAccessState(23).audit).toEqual(complete);
    expect(new Set(complete.map(entry => entry.id)).size).toBe(6);
    expect(sampleAccessState(22.5).audit).toHaveLength(4);
    expect(sampleAccessState(20).audit).toEqual(complete.slice(0, 3));
    expect(sampleAccessState(0).audit).toEqual([]);
    expect(sampleAccessState(31).audit).toEqual(complete);
    const changedScope = sampleAccessState(31, undefined, true, { level: 'persistences', persistenceIndexes: [1] }).audit;
    expect(changedScope.map(entry => entry.id)).toEqual(complete.map(entry => entry.id));
  });
});

describe('AccessAnimator scope projection', () => {
  it('redraws the retained playhead and individual receipts without resetting or reporting a new time', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.innerHTML = [0, 1, 2].map(index => `<g class="access-gate"><path class="gate-cross"/><path class="gate-tick"/><g class="gate-policy-check"/></g><g data-packet="policy" data-lane="${index}"/><g data-packet="data" data-lane="${index}"/>`).join('')
      + '<g class="access-receipt"><circle/><circle/><circle/></g>';
    const reports = vi.fn();
    const animator = new AccessAnimator(svg, window, reports, 31);
    const receipt = svg.querySelector('.access-receipt')!;
    const circles = () => [...receipt.querySelectorAll('circle')].map(node => node.getAttribute('opacity'));
    expect(circles()).toEqual(['1', '1', '1']);
    const indexes = [1];
    animator.setPolicyScope({ level: 'persistences', persistenceIndexes: indexes });
    expect(reports).toHaveBeenCalledTimes(1);
    expect(reports).toHaveBeenLastCalledWith(31);
    expect(circles()).toEqual(['0', '1', '0']);
    expect([...svg.querySelectorAll('.access-gate')].map(node => node.getAttribute('data-active'))).toEqual(['false', 'true', 'false']);
    indexes.push(2);
    animator.seek(31);
    expect(circles()).toEqual(['0', '1', '0']);
    animator.seek(26.4);
    const retained = svg.querySelector('[data-packet="data"][data-lane="1"]')!.getAttribute('transform');
    const count = reports.mock.calls.length;
    animator.setPolicyScope({ level: 'logical-model' });
    expect(reports).toHaveBeenCalledTimes(count);
    expect(svg.querySelector('[data-packet="data"][data-lane="1"]')!.getAttribute('transform')).toBe(retained);
    expect([...svg.querySelectorAll('[data-packet="data"]')].map(node => node.getAttribute('opacity'))).toEqual(['1', '1', '1']);
    animator.setPolicyScope({ level: 'persistences', persistenceIndexes: [] });
    expect(receipt.getAttribute('opacity')).toBe('0');
    expect([...svg.querySelectorAll('[data-packet="data"]')].every(node => node.getAttribute('opacity') === '0')).toBe(true);
    animator.stop();
  });
});
