/** Explanatory messages only: no API calls, policy writes or data grants. */
export const ACCESS_REQUEST_DURATION = 24;
export const ACCESS_REQUEST_STATIONS = [0, 7, 15] as const;
type Actor = 'analyst' | 'catalog' | 'owner' | 'sdal' | 'source';
type Point = readonly [number, number];
const route = (id: string, from: Actor, to: Actor, points: readonly [Point, Point, Point, Point]) => ({
  id, from, to, points, path: `M${points[0].join(' ')}C${points.slice(1).map(point => point.join(' ')).join(' ')}`,
});
export const ACCESS_REQUEST_ROUTES = [
  route('application', 'analyst', 'catalog', [[925, 350], [850, 350], [840, 230], [745, 230]]),
  route('prose', 'catalog', 'analyst', [[700, 290], [700, 355], [870, 410], [925, 410]]),
  route('review', 'catalog', 'owner', [[745, 100], [790, 100], [830, 100], [875, 100]]),
  route('approval', 'owner', 'catalog', [[875, 165], [830, 165], [790, 165], [745, 165]]),
  route('policy', 'catalog', 'sdal', [[455, 200], [390, 200], [390, 300], [320, 300]]),
  route('introspection', 'analyst', 'sdal', [[925, 465], [760, 465], [500, 345], [320, 345]]),
  route('source-query', 'sdal', 'source', [[140, 420], [140, 445], [140, 475], [140, 500]]),
  route('source-metadata', 'source', 'sdal', [[220, 500], [220, 475], [220, 445], [220, 420]]),
  route('metadata', 'sdal', 'analyst', [[320, 390], [510, 545], [750, 545], [925, 520]]),
] as const;
export const ACCESS_REQUEST_MESSAGES = [
  { id: 'search', route: 'application', start: .6, end: 2, icon: 'search' },
  { id: 'prose', route: 'prose', start: 4.6, end: 6.5, icon: 'document' },
  { id: 'introspection-application', route: 'application', start: 7.2, end: 8.2, icon: 'identity' },
  { id: 'introspection-review', route: 'review', start: 8.2, end: 9.5, icon: 'identity' },
  { id: 'approval', route: 'approval', start: 10.5, end: 11.2, icon: 'permission' },
  { id: 'policy', route: 'policy', start: 11.2, end: 11.8, icon: 'shield-check' },
  { id: 'introspection-query', route: 'introspection', start: 11.8, end: 12.5, icon: 'search' },
  { id: 'source-query', route: 'source-query', start: 12.5, end: 12.9, icon: 'search' },
  { id: 'source-metadata', route: 'source-metadata', start: 12.9, end: 13.4, icon: 'table' },
  { id: 'metadata', route: 'metadata', start: 13.4, end: 14.6, icon: 'table' },
  { id: 'payload-application', route: 'application', start: 18, end: 20, icon: 'identity' },
  { id: 'payload-review', route: 'review', start: 20.3, end: 22, icon: 'identity' },
] as const;
export type AccessRequestMessageId = typeof ACCESS_REQUEST_MESSAGES[number]['id'];
const progress = (time: number, start: number, end: number) => Math.max(0, Math.min(1, (time - start) / (end - start)));
function messageAt(time: number) {
  const event = ACCESS_REQUEST_MESSAGES.find(message => time >= message.start && time < message.end);
  if (!event) return null;
  const route = ACCESS_REQUEST_ROUTES.find(route => route.id === event.route)!;
  const t = progress(time, event.start, event.end), u = 1 - t;
  const [a, b, c, d] = route.points;
  return { ...event, from: route.from, to: route.to,
    x: u ** 3 * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t ** 3 * d[0],
    y: u ** 3 * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t ** 3 * d[1] };
}
export function sampleAccessRequest(seconds: number) {
  const time = Number.isFinite(seconds) ? Math.max(0, Math.min(ACCESS_REQUEST_DURATION, seconds)) : 0;
  const station = time < 7 ? 0 : time < 15 ? 1 : 2;
  const message = messageAt(time);
  const activeActors: readonly Actor[] = message ? [message.from, message.to]
    : time >= 22 || time >= 9.5 && time < 10.5 ? ['owner']
      : station === 0 ? ['analyst', 'catalog'] : ['analyst'];
  return {
    time, station, message, activeActors,
    search: progress(time, 2, 4), found: time >= 4,
    proseTransfer: progress(time, 4.6, 6.5),
    introspectionRequest: progress(time, 7.2, 9.5),
    introspectionApproved: time >= 10.5,
    policyStored: time >= 11.2, policyActive: time >= 11.8,
    metadataTransfer: progress(time, 13.4, 14.6), metadataVisible: time >= 14.6,
    form: progress(time, 15.5, 18), submission: progress(time, 18, 20),
    payloadSubmitted: time >= 20, payloadAtOwner: time >= 22,
    // Introspection permission is deliberately not a payload permission.
    payloadAuthorized: false,
  } as const;
}
