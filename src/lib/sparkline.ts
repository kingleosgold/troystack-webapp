/**
 * Longer than a quiet stretch of the session. The sparkline feed skips the
 * weekend close (Friday 5pm ET through Sunday 6pm ET), so the next print is
 * many hours later. A line drawn across that jump reads as a flat stretch
 * while the market was shut. Break the stroke there instead.
 */
export const SPARKLINE_GAP_MS = 6 * 60 * 60 * 1000;

/**
 * The line and fill for a small price chart, `w` wide and `h` tall. When the
 * time each price was taken comes with it, one for one, each price sits at
 * its time, so a stretch with prices missing stays as long as it was. A price
 * that isn't real is left out together with its time. A jump longer than
 * {@link SPARKLINE_GAP_MS} starts a new stroke, so a closed market is a gap.
 */
export function sparklineShape(values: number[], times: number[] | undefined, w: number, h: number): { line: string; area: string } | null {
  const timed = Boolean(times) && times!.length === values.length;
  const pts: Array<{ t: number; v: number }> = [];
  values.forEach((v, i) => {
    const t = timed ? times![i] : i;
    if (Number.isFinite(v) && v > 0 && Number.isFinite(t)) pts.push({ t, v });
  });
  if (pts.length < 2) return null;

  const runs: Array<Array<{ t: number; v: number }>> = [];
  for (const p of pts) {
    const run = runs[runs.length - 1];
    const prev = run?.[run.length - 1];
    if (run && prev && timed && p.t - prev.t > SPARKLINE_GAP_MS) runs.push([p]);
    else if (run) run.push(p);
    else runs.push([p]);
  }
  const drawable = runs.filter((run) => run.length >= 2);
  if (drawable.length === 0) return null;

  const vs = pts.map((p) => p.v);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const span = max - min || max * 0.001 || 1;
  const start = pts[0].t;
  const length = pts[pts.length - 1].t - start || 1;
  const xy = (p: { t: number; v: number }) =>
    [((p.t - start) / length) * w, h - 2 - ((p.v - min) / span) * (h - 4)] as const;

  const lines: string[] = [];
  const areas: string[] = [];
  for (const run of drawable) {
    const coords = run.map(xy);
    const line = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
    const [x0] = coords[0];
    const [x1] = coords[coords.length - 1];
    lines.push(line);
    areas.push(`${line} L${x1.toFixed(2)} ${h} L${x0.toFixed(2)} ${h} Z`);
  }
  return { line: lines.join(' '), area: areas.join(' ') };
}
