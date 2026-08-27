import { useMeasuredWidth } from "../hooks/useMeasuredWidth.js";

export type Bar = { label: string; value: number; color?: string };

const H = 240;
const PAD = { top: 30, bottom: 26, left: 34, right: 10 };

const fmt = (n: number) => n.toLocaleString("en-US");

// cycles per bar so different event names are actually distinguishable, muted so they don't clash. only 4 colors so past that they repeat (server caps at 10 events anyway)
const PALETTE = [
  "color-mix(in srgb, var(--accent) 70%, var(--ink-faint))",
  "color-mix(in srgb, var(--accent-2) 70%, var(--ink-faint))",
  "color-mix(in srgb, var(--accent-3) 70%, var(--ink-faint))",
  "color-mix(in srgb, var(--accent-5) 70%, var(--ink-faint))",
];

export function BarChart({ bars, onBarClick }: { bars: Bar[]; onBarClick?: (index: number, rect: DOMRect) => void }) {
  const [wrapRef, W] = useMeasuredWidth(400);
  const max = Math.max(1, ...bars.map((b) => b.value));
  const n = Math.max(1, bars.length);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / n;
  const barW = Math.min(36, slot * 0.55);
  const yFor = (v: number) => PAD.top + (1 - v / max) * plotH;

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
            <g
              key={b.label}
              className={onBarClick ? "bar-group bar-group-clickable" : "bar-group"}
              onClick={
                onBarClick
                  ? (e) => {
                      e.stopPropagation(); // often sits inside a whole-card click target (see StatList's ExportCsvButton)
                      // just the rect, not the whole group -- label text throws off centering
                      const barEl = e.currentTarget.querySelector<SVGRectElement>(".bar-rect");
                      onBarClick(i, (barEl ?? e.currentTarget).getBoundingClientRect());
                    }
                  : undefined
              }
              role={onBarClick ? "button" : undefined}
              tabIndex={onBarClick ? 0 : undefined}
              aria-label={onBarClick ? `Edit "${b.label}"` : undefined}
              onKeyDown={
                onBarClick
                  ? (e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      e.stopPropagation();
                      const barEl = e.currentTarget.querySelector<SVGRectElement>(".bar-rect");
                      onBarClick(i, (barEl ?? e.currentTarget).getBoundingClientRect());
                    }
                  : undefined
              }
            >
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
                fill={b.color || PALETTE[i % PALETTE.length]}
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
