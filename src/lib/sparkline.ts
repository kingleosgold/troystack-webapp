/**
 * The line and fill for a small price chart, `w` wide and `h` tall. When the
 * time each price was taken comes with it, one for one, each price sits at
 * its time, so a stretch with prices missing stays as long as it was. A price
 * that isn't real is left out together with its time.
 */
export function sparklineShape(values: number[], times: number[] | undefined, w: number, h: number): { line: string; area: string } | null {
  const timed = Boolean(times) && times!.length === values.length;
  const pts: Array<{ t: number; v: number }> = [];
  values.forEach((v, i) => {
    const t = timed ? times![i] : i;
    if (Number.isFinite(v) && v > 0 && Number.isFinite(t)) pts.push({ t, v });
  });
  if (pts.length < 2) return null;
  const vs = pts.map((p) => p.v);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const span = max - min || max * 0.001 || 1;
  const start = pts[0].t;
  const length = pts[pts.length - 1].t - start || 1;
  const coords = pts.map((p) => [((p.t - start) / length) * w, h - 2 - ((p.v - min) / span) * (h - 4)] as const);
  const line = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  return { line, area: `${line} L${w} ${h} L0 ${h} Z` };
}
