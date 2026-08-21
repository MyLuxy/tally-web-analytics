// A small hand-drawn radar/spider chart -- same "no charting library"
// approach as Chart.tsx and Donut.tsx. One filled polygon over a few
// concentric rings; axes start at 12 o'clock and go clockwise.

export type RadarAxis = { label: string; value: number };

export function RadarChart({
  axes,
  size = 220,
}: {
  axes: RadarAxis[];
  size?: number;
}) {
  const n = axes.length;
  const cx = size / 2;
  const cy = size / 2;
  const labelPad = 30;
  const r = size / 2 - labelPad;
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
    <svg viewBox={`0 0 ${size} ${size}`} className="radar-svg" role="img" aria-label="Radar chart">
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
        const p = pointAt(i, 1.18);
        const anchor = Math.abs(p.x - cx) < 4 ? "middle" : p.x > cx ? "start" : "end";
        return (
          <text key={a.label} x={p.x} y={p.y + 4} textAnchor={anchor} className="radar-label">
            {a.label}
          </text>
        );
      })}
    </svg>
  );
}
