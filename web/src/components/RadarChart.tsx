import { useMeasuredWidth } from "../hooks/useMeasuredWidth.js";

export type RadarAxis = { label: string; value: number };

// real px, not viewBox-scaled, same deal as useMeasuredWidth -- otherwise label text shrinks below legible. narrow screens get a smaller pair below
const PAD_X = 120;
const PAD_Y = 46;

export function RadarChart({
  axes,
  size = 220,
}: {
  axes: RadarAxis[];
  size?: number;
}) {
  const n = axes.length;
  const [wrapRef, W] = useMeasuredWidth(size + PAD_X * 2);
  // below a certain width the full-size label margin leaves barely any circle -- shrink margin+text together to keep the plot legible
  const narrow = W < 380;
  const padX = narrow ? 68 : PAD_X;
  const padY = narrow ? 32 : PAD_Y;
  const labelFontSize = narrow ? 13 : 18;
  const plotSize = Math.max(60, W - padX * 2);
  const H = plotSize + padY * 2;
  const cx = W / 2;
  const cy = H / 2;
  const r = plotSize / 2;
  const max = Math.max(1, ...axes.map((a) => a.value));

  const angleFor = (i: number) => -Math.PI / 2 + (i / n) * Math.PI * 2; // 12 o'clock, clockwise
  const pointAt = (i: number, frac: number) => {
    const a = angleFor(i);
    return { x: cx + Math.cos(a) * r * frac, y: cy + Math.sin(a) * r * frac };
  };

  const rings = [0.25, 0.5, 0.75, 1];
  const ringPath = (frac: number) =>
    Array.from({ length: n }, (_, i) => pointAt(i, frac))
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
      .join(" ") + " Z";

  const fracFor = (v: number) => (v <= 0 || n === 0 ? 0 : Math.max(0.08, v / max)); // floor so a lopsided axis doesn't squash the rest to invisible
  const dataPoints = axes.map((a, i) => pointAt(i, fracFor(a.value)));
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";

  const hasData = axes.some((a) => a.value > 0);

  return (
    <div ref={wrapRef} className="radar-wrap">
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
          const p = pointAt(i, 1);
          const angle = angleFor(i);
          const lx = p.x + Math.cos(angle) * (padX * 0.2);
          const ly = p.y + Math.sin(angle) * (padY * 0.55) + 4;
          const anchor = Math.abs(Math.cos(angle)) < 0.2 ? "middle" : Math.cos(angle) > 0 ? "start" : "end";
          return (
            <text
              key={a.label}
              x={lx}
              y={ly}
              textAnchor={anchor}
              className="radar-label"
              style={{ fontSize: labelFontSize }}
            >
              {a.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
