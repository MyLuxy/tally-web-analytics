import type { Stats } from "../api.js";
import { useMeasuredWidth } from "../hooks/useMeasuredWidth.js";

// A light preview of a traffic trend -- axis labels so the numbers mean
// something at a glance, but none of the full <Chart>'s interactivity
// (tooltip, cursor, legend, per-point markers). That stays reserved for the
// expanded view; this just needs to read well small.

const H = 130;
const PAD = { top: 6, right: 8, bottom: 18, left: 34 };

const fmt = (n: number) => n.toLocaleString("en-US");

export function Sparkline({ series, hour12 }: { series: Stats["series"]; hour12: boolean }) {
  // W is the card's actual measured width, not a fixed "design" width -- see
  // useMeasuredWidth for why that's what keeps the axis text legible on any
  // screen instead of shrinking along with a narrow card.
  const [wrapRef, W] = useMeasuredWidth(600);
  const n = series.length;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const maxY = Math.max(1, ...series.map((p) => p.pageviews));

  const xFor = (i: number) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yFor = (v: number) => PAD.top + (1 - v / maxY) * innerH;
  const baseline = PAD.top + innerH;

  const linePath = series.map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(p.pageviews)}`).join(" ");
  const areaPath =
    n > 0
      ? `M ${xFor(0)} ${baseline} ` +
        series.map((p, i) => `L ${xFor(i)} ${yFor(p.pageviews)}`).join(" ") +
        ` L ${xFor(n - 1)} ${baseline} Z`
      : "";

  // just two guides (half and full) -- enough to read the scale without
  // turning this back into the full chart's denser grid
  const guides = [...new Set([0.5, 1].map((f) => Math.round(maxY * f)))];

  // a handful of x-axis time labels, evenly spaced
  const tickCount = Math.min(4, n);
  const tickStep = tickCount > 1 ? Math.max(1, Math.floor((n - 1) / (tickCount - 1))) : 1;
  const ticks = series.map((p, i) => ({ p, i })).filter(({ i }) => i % tickStep === 0 || i === n - 1);
  const timeOpts: Intl.DateTimeFormatOptions = hour12
    ? { hour: "numeric", hour12: true }
    : { hour: "2-digit", hourCycle: "h23" };

  return (
    <div ref={wrapRef} className="sparkline-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="sparkline" role="img" aria-label="Traffic in the last 24 hours">
        {guides.map((g) => (
          <g key={g}>
            <line className="sparkline-grid" x1={PAD.left} x2={W - PAD.right} y1={yFor(g)} y2={yFor(g)} />
            <text className="sparkline-axis" x={PAD.left - 6} y={yFor(g) + 3} textAnchor="end">
              {fmt(g)}
            </text>
          </g>
        ))}

        <path d={areaPath} className="sparkline-area" />
        {n > 1 && <path d={linePath} className="sparkline-line" />}

        {ticks.map(({ p, i }) => {
          const x = xFor(i);
          const anchor = x < PAD.left + 14 ? "start" : x > W - PAD.right - 14 ? "end" : "middle";
          return (
            <text key={i} className="sparkline-axis" x={x} y={H - 4} textAnchor={anchor}>
              {new Date(p.bucket).toLocaleTimeString("en-US", timeOpts)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
