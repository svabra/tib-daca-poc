import { radialDomainLayout } from './domain-network-layout';

describe('radial domain layout', () => {
  it('packs a mixed six-domain product view tightly instead of spacing all groups for the largest one', () => {
    const groups=[{id:'a',width:230,height:120},{id:'b',width:240,height:250},{id:'c',width:240,height:250},{id:'d',width:505,height:365},{id:'e',width:230,height:120},{id:'f',width:230,height:120}];
    const layout=radialDomainLayout(groups);
    expect(layout.width).toBeLessThanOrEqual(1200);
    expect(layout.height).toBeLessThan(900);
    const boxes=groups.map(group=>({...group,...layout.positions[group.id]}));
    for(const a of boxes){
      const nearest=Math.min(...boxes.filter(b=>b!==a).map(b=>Math.hypot(Math.max(0,a.x-b.x-b.width,b.x-a.x-a.width),Math.max(0,a.y-b.y-b.height,b.y-a.y-a.height))));
      expect(nearest).toBeLessThanOrEqual(48);
    }
  });
  for (const count of [1, 2, 3, 8, 9, 24, 50]) {
    it(`centers ${count} complete domain/object clusters without overlaps`, () => {
      const groups = Array.from({ length: count }, (_, i) => ({ id: String(i).padStart(3, '0'), width: i % 2 ? 505 : 230, height: 120 + i % 4 * 115 }));
      const layout = radialDomainLayout(groups, 3800, 1000);
      const boxes = groups.map(group => ({ ...layout.positions[group.id], width: group.width, height: group.height }));
      const left = Math.min(...boxes.map(box => box.x)), right = Math.max(...boxes.map(box => box.x + box.width));
      const top = Math.min(...boxes.map(box => box.y)), bottom = Math.max(...boxes.map(box => box.y + box.height));
      expect(left).toBeGreaterThanOrEqual(49);
      expect(top).toBeGreaterThanOrEqual(49);
      expect((left + right) / 2).toBeCloseTo(layout.width / 2);
      expect((top + bottom) / 2).toBeCloseTo(layout.height / 2);
      for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) {
        expect(a.x + a.width + 30 <= b.x || b.x + b.width + 30 <= a.x || a.y + a.height + 30 <= b.y || b.y + b.height + 30 <= a.y).toBe(true);
      }
      if (count > 2) expect(new Set(boxes.map(box => Math.round(box.x))).size).toBeGreaterThan(1);
      expect(radialDomainLayout([...groups].reverse(), 3800, 1000)).toEqual(layout);
    });
  }
});
