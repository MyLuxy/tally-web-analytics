// A small hand-drawn bar chart -- same approach as the rest (Chart.tsx,
// Donut.tsx, RadarChart.tsx): plain SVG, no library.
import { useMeasuredWidth } from "../hooks/useMeasuredWidth.js";

export type Bar = { label: string; value: number };

const H = 240;
const PAD = { top: 30, bottom: 26, left: 34, right: 10 };

const fmt = (n: number) => n.toLocaleString("en-US");

// Each bar gets its own colour, cycling through the palette -- with several
// different event names on screen at once, one flat colour made them
// impossible to tell apart at a glance. Muted on purpose (blended toward
// --ink-faint) rather than the full-strength accents used elsewhere, and
// amber's dropped entirely -- a "sandy yellow" bar didn't fit next to the
// others. Server caps custom events at 10 (see stats.ts), so with more than
// 4 distinct events the colours start repeating.
const PALETTE = [
  "color-mix(in srgb, var(--accent) 70%, var(--ink-faint))",
  "color-mix(in srgb, var(--accent-2) 70%, var(--ink-faint))",
  "color-mix(in srgb, var(--accent-3) 70%, var(--ink-faint))",
  "color-mix(in srgb, var(--accent-5) 70%, var(--ink-faint))",
];

export function BarChart({ bars }: { bars: Bar[] }) {
  // W is the sheet's actual measured width, not a fixed "design" width --
  // see useMeasuredWidth for why that's what keeps the bar labels/values
  // legible on any screen instead of shrinking along with a narrow sheet.
  const [wrapRef, W] = useMeasuredWidth(400);
  const max = Math.max(1, ...bars.map((b) => b.value));
  const n = Math.max(1, bars.length);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / n;
  const barW = Math.min(36, slot * 0.55);
  const yFor = (v: number) => PAD.top + (1 - v / max) * plotH;

  // two guides (half and full) -- same lightweight treatment as the
  // Sparkline's, just enough to read the scale without a denser grid
  const guides = [...new Set([0.5, 1].map((f) => Math.round(max * f)))];

  return (
    <div ref={wrapRef} className="bar-chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="bar-svg" role="img" aria-label="Bar chart">
        {guides.map((g) => (
          <g key={g}>
            <line className="sparkline-grid" x1={PAD.left} x2={W - PAD.right} y1={yFor(g)} y2={yFor(g)} />
            <text className="sparkline-axis" x={PAD.left - 6} y={yFor(g) + 3} textAnchor="end">
              {fmt(g)}
            </text>
          </g>
        ))}

        {bars.map((b, i) => {
          const h = (b.value / max) * plotH;
          const cx = PAD.left + slot * i + slot / 2;
          const y = PAD.top + (plotH - h);
          return (
            <g key={b.label}>
              <text x={cx} y={y - 8} textAnchor="middle" className="bar-value num">
                {fmt(b.value)}
              </text>
              <rect
                x={cx - barW / 2}
                y={y}
                width={barW}
                height={Math.max(h, 2)}
                rx={5}
                className="bar-rect"
                fill={PALETTE[i % PALETTE.length]}
              />
              <text x={cx} y={H - 8} textAnchor="middle" className="bar-label">
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
