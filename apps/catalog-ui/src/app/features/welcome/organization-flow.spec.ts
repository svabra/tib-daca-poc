import { organizationFlow } from './organization-flow';

describe('organizationFlow', () => {
  it('separates two heads on a short highway while preserving the three-second transit',()=>{
    const short=organizationFlow(2,40),long=organizationFlow(2,400);
    expect(short.duration).toBe('3s');expect(long.duration).toBe('3s');
    expect(Math.abs(parseFloat(short.particles[1].delay))/3*40).toBeGreaterThanOrEqual(18);
    expect(Math.abs(parseFloat(long.particles[1].delay))/3*400).toBeGreaterThanOrEqual(32);
    expect(short.particles).toHaveLength(2);
  });
  it('shows exactly one point per product, grouping two successive points without changing speed', () => {
    const one = organizationFlow(1), two = organizationFlow(2), many = organizationFlow(20);
    expect(one.particles).toHaveLength(1);expect(two.particles).toHaveLength(2);expect(many.particles).toHaveLength(20);
    expect(one.duration).toBe(two.duration);expect(two.duration).toBe(many.duration);
    expect(one.duration).toBe('3s');
    expect(Math.abs(parseFloat(two.particles[1].delay)-parseFloat(two.particles[0].delay))).toBeLessThan(parseFloat(two.duration)/4);
    expect(new Set(many.particles.map(point => point.delay)).size).toBe(many.particles.length);
    expect(new Set(two.particles.map(point => point.rest)).size).toBe(2);
    expect(organizationFlow(0).particles).toHaveLength(0);expect(organizationFlow(NaN).particles).toHaveLength(0);
  });
});
