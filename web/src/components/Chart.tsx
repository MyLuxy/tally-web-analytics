import { useEffect, useRef, useState } from "react";
import type { Range, Stats } from "../api.js";

// A small hand-drawn area+line chart. No charting library on purpose -- the
// shapes we need are simple, and a few lines of SVG keep the bundle honest and
// the styling fully ours.

type Point = Stats["series"][number];

const PAD = { top: 16, right: 14, bottom: 26, left: 40 };

// Fixed to en-US so the data reads consistently regardless of the viewer's
// locale -- the rest of the UI is in English too.
const fmt = (n: number) => n.toLocaleString("en-US");

// Time part of a label. hour12 picks between the American 12-hour clock (3:00 PM)
// and the 24-hour clock used across most of Europe (15:00). h23 keeps midnight as
// 00:00 rather than the 24:00 en-US sometimes gives.
const timeOpts = (hour12: boolean): Intl.DateTimeFormatOptions =>
  hour12
    ? { hour: "numeric", minute: "2-digit", hour12: true }
    : { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };

function tickLabel(ms: number, range: Range, hour12: boolean, multiYear: boolean): string {
  const d = new Date(ms);
  if (range === "24h") {
    return d.toLocaleTimeString("en-US", timeOpts(hour12));
  }
  // all-time can stretch across years -- swap day-of-month for the year so the
  // axis stays legible instead of repeating "Jan 5" across different years
  if (range === "all" && multiYear) {
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Fuller label for the tooltip. Only 24h shows a time -- there a bucket is an
// hour, so the clock is meaningful. On 7d/30d/all a bucket is a day (or wider),
// so the time-of-day would just be misleading noise; show the date alone.
// Everything is in the viewer's own timezone (toLocale*), so it reads correctly
// once real traffic is flowing in.
function tipWhen(ms: number, range: Range, hour12: boolean): string {
  const d = new Date(ms);
  if (range === "24h") {
    return d.toLocaleString("en-US", { month: "short", day: "numeric", ...timeOpts(hour12) });
  }
  // all-time can span years, so it carries the year; the day ranges stay within
  // one so a weekday + month/day reads best
  if (range === "all") {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function Chart({
  series,
  range,
  hour12,
}: {
  series: Point[];
  range: Range;
  hour12: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  // continuous chart-x of the cursor (not snapped to a data point), or null
  const [cursorX, setCursorX] = useState<number | null>(null);
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // drop the (touch) tooltip when the view changes -- a new range or fresh data
  useEffect(() => {
    setCursorX(null);
  }, [range, series]);

  // ...and when tapping or clicking anywhere outside the chart
  useEffect(() => {
    if (cursorX == null) return;
    const onDown = (e: PointerEvent) => {
      if (svgRef.current && !svgRef.current.contains(e.target as Node)) setCursorX(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [cursorX]);

  // a narrower, taller viewBox on phones: the chart fills more of the screen and,
  // being scaled less to fit the width, the labels stay readable
  const W = narrow ? 360 : 720;
  const H = narrow ? 300 : 260;

  const n = series.length;
  // on all-time, once the span passes a year the axis labels switch to showing
  // the year instead of the day (see tickLabel)
  const multiYear =
    range === "all" && n > 1 && series[n - 1]!.bucket - series[0]!.bucket > 365 * 24 * 60 * 60 * 1000;
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

  // horizontal guides, labelled with rounded counts. dedupe: at low traffic the
  // rounded fractions collapse onto the same value (maxY=2 -> 1,1,2,2), which
  // would draw doubled-up lines and repeat the axis labels.
  const guides = [...new Set([0.25, 0.5, 0.75, 1].map((f) => Math.round(maxY * f)))];

  // fewer x labels on phones so they don't collide
  const tickStep = Math.max(1, Math.ceil(n / (narrow ? 4 : 8)));
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

  // pointer events cover mouse hover and touch alike (paired with touch-action:
  // pan-y in CSS, so a vertical swipe still scrolls the page)
  function onMove(e: React.PointerEvent) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || n === 0) return;
    const frac = (e.clientX - rect.left) / rect.width;
    setCursorX(PAD.left + Math.min(1, Math.max(0, frac)) * innerW);
  }

  const show = cursorX != null && n > 0;
  const cx = cursorX ?? 0;
  // 7d/30d have distinct daily points, so snap onto the nearest one for a clean
  // read; 24h is denser and reads better as a continuous glide along the line.
  const snap = range !== "24h";
  const nearIdx = Math.round(fracIndex(cx));
  const near = show ? series[nearIdx]! : undefined;

  const dotX = snap ? xFor(nearIdx) : cx;
  const viewsY = yFor(snap ? (near?.pageviews ?? 0) : valueAt(cx, "pageviews"));
  const visitorsY = yFor(snap ? (near?.visitors ?? 0) : valueAt(cx, "visitors"));

  // place the tip above the (upper) views dot; flip below when it's near the top
  const tipTop = (viewsY / H) * 100;
  const flip = viewsY < H * 0.24;
  // anchor it by the inner edge near the sides (extends right on the left, left
  // on the right) so it can't get clipped off-screen, centred in the middle
  const fx = dotX / W;
  const tipX = fx < 0.3 ? "0%" : fx > 0.7 ? "-100%" : "-50%";
  const tipTransform = `translate(${tipX}, ${flip ? "16px" : "calc(-100% - 16px)"})`;

  return (
    <div className="chart">
      <div className="chart-plot">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="chart-svg"
          onPointerDown={onMove}
          onPointerMove={onMove}
          // a mouse leaving clears it; on touch we leave the box up after a tap
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") setCursorX(null);
          }}
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

          {/* a marker on each data point (7d/30d only -- on 24h there are too
              many and we glide instead of snapping) */}
          {snap &&
            series.map((p, i) => (
              <circle key={`m${i}`} className="chart-marker" cx={xFor(i)} cy={yFor(p.pageviews)} r={2.6} />
            ))}

          {ticks.map(({ p, i }) => {
            const x = xFor(i);
            // keep the edge labels from being clipped by the plot bounds
            const anchor = x < PAD.left + 18 ? "start" : x > W - PAD.right - 18 ? "end" : "middle";
            return (
              <text key={i} className="chart-axis" x={x} y={H - 6} textAnchor={anchor}>
                {tickLabel(p.bucket, range, hour12, multiYear)}
              </text>
            );
          })}

          {show && (
            <g>
              <line className="chart-cursor" x1={dotX} x2={dotX} y1={PAD.top} y2={baseline} />
              <circle className="chart-dot-visitors" cx={dotX} cy={visitorsY} r={4.5} />
              <circle className="chart-dot-views" cx={dotX} cy={viewsY} r={5} />
            </g>
          )}
        </svg>

        {show && near && (
          <div
            className="chart-tip"
            style={{ left: `${fx * 100}%`, top: `${tipTop}%`, transform: tipTransform }}
          >
            <span className="chart-tip-when num">{tipWhen(near.bucket, range, hour12)}</span>
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
