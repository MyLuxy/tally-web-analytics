import { useRef, useState } from "react";
import type { Range, Stats } from "../api.js";

// A small hand-drawn area+line chart. No charting library on purpose -- the
// shapes we need are simple, and a few lines of SVG keep the bundle honest and
// the styling fully ours.

type Point = Stats["series"][number];

const W = 720;
const H = 260;
const PAD = { top: 16, right: 14, bottom: 26, left: 40 };

// Fixed to en-US so the data reads consistently regardless of the viewer's
// locale -- the rest of the UI is in English too.
const fmt = (n: number) => n.toLocaleString("en-US");

function tickLabel(ms: number, range: Range): string {
  const d = new Date(ms);
  if (range === "24h") {
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function Chart({ series, range }: { series: Point[]; range: Range }) {
  const svgRef = useRef<SVGSVGElement>(null);
  // continuous chart-x of the cursor (not snapped to a data point), or null
  const [cursorX, setCursorX] = useState<number | null>(null);

  const n = series.length;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const maxY = Math.max(1, ...series.map((p) => p.pageviews));

  const xFor = (i: number) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yFor = (v: number) => PAD.top + (1 - v / maxY) * innerH;
  const baseline = PAD.top + innerH;

  const linePath = (key: "pageviews" | "visitors") =>
    series.map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(p[key])}`).join(" ");

  const areaPath =
    n > 0
      ? `M ${xFor(0)} ${baseline} ` +
        series.map((p, i) => `L ${xFor(i)} ${yFor(p.pageviews)}`).join(" ") +
        ` L ${xFor(n - 1)} ${baseline} Z`
      : "";

  // three horizontal guides, labelled with rounded counts
  const guides = [0.25, 0.5, 0.75, 1].map((f) => Math.round(maxY * f));

  // spread out ~8-10 x ticks: every day on 7d, a denser sampling on 24h/30d
  const tickStep = Math.max(1, Math.ceil(n / 8));
  const ticks = series.map((p, i) => ({ p, i })).filter(({ i }) => i % tickStep === 0);

  // fractional index under the cursor, so the dot can ride the line smoothly
  // instead of snapping from point to point
  const fracIndex = (cx: number) =>
    n <= 1 ? 0 : Math.min(n - 1, Math.max(0, ((cx - PAD.left) / innerW) * (n - 1)));

  // linear-interpolate a series value at the cursor's position on the line
  const valueAt = (cx: number, key: "pageviews" | "visitors") => {
    if (n === 0) return 0;
    const fi = fracIndex(cx);
    const i0 = Math.floor(fi);
    const i1 = Math.min(n - 1, i0 + 1);
    const a = series[i0]!;
    const b = series[i1]!;
    return a[key] + (b[key] - a[key]) * (fi - i0);
  };

  function onMove(e: React.MouseEvent) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || n === 0) return;
    const frac = (e.clientX - rect.left) / rect.width;
    setCursorX(PAD.left + Math.min(1, Math.max(0, frac)) * innerW);
  }

  const show = cursorX != null && n > 0;
  const cx = cursorX ?? 0;
  const viewsY = yFor(valueAt(cx, "pageviews"));
  const visitorsY = yFor(valueAt(cx, "visitors"));
  // the tooltip reports the nearest real data point (integer counts + its date)
  const near = show ? series[Math.round(fracIndex(cx))] : undefined;

  // place the tip above the (upper) views dot; flip below when it's near the top
  const tipLeft = Math.min(92, Math.max(8, (cx / W) * 100));
  const tipTop = (viewsY / H) * 100;
  const flip = viewsY < H * 0.24;

  return (
    <div className="chart">
      <div className="chart-plot">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="chart-svg"
          onMouseMove={onMove}
          onMouseLeave={() => setCursorX(null)}
        >
          {guides.map((g) => (
            <g key={g}>
              <line className="chart-grid" x1={PAD.left} x2={W - PAD.right} y1={yFor(g)} y2={yFor(g)} />
              <text className="chart-axis" x={PAD.left - 8} y={yFor(g) + 4} textAnchor="end">
                {fmt(g)}
              </text>
            </g>
          ))}

          <path className="chart-area" d={areaPath} />
          <path className="chart-line-visitors" d={linePath("visitors")} />
          <path className="chart-line-views" d={linePath("pageviews")} />

          {/* a marker on each data point so it's clear which day a value is */}
          {series.map((p, i) => (
            <circle key={`m${i}`} className="chart-marker" cx={xFor(i)} cy={yFor(p.pageviews)} r={2.3} />
          ))}

          {ticks.map(({ p, i }) => {
            const x = xFor(i);
            // keep the edge labels from being clipped by the plot bounds
            const anchor = x < PAD.left + 18 ? "start" : x > W - PAD.right - 18 ? "end" : "middle";
            return (
              <text key={i} className="chart-axis" x={x} y={H - 6} textAnchor={anchor}>
                {tickLabel(p.bucket, range)}
              </text>
            );
          })}

          {show && (
            <g>
              <line className="chart-cursor" x1={cx} x2={cx} y1={PAD.top} y2={baseline} />
              <circle className="chart-dot-visitors" cx={cx} cy={visitorsY} r={4} />
              <circle className="chart-dot-views" cx={cx} cy={viewsY} r={4.5} />
            </g>
          )}
        </svg>

        {show && near && (
          <div
            className={`chart-tip${flip ? " flip" : ""}`}
            style={{ left: `${tipLeft}%`, top: `${tipTop}%` }}
          >
            <span className="chart-tip-when num">{tickLabel(near.bucket, range)}</span>
            <span className="chart-tip-stat">
              <span className="dot dot-views" />
              <span className="num">{fmt(near.pageviews)}</span>
            </span>
            <span className="chart-tip-stat">
              <span className="dot dot-visitors" />
              <span className="num">{fmt(near.visitors)}</span>
            </span>
          </div>
        )}
      </div>

      <div className="chart-legend">
        <span className="legend-item"><span className="dot dot-views" /> Pageviews</span>
        <span className="legend-item"><span className="dot dot-visitors" /> Visitors</span>
      </div>
    </div>
  );
}
