export interface DomainLayoutGroup { id: string; width: number; height: number; }

/** Compact whole domain/object clusters around one center, using their individual bounds. */
export function radialDomainLayout(groups: readonly DomainLayoutGroup[], minimumWidth = 1100, minimumHeight = 550) {
  const positions: Record<string, { x: number; y: number }> = {};
  if (!groups.length) return { positions, width: minimumWidth, height: minimumHeight };
  const ordered = [...groups].sort((a, b) => a.id.localeCompare(b.id));
  const gap = 32, aspect = 1.25;
  const placed: { group: DomainLayoutGroup; x: number; y: number }[] = [];
  const overlaps = (a:typeof placed[number],b:typeof placed[number]) => a.x+a.group.width+gap>b.x&&b.x+b.group.width+gap>a.x&&a.y+a.group.height+gap>b.y&&b.y+b.group.height+gap>a.y;
  let offset = 0, ring = 1, previousRadius = 0;
  while (offset < ordered.length) {
    const count = Math.min(8 * ring, ordered.length - offset);
    const current=ordered.slice(offset,offset+count);
    // Put the tallest cluster beside the center, avoiding a tall stack above
    // and below it that forces every card to shrink just to fit the viewport.
    const tallest=current.reduce((best,group,index)=>group.height>current[best].height?index:best,0);
    const angles = Array.from({ length: count }, (_, index) => (index-tallest) * Math.PI * 2 / count);
    let radius = ring === 1 ? 0 : previousRadius + Math.max(...current.map(group=>Math.max(group.width,group.height)))/2 + gap;
    for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) {
      // A large product cluster must not inflate the spacing of every small domain.
      const dx = Math.abs(Math.cos(angles[i])-Math.cos(angles[j]))*aspect;
      const dy = Math.abs(Math.sin(angles[i])-Math.sin(angles[j]));
      const horizontal = dx>1e-6?((current[i].width+current[j].width)/2+gap)/dx:Infinity;
      const vertical = dy>1e-6?((current[i].height+current[j].height)/2+gap)/dy:Infinity;
      radius = Math.max(radius,Math.min(horizontal,vertical)+.01);
    }
    const ringItems=()=>current.map((group,index)=>({group,x:Math.cos(angles[index])*radius*aspect-group.width/2,y:Math.sin(angles[index])*radius-group.height/2}));
    while(ringItems().some(item=>placed.some(other=>overlaps(item,other))))radius+=16;
    placed.push(...ringItems());offset+=count;
    previousRadius = radius; ring++;
  }
  // Pull each cluster inward along its radial direction, keeping the complete
  // domain/object footprint clear. This closes empty sectors in mixed-size rings.
  for(let pass=0;pass<4;pass++){
    let moved=false;
    for(const item of [...placed].sort((a,b)=>a.group.width*a.group.height-b.group.width*b.group.height||a.group.id.localeCompare(b.group.id))){
      const cx=item.x+item.group.width/2,cy=item.y+item.group.height/2,length=Math.hypot(cx,cy);
      if(length<1)continue;
      for(let distance=0;distance<length-1;distance+=8){
        const candidate={group:item.group,x:cx*distance/length-item.group.width/2,y:cy*distance/length-item.group.height/2};
        if(placed.some(other=>other!==item&&overlaps(candidate,other)))continue;
        item.x=candidate.x;item.y=candidate.y;moved=true;break;
      }
    }
    if(!moved)break;
  }
  // Fill free pockets between uneven clusters. A radial seed alone cannot use
  // these gaps when a wide/tall product block sits on a neighboring spoke.
  const compactness=()=>{
    const width=Math.max(...placed.map(item=>item.x+item.group.width))-Math.min(...placed.map(item=>item.x));
    const height=Math.max(...placed.map(item=>item.y+item.group.height))-Math.min(...placed.map(item=>item.y));
    return width*height+.2*width*width+.5*height*height;
  };
  for(let pass=0;pass<3;pass++){
    let moved=false;
    for(const item of placed){
      const origin={x:item.x,y:item.y},candidates=[{x:-item.group.width/2,y:-item.group.height/2}];
      for(const other of placed){
        if(other===item)continue;
        for(const y of [other.y,other.y+(other.group.height-item.group.height)/2,other.y+other.group.height-item.group.height]){
          candidates.push({x:other.x-item.group.width-gap,y},{x:other.x+other.group.width+gap,y});
        }
        for(const x of [other.x,other.x+(other.group.width-item.group.width)/2,other.x+other.group.width-item.group.width]){
          candidates.push({x,y:other.y-item.group.height-gap},{x,y:other.y+other.group.height+gap});
        }
      }
      let best=compactness(),chosen=origin;
      for(const point of candidates){
        item.x=point.x;item.y=point.y;
        if(placed.some(other=>other!==item&&overlaps(item,other)))continue;
        const score=compactness();
        if(score+.01<best){best=score;chosen=point;}
      }
      item.x=chosen.x;item.y=chosen.y;
      if(item.x!==origin.x||item.y!==origin.y)moved=true;
    }
    if(!moved)break;
  }
  const left = Math.min(...placed.map(item => item.x)), top = Math.min(...placed.map(item => item.y));
  const right = Math.max(...placed.map(item => item.x + item.group.width)), bottom = Math.max(...placed.map(item => item.y + item.group.height));
  const width = Math.max(minimumWidth, right - left + 100), height = Math.max(minimumHeight, bottom - top + 100);
  for (const item of placed) positions[item.group.id] = { x: item.x + (width - right - left) / 2, y: item.y + (height - bottom - top) / 2 };
  return { positions, width, height };
}
