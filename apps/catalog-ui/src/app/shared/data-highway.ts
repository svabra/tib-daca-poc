/** Cover the complete 28-unit trail and halo before a packet loops. */
export const DATA_HIGHWAY_PACKET_OVERLAP = 36;

export function highwayPacketHalfSize(width:number,height:number) {
  return {halfWidth:Math.max(1,width/2-DATA_HIGHWAY_PACKET_OVERLAP),halfHeight:Math.max(1,height/2-DATA_HIGHWAY_PACKET_OVERLAP)};
}

/** Dagre ports lie on the card perimeter; continue their ray beneath the card. */
export function highwayPacketEndpoint(port:{x:number;y:number},center:{x:number;y:number}) {
  const dx=center.x-port.x,dy=center.y-port.y,distance=Math.hypot(dx,dy);
  const fraction=distance?Math.min(1,DATA_HIGHWAY_PACKET_OVERLAP/distance):0;
  return {x:port.x+dx*fraction,y:port.y+dy*fraction};
}
