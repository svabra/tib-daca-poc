/** Explanatory requests only: no API calls, policy writes or data grants. */
export const ACCESS_REQUEST_DURATION = 24;
export const ACCESS_REQUEST_STATIONS = [0, 7, 15] as const;
const progress = (time: number, start: number, end: number) => Math.max(0, Math.min(1, (time - start) / (end - start)));
export function sampleAccessRequest(seconds: number) {
  const time = Number.isFinite(seconds) ? Math.max(0, Math.min(ACCESS_REQUEST_DURATION, seconds)) : 0;
  const station = time < 7 ? 0 : time < 15 ? 1 : 2;
  return {
    time, station,
    search: progress(time, 0, 4), found: time >= 4,
    proseTransfer: progress(time, 5, 6.6),
    introspectionRequest: progress(time, 7.5, 9.5),
    introspectionApproved: time >= 10.5,
    metadataTransfer: progress(time, 11, 13), metadataVisible: time >= 13,
    form: progress(time, 15.5, 18), submission: progress(time, 18, 20),
    payloadSubmitted: time >= 20,
    // Introspection permission is deliberately not a payload permission.
    payloadAuthorized: false,
  } as const;
}
