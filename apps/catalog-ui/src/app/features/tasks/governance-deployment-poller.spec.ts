import { of } from 'rxjs';
import { GovernanceDeploymentPoller } from './governance-deployment-poller';

describe('GovernanceDeploymentPoller', () => {
  afterEach(() => vi.useRealTimers());

  it('polls at one second and stops at the terminal deployment state', () => {
    vi.useFakeTimers();
    const states = [{ status: 'approved_deploying' }, { status: 'approved' }];
    let loads = 0;
    const updates: string[] = [];
    const terminals: string[] = [];
    const poller = new GovernanceDeploymentPoller(
      () => of(states[loads++]),
      (value) => updates.push(value.status),
      (value) => terminals.push(value.status),
    );

    poller.start();
    vi.advanceTimersByTime(999);
    expect(loads).toBe(0);
    vi.advanceTimersByTime(1);
    expect(updates).toEqual(['approved_deploying']);
    vi.advanceTimersByTime(1000);
    expect(updates).toEqual(['approved_deploying', 'approved']);
    expect(terminals).toEqual(['approved']);
    vi.advanceTimersByTime(5000);
    expect(loads).toBe(2);
  });

  it('cancels a pending poll when its owner is destroyed', () => {
    vi.useFakeTimers();
    let loads = 0;
    const poller = new GovernanceDeploymentPoller(
      () => { loads += 1; return of({ status: 'approved' }); },
      () => undefined,
      () => undefined,
    );
    poller.start();
    poller.stop();
    vi.advanceTimersByTime(1000);
    expect(loads).toBe(0);
  });
});
