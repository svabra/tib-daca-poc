/** Stable, irregular anchors with enough clearance for calm independent drift. */
export interface OrganizationExclusion { x:number; y:number; width:number; height:number }
export interface OrganizationField { width:number; height:number; exclusions?:readonly OrganizationExclusion[] }
export const ORGANIZATION_TITLE = { x:346, y:112, width:268, height:96 };
export const ORGANIZATION_ANCHOR_Y_OFFSET = 120;
export const ORGANIZATION_CARD = { width: 120, height: 84 };
export const ORGANIZATION_FIELD = { x: 202, y: 120, width: 556, height: 420, exclusions:[{...ORGANIZATION_TITLE,x:144,y:-8}] };
export const ORGANIZATION_OVERVIEW_FIELD = { x: 34, y: 30, width: 892, height: 590 };

/** Keep the original persisted anchor origin; reserve only the rendered heading block. */
export function organizationFieldForHeading(heading: OrganizationExclusion) {
  return {...ORGANIZATION_FIELD,exclusions:[{...heading,x:heading.x-ORGANIZATION_FIELD.x,y:heading.y-ORGANIZATION_FIELD.y}]};
}

export interface OrganizationPlacement { id: string; x: number; y: number; width: number; height: number; delay: string; duration: string }

export function clearsOrganizationHeading(item: {x:number;y:number;width:number;height:number}, field:OrganizationField): boolean {
  return !field.exclusions?.some(rect=>item.x+item.width/2+14>rect.x && item.x-item.width/2-14<rect.x+rect.width && item.y+item.height/2+14>rect.y && item.y-item.height/2-14<rect.y+rect.height);
}

/** Shorten trusted assignment edges without changing shapes, saved anchors or drift clearance. */
export function groupOrganizationDomains(placements: readonly OrganizationPlacement[], assignments: ReadonlyMap<string, readonly string[]>, field: OrganizationField, fixed: ReadonlySet<string> = new Set()): OrganizationPlacement[] {
  const result = placements.map(item => ({ ...item }));
  const byId = new Map(result.map(item => [item.id, item]));
  const edges = [...assignments].flatMap(([domain, organizations]) => organizations.flatMap(organization => {
    const a = byId.get(domain), b = byId.get(organization);
    return a && b ? [[a, b] as const] : [];
  }));
  if (!edges.length) return result;
  const energy = () => edges.reduce((sum, [a, b]) => sum + (a.x - b.x) ** 2 + (a.y - b.y) ** 2, 0);
  const fits = (item: OrganizationPlacement) => clearsOrganizationHeading(item,field) && item.x - item.width / 2 >= 8 && item.x + item.width / 2 <= field.width - 8 && item.y - item.height / 2 >= 8 && item.y + item.height / 2 <= field.height - 8 && !result.some(other => other !== item && Math.abs(item.x - other.x) < (item.width + other.width) / 2 + 14 && Math.abs(item.y - other.y) < (item.height + other.height) / 2 + 14);
  let best = energy();
  for (let pass = 0; pass < 6; pass++) {
    let improved = false;
    // Exchange equally sized slots first; unassigned offices can make room for linked clusters.
    for (let i = 0; i < result.length; i++) for (let j = i + 1; j < result.length; j++) {
      const a = result[i], b = result[j];
      if (fixed.has(a.id) || fixed.has(b.id) || a.width !== b.width || a.height !== b.height || a.id.startsWith('domain:') !== b.id.startsWith('domain:')) continue;
      [a.x, b.x] = [b.x, a.x]; [a.y, b.y] = [b.y, a.y];
      const candidate = energy();
      if (candidate + .01 < best && fits(a) && fits(b)) { best = candidate; improved = true; }
      else { [a.x, b.x] = [b.x, a.x]; [a.y, b.y] = [b.y, a.y]; }
    }
    // Pull each domain toward its assigned office(s), choosing free space around them.
    for (const [id, organizations] of assignments) {
      const item = byId.get(id), targets = organizations.map(id => byId.get(id)).filter((item): item is OrganizationPlacement => !!item);
      if (!item || fixed.has(id) || !targets.length) continue;
      let chosen = { x: item.x, y: item.y };
      // A manually moved office may occupy the domain's former position. Clear
      // that collision even when doing so initially lengthens the assignment.
      let needsClearance = !fits(item);
      const center = { x: targets.reduce((sum, item) => sum + item.x, 0) / targets.length, y: targets.reduce((sum, item) => sum + item.y, 0) / targets.length };
      for (const target of [center, ...targets]) for (const radius of [70, 95, 125]) for (let angle = 0; angle < 16; angle++) {
        item.x = target.x + Math.cos(angle * Math.PI / 8) * radius;
        item.y = target.y + Math.sin(angle * Math.PI / 8) * radius;
        if (!fits(item)) continue;
        const candidate = energy();
        if (needsClearance || candidate + .01 < best) { best = candidate; chosen = { x: item.x, y: item.y }; improved = true; needsClearance = false; }
      }
      Object.assign(item, chosen);
    }
    if (!improved) break;
  }
  return result;
}

function hash(value: string): number {
  let result = 2166136261;
  for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return result >>> 0;
}

