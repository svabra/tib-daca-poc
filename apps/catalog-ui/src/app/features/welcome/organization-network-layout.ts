import { OrganizationPlacement } from './organization-layout';

export interface OrganizationLayoutEdge { sourceId: string; targetId: string; weight: number }
export interface OrganizationLayoutRegion { x: number; y: number; width: number; height: number }
export interface NetworkPlacement extends OrganizationPlacement { region: OrganizationLayoutRegion; group: 'office' | 'domain' | 'satellite' | 'title'; fixed: boolean }

function crosses(a: OrganizationPlacement, b: OrganizationPlacement, c: OrganizationPlacement, d: OrganizationPlacement): boolean {
  const side = (p: OrganizationPlacement, q: OrganizationPlacement, r: OrganizationPlacement) => (q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
  return side(a,b,c)*side(a,b,d)<-.01 && side(c,d,a)*side(c,d,b)<-.01;
}

/** Deterministic local search: short edges, few crossings, clear text/cards, fixed personal anchors. */
export function optimizeOrganizationNetwork(initial: readonly NetworkPlacement[], relationships: readonly OrganizationLayoutEdge[]): NetworkPlacement[] {
  const nodes = initial.map(node => ({ ...node })), byId = new Map(nodes.map(node => [node.id,node]));
  const edges = relationships.flatMap(edge => {
    const a=byId.get(edge.sourceId),b=byId.get(edge.targetId);
    return a&&b&&a!==b ? [{a,b,weight:Math.max(.1,Math.min(12,edge.weight))}] : [];
  });
  if (!edges.length) return nodes;
  const degree = new Set(edges.flatMap(edge=>[edge.a.id,edge.b.id]));
  const collides = (a: NetworkPlacement,b: NetworkPlacement) => Math.abs(a.x-b.x)<(a.width+b.width)/2+14 && Math.abs(a.y-b.y)<(a.height+b.height)/2+14;
  const fits = (node: NetworkPlacement) => {
    const r=node.region;
    if(node.x-node.width/2<r.x+8 || node.x+node.width/2>r.x+r.width-8 || node.y-node.height/2<r.y+8 || node.y+node.height/2>r.y+r.height-8) return false;
    // Exterior cards keep their perimeter lanes; a saved anchor is never adjusted.
    if(node.group==='satellite' && !(node.x+node.width/2+8<=180 || node.x-node.width/2-8>=780 || node.y+node.height/2+8<=104 || node.y-node.height/2-8>=558)) return false;
    return !nodes.some(other=>other!==node&&collides(node,other));
  };
  const hitsCard = (a:NetworkPlacement,b:NetworkPlacement,card:NetworkPlacement) => {
    const left=card.x-card.width/2-4,right=card.x+card.width/2+4,top=card.y-card.height/2-4,bottom=card.y+card.height/2+4;
    let low=0,high=1;
    for(const [start,delta,min,max] of [[a.x,b.x-a.x,left,right],[a.y,b.y-a.y,top,bottom]]){
      if(Math.abs(delta)<.001){if(start<=min||start>=max)return false;continue;}
      let enter=(min-start)/delta,leave=(max-start)/delta;if(enter>leave)[enter,leave]=[leave,enter];
      low=Math.max(low,enter);high=Math.min(high,leave);if(low>=high)return false;
    }
    return high>.01&&low<.99;
  };
  // Only terms changed by a proposed move are evaluated. This keeps dragging and
  // larger overviews responsive without dropping any relationship from the view.
  const score = (changed: ReadonlySet<string>) => {
    let value=0;
    const affected=edges.map(edge=>changed.has(edge.a.id)||changed.has(edge.b.id));
    for(let i=0;i<edges.length;i++){
      const edge=edges[i];
      if(affected[i]){
        const distance=Math.hypot(edge.a.x-edge.b.x,edge.a.y-edge.b.y);
        value+=edge.weight*(distance*distance+3*Math.max(0,distance-220)**2);
      }
      for(const card of nodes){
        if(card===edge.a||card===edge.b||(!affected[i]&&!changed.has(card.id)))continue;
        if(hitsCard(edge.a,edge.b,card))value+=card.group==='title'?800000:300000;
      }
      for(let j=i+1;j<edges.length;j++){
        if(!affected[i]&&!affected[j])continue;
        const other=edges[j];
        if(edge.a===other.a||edge.a===other.b||edge.b===other.a||edge.b===other.b)continue;
        if(crosses(edge.a,edge.b,other.a,other.b))value+=300000;
      }
    }
    return value;
  };
  for(let pass=0;pass<4;pass++){
    let improved=false;
    // Swapping existing office/perimeter slots escapes blocked local minima.
    for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
      const a=nodes[i],b=nodes[j];
      if(a.fixed||b.fixed||a.group==='domain'||a.group!==b.group||a.width!==b.width||a.height!==b.height||(!degree.has(a.id)&&!degree.has(b.id)))continue;
      const changed=new Set([a.id,b.id]),before=score(changed);
      [a.x,b.x]=[b.x,a.x];[a.y,b.y]=[b.y,a.y];
      if(fits(a)&&fits(b)&&score(changed)+.01<before)improved=true;
      else{[a.x,b.x]=[b.x,a.x];[a.y,b.y]=[b.y,a.y];}
    }
    for(const node of nodes){
      if(node.fixed||!degree.has(node.id))continue;
      const neighbors=edges.flatMap(edge=>edge.a===node?[{node:edge.b,weight:edge.weight}]:edge.b===node?[{node:edge.a,weight:edge.weight}]:[]);
      const total=neighbors.reduce((sum,item)=>sum+item.weight,0),r=node.region;
      const center={x:neighbors.reduce((sum,item)=>sum+item.node.x*item.weight,0)/total,y:neighbors.reduce((sum,item)=>sum+item.node.y*item.weight,0)/total};
      const candidates=[center,...neighbors.map(item=>({x:item.node.x,y:item.node.y}))];
      const origin={x:node.x,y:node.y};
      for(const step of [28,64,128])for(let angle=0;angle<8;angle++)candidates.push({x:origin.x+Math.cos(angle*Math.PI/4)*step,y:origin.y+Math.sin(angle*Math.PI/4)*step});
      if(node.group==='satellite')for(const target of [center,...neighbors.map(item=>item.node)]){
        candidates.push({x:80,y:target.y},{x:880,y:target.y},{x:target.x,y:48},{x:target.x,y:602});
      }
      // A saved anchor can overlap an automatic starting slot. Repair that
      // invalid slot before optimizing distance, even if moving makes the edge longer.
      const changed=new Set([node.id]);let best=fits(node)?score(changed):Infinity,chosen=origin;
      for(const point of candidates){
        node.x=Math.max(r.x+node.width/2+8,Math.min(r.x+r.width-node.width/2-8,point.x));
        node.y=Math.max(r.y+node.height/2+8,Math.min(r.y+r.height-node.height/2-8,point.y));
        if(!fits(node))continue;
        const candidate=score(changed);
        if(candidate+.01<best){best=candidate;chosen={x:node.x,y:node.y};improved=true;}
      }
      Object.assign(node,chosen);
    }
    if(!improved)break;
  }
  return nodes;
}
