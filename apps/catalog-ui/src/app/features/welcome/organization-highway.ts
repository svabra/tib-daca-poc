export interface HighwayPoint { x: number; y: number }
export interface HighwayObstacle { x: number; y: number; width: number; height: number }

/** A reversible cubic spine. Prefer a soft bend, but keep the whole ribbon clear of nearby cards. */
export function organizationHighway(from: HighwayPoint, to: HighwayPoint, obstacles: readonly HighwayObstacle[] = []) {
  const dx=to.x-from.x,dy=to.y-from.y,horizontal=Math.abs(dx)>=Math.abs(dy);
  const curves=[.5,.28,0].map(bend=>{
    const a=horizontal?{x:from.x+dx*bend,y:from.y}:{x:from.x,y:from.y+dy*bend};
    const b=horizontal?{x:to.x-dx*bend,y:to.y}:{x:to.x,y:to.y-dy*bend};
    const at=(t:number):HighwayPoint=>{
      const u=1-t;
      return {x:u**3*from.x+3*u*u*t*a.x+3*u*t*t*b.x+t**3*to.x,y:u**3*from.y+3*u*u*t*a.y+3*u*t*t*b.y+t**3*to.y};
    };
    const samples=Array.from({length:41},(_,i)=>at(i/40));
    const hits=samples.reduce((sum,point)=>sum+obstacles.filter(card=>Math.abs(point.x-card.x)<card.width/2+11&&Math.abs(point.y-card.y)<card.height/2+11).length,0);
    const length=samples.slice(1).reduce((sum,point,i)=>sum+Math.hypot(point.x-samples[i].x,point.y-samples[i].y),0);
    const n=(value:number)=>Math.round(value*100)/100;
    return {path:`M ${n(from.x)} ${n(from.y)} C ${n(a.x)} ${n(a.y)} ${n(b.x)} ${n(b.y)} ${n(to.x)} ${n(to.y)}`,length,hits,from,to,startControl:a,endControl:b};
  });
  // Stable ties preserve the strongest available curve; straight fallback never adds an avoidable card crossing.
  return curves.reduce((best,curve)=>curve.hits<best.hits?curve:best);
}

export interface HighwayHalfSize { halfWidth:number; halfHeight:number }

/** Trim the packet flight from one continuous ribbon, using exact cubic subdivision. */
export function organizationHighwayFlight(curve:ReturnType<typeof organizationHighway>,source?:HighwayHalfSize,target?:HighwayHalfSize) {
  const mix=(a:HighwayPoint,b:HighwayPoint,t:number)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
  const split=(p:readonly HighwayPoint[],t:number)=>{
    const a=mix(p[0],p[1],t),b=mix(p[1],p[2],t),c=mix(p[2],p[3],t),d=mix(a,b,t),e=mix(b,c,t),f=mix(d,e,t);
    return {left:[p[0],a,d,f],right:[f,e,c,p[3]]};
  };
  const original=[curve.from,curve.startControl,curve.endControl,curve.to];
  const inside=(point:HighwayPoint,center:HighwayPoint,size:HighwayHalfSize)=>Math.abs(point.x-center.x)<=size.halfWidth&&Math.abs(point.y-center.y)<=size.halfHeight;
  const boundary=(size:HighwayHalfSize,center:HighwayPoint,entering:boolean)=>{
    let low=0,high=1;
    for(let i=0;i<42;i++){
      const t=(low+high)/2,isInside=inside(split(original,t).left[3],center,size);
      if(isInside===entering)high=t;else low=t;
    }
    return (low+high)/2;
  };
  let start=source?boundary(source,curve.from,false):0,end=target?boundary(target,curve.to,true):1;
  // Overlapping personal cards have no clear interval; keep a finite short flight.
  if(start>=end){start=.45;end=.55;}
  let points=end<1?split(original,end).left:original;
  if(start>0)points=split(points,start/end).right;
  const n=(value:number)=>Math.round(value*100)/100,p=(point:HighwayPoint)=>`${n(point.x)} ${n(point.y)}`;
  const samples=Array.from({length:41},(_,i)=>split(points,i/40).left[3]);
  const length=samples.slice(1).reduce((sum,point,i)=>sum+Math.hypot(point.x-samples[i].x,point.y-samples[i].y),0);
  return {...curve,from:{x:n(points[0].x),y:n(points[0].y)},to:{x:n(points[3].x),y:n(points[3].y)},startControl:points[1],endControl:points[2],
    path:`M ${p(points[0])} C ${p(points[1])} ${p(points[2])} ${p(points[3])}`,length};
}
