// A small hand-drawn radar/spider chart -- same "no charting library"
// approach as Chart.tsx and Donut.tsx. One filled polygon over a few
// concentric rings; axes start at 12 o'clock and go clockwise.

export type RadarAxis = { label: string; value: number };

// Label margins are their own dimension, not a slice of the plot radius --
// axis labels are wide (text) but only need a little vertical room, so the
// viewBox gets extra width/height on top of the circle itself. Sizing this
// off the plot radius (rather than a flat px value) is what previously let
// the left/right labels ("Search", "Referral") run past the edge and get
// clipped at small card sizes.
const PAD_X = 70;
const PAD_Y = 28;

export function RadarChart({
  axes,
  size = 220,
}: {
  axes: RadarAxis[];
  size?: number;
}) {
  const n = axes.length;
  const W = size + PAD_X * 2;
  const H = size + PAD_Y * 2;
  const cx = W / 2;
  const cy = H / 2;
  const r = size / 2;
  const max = Math.max(1, ...axes.map((a) => a.value));

  // 12 o'clock, clockwise
  const angleFor = (i: number) => -Math.PI / 2 + (i / n) * Math.PI * 2;
  const pointAt = (i: number, frac: number) => {
    const a = angleFor(i);
    return { x: cx + Math.cos(a) * r * frac, y: cy + Math.sin(a) * r * frac };
  };

  const rings = [0.25, 0.5, 0.75, 1];
  const ringPath = (frac: number) =>
    Array.from({ length: n }, (_, i) => pointAt(i, frac))
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
      .join(" ") + " Z";

  const dataPoints = axes.map((a, i) => pointAt(i, n === 0 ? 0 : a.value / max));
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";

  const hasData = axes.some((a) => a.value > 0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="radar-svg" role="img" aria-label="Radar chart">
      {rings.map((frac) => (
        <path key={frac} d={ringPath(frac)} className="radar-ring" />
      ))}
      {axes.map((_, i) => {
        const p = pointAt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} className="radar-axis-line" />;
      })}

      {hasData && <path d={dataPath} className="radar-area" />}
      {hasData &&
        dataPoints.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3} className="radar-dot" />)}

      {axes.map((a, i) => {
        // labels sit just past the ring, in whichever margin (PAD_X or
        // PAD_Y) is relevant for their position -- an axis pointing mostly
        // sideways gets an x-only nudge, one pointing up/down a y-only nudge
        const p = pointAt(i, 1);
        const angle = angleFor(i);
        const lx = p.x + Math.cos(angle) * (PAD_X * 0.2);
        const ly = p.y + Math.sin(angle) * (PAD_Y * 0.55) + 4;
        const anchor = Math.abs(Math.cos(angle)) < 0.2 ? "middle" : Math.cos(angle) > 0 ? "start" : "end";
        return (
          <text key={a.label} x={lx} y={ly} textAnchor={anchor} className="radar-label">
            {a.label}
          </text>
        );
      })}
    </svg>
  );
}
