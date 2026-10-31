import { organizationHighway, organizationHighwayFlight } from './organization-highway';

describe('organizationHighway',()=>{
  it('clips a smooth whole-card curve at the card bounds and reverses the identical flight',()=>{
    const from={x:80,y:140},to={x:320,y:310},box={halfWidth:66,halfHeight:39};
    const ribbon=organizationHighway(from,to),flight=organizationHighwayFlight(ribbon,box,box);
    expect((ribbon.path.match(/ C /g)??[])).toHaveLength(1);
    expect(ribbon.path).not.toContain(' L ');
    const edge=(point:{x:number;y:number},center:{x:number;y:number})=>Math.max(Math.abs(point.x-center.x)/box.halfWidth,Math.abs(point.y-center.y)/box.halfHeight);
    expect(edge(flight.from,from)).toBeCloseTo(1,3);expect(edge(flight.to,to)).toBeCloseTo(1,3);
    expect(flight.length).toBeLessThan(ribbon.length);
    const reversed=organizationHighwayFlight(organizationHighway(to,from),box,box);
    expect(reversed.from).toEqual(flight.to);expect(reversed.to).toEqual(flight.from);
    expect(reversed.length).toBeCloseTo(flight.length,5);
    const numbers=(path:string)=>path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    const original=numbers(flight.path),back=numbers(reversed.path);
    expect(back).toEqual([original[6],original[7],original[4],original[5],original[2],original[3],original[0],original[1]]);
  });
  it('reverses the same continuous spine for counterflow lanes',()=>{
    const forward=organizationHighway({x:20,y:50},{x:300,y:190});
    const reverse=organizationHighway({x:300,y:190},{x:20,y:50});
    expect(forward.path).toBe('M 20 50 C 160 50 160 190 300 190');
    expect(reverse.path).toBe('M 300 190 C 160 190 160 50 20 50');
    expect(forward.length).toBeCloseTo(reverse.length,5);
    expect(forward.length).toBeGreaterThan(Math.hypot(280,140));
  });
  it('flattens a curve when its wide ribbon would hit an unrelated card',()=>{
    const clear=organizationHighway({x:0,y:0},{x:200,y:200});
    const safe=organizationHighway({x:0,y:0},{x:200,y:200},[{x:59,y:22,width:20,height:20}]);
    expect(clear.path).not.toBe(safe.path);expect(safe.hits).toBe(0);
    expect(safe.path.startsWith('M 0 0 C')).toBe(true);expect(safe.path.endsWith('200 200')).toBe(true);
  });
});
