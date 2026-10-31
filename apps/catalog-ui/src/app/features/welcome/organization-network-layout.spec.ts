import { NetworkPlacement, optimizeOrganizationNetwork } from './organization-network-layout';

const region={x:0,y:0,width:960,height:650};
const node=(id:string,x:number,y:number,group:NetworkPlacement['group']='office',fixed=false):NetworkPlacement=>({id,x,y,width:100,height:50,delay:'-2s',duration:'18s',region,group,fixed});
const distance=(a:NetworkPlacement,b:NetworkPlacement)=>Math.hypot(a.x-b.x,a.y-b.y);
const clear=(items:NetworkPlacement[])=>{
  for(const [index,item] of items.entries()){
    expect(Number.isFinite(item.x)&&Number.isFinite(item.y)).toBe(true);
    for(const other of items.slice(index+1))expect(Math.abs(item.x-other.x)>=(item.width+other.width)/2+12||Math.abs(item.y-other.y)>=(item.height+other.height)/2+12).toBe(true);
  }
};
describe('organization relationship placement',()=>{
  it('untangles disconnected pairs and shortens links without overlapping cards',()=>{
    const initial=[node('a',100,100),node('b',800,100),node('c',100,500),node('d',800,500)];
    const edges=[{sourceId:'a',targetId:'d',weight:4},{sourceId:'b',targetId:'c',weight:4}];
    const result=optimizeOrganizationNetwork(initial,edges),byId=new Map(result.map(item=>[item.id,item]));
    expect(result).toEqual(optimizeOrganizationNetwork(initial,edges));
    expect(initial[0].x).toBe(100);
    expect(distance(byId.get('a')!,byId.get('d')!)).toBeLessThan(300);
    expect(distance(byId.get('b')!,byId.get('c')!)).toBeLessThan(300);
    const side=(a:NetworkPlacement,b:NetworkPlacement,c:NetworkPlacement)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    const [a,b,c,d]=['a','b','c','d'].map(id=>byId.get(id)!);
    expect(side(a,d,b)*side(a,d,c)<0&&side(b,c,a)*side(b,c,d)<0).toBe(false);
    clear(result);
  });
  it('moves an automatic exterior consumer toward a fixed producer while retaining domain affiliation',()=>{
    const initial=[node('estv',700,400,'office',true),node('bit',300,350,'office',true),node('domain:rohs',300,450,'domain'),node('ne',80,48,'satellite'),node('post',880,400,'satellite')];
    const edges=[{sourceId:'estv',targetId:'ne',weight:4},{sourceId:'bit',targetId:'domain:rohs',weight:1}];
    const result=optimizeOrganizationNetwork(initial,edges),byId=new Map(result.map(item=>[item.id,item]));
    expect(byId.get('estv')).toEqual(initial[0]);expect(byId.get('bit')).toEqual(initial[1]);
    expect(distance(byId.get('estv')!,byId.get('ne')!)).toBeLessThan(distance(initial[0],initial[3])*.4);
    expect(distance(byId.get('bit')!,byId.get('domain:rohs')!)).toBeLessThan(160);
    expect(byId.get('ne')!.x>=830||byId.get('ne')!.x<=122||byId.get('ne')!.y<=71||byId.get('ne')!.y>=591).toBe(true);
    clear(result);
  });
  it('honors manual anchors even when they force long relationships and ignores unknown endpoints',()=>{
    const initial=[node('a',100,100,'office',true),node('b',800,500,'office',true)];
    expect(optimizeOrganizationNetwork(initial,[{sourceId:'a',targetId:'b',weight:4},{sourceId:'a',targetId:'missing',weight:4}])).toEqual(initial);
  });
  it('moves a connected automatic card out of a saved anchor before minimizing reciprocal edge lengths',()=>{
    const initial=[node('armasuisse',300,250,'office',true),node('verteidigung',300,280),node('other',500,400)];
    const result=optimizeOrganizationNetwork(initial,[{sourceId:'armasuisse',targetId:'verteidigung',weight:4},{sourceId:'verteidigung',targetId:'armasuisse',weight:4}]);
    expect(result[0]).toEqual(initial[0]);
    expect(result[1]).not.toEqual(initial[1]);
    clear(result);
    expect(distance(result[0],result[1])).toBeGreaterThan(distance(initial[0],initial[1]));
  });
  it('keeps exterior data links clear of the organization heading',()=>{
    const title={...node('heading',480,150,'title',true),width:460,height:110};
    const initial=[node('estv',700,400,'office',true),node('ne',480,48,'satellite'),title];
    const result=optimizeOrganizationNetwork(initial,[{sourceId:'estv',targetId:'ne',weight:4}]);
    expect(result[2]).toEqual(title);
    expect(result[1].x).toBeGreaterThan(780);
    expect(distance(result[0],result[1])).toBeLessThan(250);
    clear(result);
  });
});
