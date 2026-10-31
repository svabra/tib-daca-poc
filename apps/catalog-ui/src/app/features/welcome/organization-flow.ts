/** One point per distinct consumed product; adjacent phases form a visible packet train. */
export function organizationFlow(count: number, pathLength = Infinity) {
  const density = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const duration = 3;
  // Leave room for the head, halo and fading tail, including on short highways.
  const phase = Number.isFinite(pathLength) && pathLength > 0 ? Math.max(.18, Math.min(.45, 32 / pathLength)) : .18;
  const spacing = Math.min(duration * phase, duration / Math.max(1, density));
  return {
    duration: `${duration}s`,
    particles: Array.from({length: density}, (_, index) => ({
      id: index, delay: `${-spacing * index}s`, pulseDelay: `${-index * .23}s`, rest: (index + 1) / (density + 1),
    })),
  };
}
