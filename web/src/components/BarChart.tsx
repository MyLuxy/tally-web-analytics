// A small hand-drawn bar chart -- same approach as the rest (Chart.tsx,
// Donut.tsx, RadarChart.tsx): plain SVG, no library, one accent colour.

export type Bar = { label: string; value: number };

const W = 400;
const H = 180;
const PAD = { top: 12, bottom: 24, x: 10 };

export function BarChart({ bars }: { bars: Bar[] }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  const n = Math.max(1, bars.length);
  const plotW = W - PAD.x * 2;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / n;
  const barW = Math.min(36, slot * 0.55);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="bar-svg" role="img" aria-label="Bar chart">
      {bars.map((b, i) => {
        const h = (b.value / max) * plotH;
        const cx = PAD.x + slot * i + slot / 2;
        const y = PAD.top + (plotH - h);
        return (
          <g key={b.label}>
            <rect x={cx - barW / 2} y={y} width={barW} height={Math.max(h, 2)} rx={5} className="bar-rect" />
            <text x={cx} y={H - 8} textAnchor="middle" className="bar-label">
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