function random(seed: number): () => number {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

/** Use obstacle/card boundaries when random sampling cannot fit readable cards. */
function packReadableCards(ids:readonly string[],circles:ReadonlySet<string>,field:OrganizationField):OrganizationPlacement[]|null {
  const placements:OrganizationPlacement[]=[];
  const gap=14.1;
  for(const id of [...ids].sort((a,b)=>Number(circles.has(a))-Number(circles.has(b)))){
    const width=circles.has(id)?84:ORGANIZATION_CARD.width,height=circles.has(id)?84:ORGANIZATION_CARD.height;
    const xs=new Set([width/2+8,field.width-width/2-8]),ys=new Set([height/2+8,field.height-height/2-8]);
    for(const rect of field.exclusions??[]){xs.add(rect.x-width/2-14);xs.add(rect.x+rect.width+width/2+14);ys.add(rect.y+rect.height+height/2+14);}
    for(const other of placements){xs.add(other.x+(other.width+width)/2+gap);xs.add(other.x-(other.width+width)/2-gap);ys.add(other.y+(other.height+height)/2+gap);}
    const fits=(point:{x:number;y:number})=>point.x-width/2>=8&&point.x+width/2<=field.width-8&&point.y-height/2>=8&&point.y+height/2<=field.height-8&&clearsOrganizationHeading({...point,width,height},field)&&!placements.some(other=>Math.abs(other.x-point.x)<(other.width+width)/2+14&&Math.abs(other.y-point.y)<(other.height+height)/2+14);
    const candidates=[...xs].flatMap(x=>[...ys].map(y=>({x,y}))).filter(fits).sort((a,b)=>a.y-b.y||a.x-b.x);
    const point=candidates[0];if(!point)return null;
    const irregular={x:point.x,y:point.y+placements.length*.001};if(fits(irregular))Object.assign(point,irregular);
    const identity=hash(id);placements.push({id,...point,width,height,delay:`${-(identity%170)/10}s`,duration:`${14+identity%9}s`});
  }
  return ids.map(id=>placements.find(item=>item.id===id)!);
}

export function scatterOrganizations(ids: readonly string[], circles: ReadonlySet<string> = new Set(), field: OrganizationField = ORGANIZATION_FIELD): OrganizationPlacement[] {
  if (!ids.length) return [];
  const seed = hash(ids.join('|'));
  const scale = Math.min(1.35, field.width / ORGANIZATION_FIELD.width);
  for (let size = 0; size < 12; size++) {
    const width = Math.max(ORGANIZATION_CARD.width, 120 * scale - Math.max(0, ids.length - 10) * 2 - size * 6);
    const height = Math.max(ORGANIZATION_CARD.height, 84 * scale - size * 2);
    const gap = 14;
    for (let attempt = 0; attempt < 32; attempt++) {
      const next = random(seed + attempt * 1009 + size * 7879), placements: OrganizationPlacement[] = [];
      const ordered = [...ids].sort((a, b) => Number(circles.has(b)) - Number(circles.has(a)));
      for (const id of ordered) {
        const diameter = Math.max(52, 84 * scale - size * 3);
        const itemWidth = circles.has(id) ? diameter : width;
        const itemHeight = circles.has(id) ? diameter : height;
        let placed = false;
        for (let candidate = 0; candidate < 800; candidate++) {
          const x = itemWidth / 2 + 8 + next() * (field.width - itemWidth - 16);
          const y = itemHeight / 2 + 8 + next() * (field.height - itemHeight - 16);
          if (!clearsOrganizationHeading({x,y,width:itemWidth,height:itemHeight},field)) continue;
          if (placements.some(other => Math.abs(other.x - x) < (itemWidth + other.width) / 2 + gap && Math.abs(other.y - y) < (itemHeight + other.height) / 2 + gap)) continue;
          const identity = hash(id);
          placements.push({ id, x, y, width: itemWidth, height: itemHeight, delay: `${-(identity % 170) / 10}s`, duration: `${14 + identity % 9}s` });
          placed = true; break;
        }
        if (!placed) break;
      }
      if (placements.length === ids.length) return ids.map(id => placements.find(position => position.id === id)!);
    }
  }
  const packed=packReadableCards(ids,circles,field);if(packed)return packed;
  // Very large organizational units keep every card in a scrollable free-positioned field.
  const {width,height} = ORGANIZATION_CARD;
  const stepX=width+24,stepY=height+24;
  const columns = Math.max(1, Math.floor((field.width-16) / stepX));
  const startY=Math.max(0,...(field.exclusions??[]).map(rect=>rect.y+rect.height+14));
  const wings=field.exclusions?.length?ids.filter(id=>!circles.has(id)).slice(0,2):[];
  const remaining=ids.filter(id=>!wings.includes(id));
  return ids.map((id, index) => {
    const wing=wings.indexOf(id),slot=remaining.indexOf(id);
    return {id,x:wing>=0?(wing===0?width/2+8:field.width-width/2-8):width/2+8+slot%columns*stepX+hash(id)%9,
      y:wing>=0?height/2+8+wing*12:startY+width/2+8+Math.floor(slot/columns)*Math.max(stepY,width+32)+hash(id)%13+index/100,
      width,height:circles.has(id)?width:height,delay:`${-index}s`,duration:`${14+index%9}s`};
  });
}

export function organizationSatellite(index: number, count: number, id: string) {
  const horizontal = 800, vertical = 554, perimeter = 2 * (horizontal + vertical);
  let distance = (400 + index * perimeter / count + hash(id) % 5) % perimeter;
  let x: number, y: number;
  if (distance < horizontal) { x = 80 + distance; y = 48; }
  else if ((distance -= horizontal) < vertical) { x = 880; y = 48 + distance; }
  else if ((distance -= vertical) < horizontal) { x = 880 - distance; y = 602; }
  else { x = 80; y = 602 - (distance - horizontal); }
  return { x, y, delay: `${-(hash(id) % 170) / 10}s`, duration: `${15 + hash(id) % 8}s` };
}
