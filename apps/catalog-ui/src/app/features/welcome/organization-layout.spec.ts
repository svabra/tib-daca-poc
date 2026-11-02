import { ORGANIZATION_CARD, ORGANIZATION_FIELD, ORGANIZATION_OVERVIEW_FIELD, clearsOrganizationBoundary, constrainOrganizationSatellite, clearsOrganizationHeading, organizationSatellite, scatterOrganizations, groupOrganizationDomains } from './organization-layout';

describe('free organization layout', () => {
  it('keeps external card edges outside every side and corner, with room for drift', () => {
    const positions=[{x:240,y:320},{x:720,y:320},{x:480,y:120},{x:480,y:530},{x:180,y:104},{x:780,y:558},{x:480,y:330},{x:-500,y:1000}];
    for(const point of positions){
      const result=constrainOrganizationSatellite(point,ORGANIZATION_CARD.width,ORGANIZATION_CARD.height);
      expect(clearsOrganizationBoundary({...result,...ORGANIZATION_CARD})).toBe(true);
      expect(result.x).toBeGreaterThanOrEqual(68);expect(result.x).toBeLessThanOrEqual(892);
      expect(result.y).toBeGreaterThanOrEqual(50);expect(result.y).toBeLessThanOrEqual(600);
    }
    expect(constrainOrganizationSatellite({x:240,y:320},120,84)).toEqual({x:112,y:320});
    expect(constrainOrganizationSatellite({x:720,y:320},120,84)).toEqual({x:848,y:320});
    expect(constrainOrganizationSatellite({x:480,y:120},120,84)).toEqual({x:480,y:54});
    // The bottom strip is too short for the reserved footprint plus drift clearance.
    expect(constrainOrganizationSatellite({x:480,y:530},120,84)).toEqual({x:112,y:530});
    expect(clearsOrganizationBoundary({x:150,y:320,...ORGANIZATION_CARD})).toBe(false);
    expect(constrainOrganizationSatellite({x:80,y:300},120,84)).toEqual({x:80,y:300});
  });
  it('uses both title-side wings and keeps every automatic card outside the heading', () => {
    const domains=new Set(Array.from({length:8},(_,i)=>`domain:${i}`));
    const positions=scatterOrganizations([...Array.from({length:11},(_,i)=>`office-${i}`),...domains],domains);
    const heading=ORGANIZATION_FIELD.exclusions[0];
    expect(positions.some(item=>item.y<heading.y+heading.height&&item.x<heading.x)).toBe(true);
    expect(positions.some(item=>item.y<heading.y+heading.height&&item.x>heading.x+heading.width)).toBe(true);
    expect(positions.every(item=>clearsOrganizationHeading(item,ORGANIZATION_FIELD))).toBe(true);
  });
  it('groups domains by assigned office while preserving saved anchors and floating clearance', () => {
    const offices=['bit','estv',...Array.from({length:9},(_,i)=>`other-${i}`)],domains=['rohs-a','rohs-b','vat','tax','analytics'].map(id=>`domain:${id}`);
    const assignments=new Map([['domain:rohs-a',['bit']],['domain:rohs-b',['bit']],['domain:vat',['estv']],['domain:tax',['estv']],['domain:analytics',['estv']]]);
    const initial=scatterOrganizations([...offices,...domains],new Set(domains));
    const field={...ORGANIZATION_FIELD,height:Math.max(ORGANIZATION_FIELD.height,...initial.map(item=>item.y+item.height/2+8))};
    const energy=(positions:typeof initial)=>[...assignments].reduce((sum,[domain,owners])=>{
      const a=positions.find(item=>item.id===domain)!;
      return sum+owners.reduce((value,owner)=>{const b=positions.find(item=>item.id===owner)!;return value+(a.x-b.x)**2+(a.y-b.y)**2;},0);
    },0);
    const grouped=groupOrganizationDomains(initial,assignments,field);
    expect(grouped).toEqual(groupOrganizationDomains(initial,assignments,field));
    expect(energy(grouped)).toBeLessThan(energy(initial)*.8);
    expect(initial).toEqual(scatterOrganizations([...offices,...domains],new Set(domains)));
    for(const [index,item] of grouped.entries())for(const other of grouped.slice(index+1))expect(Math.abs(item.x-other.x)>=(item.width+other.width)/2+12||Math.abs(item.y-other.y)>=(item.height+other.height)/2+12).toBe(true);
    const fixed=new Set(offices),anchored=groupOrganizationDomains(initial,assignments,field,fixed);
    expect(anchored.filter(item=>fixed.has(item.id))).toEqual(initial.filter(item=>fixed.has(item.id)));
    expect(energy(anchored)).toBeLessThan(energy(initial));
  });
  it('clears a domain when its saved office is moved onto its previous position', () => {
    const placement=(id:string,x:number,y:number,width:number,height:number)=>({id,x,y,width,height,delay:'0s',duration:'18s'});
    const office=placement('bit',280,150,80,40),domain=placement('domain:rohs',280,150,66,66);
    const grouped=groupOrganizationDomains([office,domain],new Map([['domain:rohs',['bit']]]),ORGANIZATION_FIELD,new Set(['bit']));
    expect(grouped[0]).toEqual(office);
    expect(Math.abs(grouped[1].x-office.x)>=(office.width+domain.width)/2+14||Math.abs(grouped[1].y-office.y)>=(office.height+domain.height)/2+14).toBe(true);
  });
  it('spreads the overview across the full canvas with room for floating cards and optional domains', () => {
    const ids = Array.from({ length: 16 }, (_, i) => `root-${i}`), circles = new Set(['domain:tax','domain:finance']);
    const placements = scatterOrganizations([...ids, ...circles], circles, ORGANIZATION_OVERVIEW_FIELD);
    expect(placements).toHaveLength(18);
    expect(Math.max(...placements.map(position => position.x))).toBeGreaterThan(ORGANIZATION_FIELD.width);
    for (const [index, position] of placements.entries()) {
      expect(position.x - position.width / 2).toBeGreaterThanOrEqual(6);
      expect(position.x + position.width / 2).toBeLessThanOrEqual(ORGANIZATION_OVERVIEW_FIELD.width - 6);
      expect(position.y - position.height / 2).toBeGreaterThanOrEqual(6);
      expect(position.y + position.height / 2).toBeLessThanOrEqual(ORGANIZATION_OVERVIEW_FIELD.height - 6);
      for (const other of placements.slice(index + 1)) {
        expect(Math.abs(position.x - other.x) >= (position.width + other.width) / 2 + 12 || Math.abs(position.y - other.y) >= (position.height + other.height) / 2 + 12).toBe(true);
      }
    }
  });
  it('keeps stable, irregular anchors and clearance for independent floating', () => {
    for (const count of [1, 6, 11, 16, 20]) {
      const ids = Array.from({ length: count }, (_, index) => `office-${index}`);
      const positions = scatterOrganizations(ids);
      const contentHeight=Math.max(ORGANIZATION_FIELD.height,...positions.map(item=>item.y+item.height/2+8));
      if(count<=6)expect(contentHeight).toBe(ORGANIZATION_FIELD.height);
      expect(contentHeight).toBeLessThanOrEqual(ORGANIZATION_FIELD.height+Math.ceil(count/3)*160);
      expect(positions).toEqual(scatterOrganizations(ids));
      expect(positions.map(position => position.id)).toEqual(ids);
      expect(new Set(positions.map(position => position.y)).size).toBe(count);
      for (const [index, position] of positions.entries()) {
        expect(position.x - position.width / 2).toBeGreaterThanOrEqual(6);
        expect(position.x + position.width / 2).toBeLessThanOrEqual(ORGANIZATION_FIELD.width - 6);
        expect(position.y - position.height / 2).toBeGreaterThanOrEqual(6);
        expect(position.width).toBeGreaterThanOrEqual(120);expect(position.height).toBeGreaterThanOrEqual(84);
        expect(position.y + position.height / 2).toBeLessThanOrEqual(contentHeight - 6);
        for (const other of positions.slice(index + 1)) {
          expect(Math.abs(position.x - other.x) >= (position.width + other.width) / 2 + 12 || Math.abs(position.y - other.y) >= (position.height + other.height) / 2 + 12).toBe(true);
        }
      }
    }
  });
  it('keeps the satellite rectangles outside the containing department and inside the canvas', () => {
    for (let index = 0; index < 14; index++) {
      const position = organizationSatellite(index, 14, `satellite-${index}`);
      expect(position.x).toBeGreaterThanOrEqual(80); expect(position.x).toBeLessThanOrEqual(880);
      expect(position.y).toBeGreaterThanOrEqual(48); expect(position.y).toBeLessThanOrEqual(602);
      expect(position.x + 62 < 180 || position.x - 62 > 780 || position.y + 32 < 104 || position.y - 32 > 558).toBe(true);
    }
  });
  it('packs round domains and rectangular offices together without overlap', () => {
    const circles = new Set(['domain:tax', 'domain:finance']);
    const positions = scatterOrganizations([...Array.from({ length: 11 }, (_, i) => `office-${i}`), ...circles], circles);
    expect(positions).toHaveLength(13);
    for (const [index, position] of positions.entries()) {
      if (circles.has(position.id)) expect(position.width).toBe(position.height);
      for (const other of positions.slice(index + 1)) {
        expect(Math.abs(position.x - other.x) >= (position.width + other.width) / 2 + 12 || Math.abs(position.y - other.y) >= (position.height + other.height) / 2 + 12).toBe(true);
      }
    }
  });
});
