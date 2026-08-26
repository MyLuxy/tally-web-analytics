import { useEffect, useId, useRef, useState } from "react";
import type { Range, Stats } from "../api.js";
import { useMeasuredWidth } from "../hooks/useMeasuredWidth.js";

// hand-rolled svg chart, no library, we don't need much

type Point = Stats["series"][number];

const PAD = { top: 16, right: 14, bottom: 26, left: 40 };

const fmt = (n: number) => n.toLocaleString("en-US");

// h23 so midnight shows 00:00 not 24:00
const timeOpts = (hour12: boolean): Intl.DateTimeFormatOptions =>
  hour12
    ? { hour: "numeric", minute: "2-digit", hour12: true }
    : { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };

function tickLabel(ms: number, range: Range, hour12: boolean, multiYear: boolean): string {
  const d = new Date(ms);
  if (range === "24h") {
    return d.toLocaleTimeString("en-US", timeOpts(hour12));
  }
  if (range === "all" && multiYear) {
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// catmull-rom to bezier, one segment. shared by the line path and the hover dot
// so they're always on the exact same curve
function bezierSegment(pts: { x: number; y: number }[], i: number) {
  const p0 = pts[i - 1] ?? pts[i]!;
  const p1 = pts[i]!;
  const p2 = pts[i + 1] ?? p1;
  const p3 = pts[i + 2] ?? p2;
  return {
    p1,
    cp1: { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
    cp2: { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
    p2,
  };
}

function cubicAt(a: number, b: number, c: number, d: number, t: number): number {
  const mt = 1 - t;
  return mt * mt * mt * a + 3 * mt * mt * t * b + 3 * mt * t * t * c + t * t * t * d;
}

function smoothLine(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length < 3) return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = bezierSegment(pts, i);
    d += ` C ${seg.cp1.x} ${seg.cp1.y} ${seg.cp2.x} ${seg.cp2.y} ${seg.p2.x} ${seg.p2.y}`;
  }
  return d;
}

// walks the bezier segment to find y at the cursor's x, otherwise the hover dot
// drifts off the curve on bends (linear interp isn't good enough here)
function curveYAt(pts: { x: number; y: number }[], cx: number, i0: number, frac: number): number {
  if (pts.length <= 1) return pts[0]?.y ?? 0;
  const seg = bezierSegment(pts, i0);
  const STEPS = 16;
  let prev = seg.p1;
  for (let s = 1; s <= STEPS; s++) {
    const t = s / STEPS;
    const x = cubicAt(seg.p1.x, seg.cp1.x, seg.cp2.x, seg.p2.x, t);
    const y = cubicAt(seg.p1.y, seg.cp1.y, seg.cp2.y, seg.p2.y, t);
    if (x >= cx || s === STEPS) {
      const span = x - prev.x;
      const localT = span === 0 ? 0 : (cx - prev.x) / span;
      return prev.y + (y - prev.y) * Math.min(1, Math.max(0, localT));
    }
    prev = { x, y };
  }
  return yForFallback(pts, i0, frac); // unreachable, just keeps TS happy
}

function yForFallback(pts: { x: number; y: number }[], i0: number, frac: number): number {
  const a = pts[i0]!;
  const b = pts[Math.min(pts.length - 1, i0 + 1)]!;
  return a.y + (b.y - a.y) * frac;
}

function tipWhen(ms: number, range: Range, hour12: boolean): string {
  const d = new Date(ms);
  if (range === "24h") {
    return d.toLocaleString("en-US", { month: "short", day: "numeric", ...timeOpts(hour12) });
  }
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
  const [wrapRef, W] = useMeasuredWidth(720);
  const gradientId = `chart-area-fill-${useId()}`; // needs to be unique per instance
  const [cursorX, setCursorX] = useState<number | null>(null);

  useEffect(() => {
    setCursorX(null);
  }, [range, series]);

  // close tooltip on outside tap too
  useEffect(() => {
    if (cursorX == null) return;
    const onDown = (e: PointerEvent) => {
      if (svgRef.current && !svgRef.current.contains(e.target as Node)) setCursorX(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [cursorX]);

  const narrow = W < 500;
  const H = narrow ? 300 : 260; // taller on phones so it doesn't squash flat

  const n = series.length;
  const multiYear =
    range === "all" && n > 1 && series[n - 1]!.bucket - series[0]!.bucket > 365 * 24 * 60 * 60 * 1000;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const maxY = Math.max(1, ...series.map((p) => p.pageviews));

  const xFor = (i: number) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yFor = (v: number) => PAD.top + (1 - v / maxY) * innerH;
  const baseline = PAD.top + innerH;

  const linePath = (key: "pageviews" | "visitors") =>
    smoothLine(series.map((p, i) => ({ x: xFor(i), y: yFor(p[key]) })));

  const areaPath =
    n > 0
      ? `M ${xFor(0)} ${baseline} L ` +
        smoothLine(series.map((p, i) => ({ x: xFor(i), y: yFor(p.pageviews) }))).slice(2) +
        ` L ${xFor(n - 1)} ${baseline} Z`
      : "";

  // dedupe or low-traffic sites get doubled-up guide lines (maxY=2 -> 1,1,2,2)
  const guides = [...new Set([0.25, 0.5, 0.75, 1].map((f) => Math.round(maxY * f)))];

  const tickStep = Math.max(1, Math.ceil(n / (narrow ? 4 : 8))); // fewer labels on phones
  const ticks = series.map((p, i) => ({ p, i })).filter(({ i }) => i % tickStep === 0);

  const fracIndex = (cx: number) =>
    n <= 1 ? 0 : Math.min(n - 1, Math.max(0, ((cx - PAD.left) / innerW) * (n - 1)));

  const pointsFor = (key: "pageviews" | "visitors") => series.map((p, i) => ({ x: xFor(i), y: yFor(p[key]) }));

  const curveValueAt = (cx: number, key: "pageviews" | "visitors") => {
    if (n === 0) return 0;
    const fi = fracIndex(cx);
    const i0 = Math.min(n - 2, Math.floor(fi));
    return curveYAt(pointsFor(key), cx, i0, fi - i0);
  };

  function onMove(e: React.PointerEvent) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || n === 0) return;
    const frac = (e.clientX - rect.left) / rect.width;
    setCursorX(PAD.left + Math.min(1, Math.max(0, frac)) * innerW);
  }

  const show = cursorX != null && n > 0;
  const cx = cursorX ?? 0;
  const snap = range !== "24h"; // 7d/30d snap to the nearest point, 24h just glides along the line
  const nearIdx = Math.round(fracIndex(cx));
  const near = show ? series[nearIdx]! : undefined;

  const dotX = snap ? xFor(nearIdx) : cx;
  const viewsY = snap ? yFor(near?.pageviews ?? 0) : curveValueAt(cx, "pageviews");
  const visitorsY = snap ? yFor(near?.visitors ?? 0) : curveValueAt(cx, "visitors");

  const tipTop = (viewsY / H) * 100;
  const flip = viewsY < H * 0.24; // flip below the dot when it's near the top
  const fx = dotX / W; // clamp the tip near the edges so it doesn't clip off-screen
  const tipX = fx < 0.3 ? "0%" : fx > 0.7 ? "-100%" : "-50%";
  const tipTransform = `translate(${tipX}, ${flip ? "16px" : "calc(-100% - 16px)"})`;

  return (
    <div className="chart">
      <div className="chart-plot" ref={wrapRef}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="chart-svg"
          onPointerDown={onMove}
          onPointerMove={onMove}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") setCursorX(null);
          }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {guides.map((g) => (
            <g key={g}>
              <line className="chart-grid" x1={PAD.left} x2={W - PAD.right} y1={yFor(g)} y2={yFor(g)} />
              <text className="chart-axis" x={PAD.left - 8} y={yFor(g) + 4} textAnchor="end">
                {fmt(g)}
              </text>
            </g>
          ))}

          <path className="chart-area" d={areaPath} fill={`url(#${gradientId})`} />
          <path className="chart-line-visitors" d={linePath("visitors")} />
          <path className="chart-line-views" d={linePath("pageviews")} />

          {/* marker per point, only for 7d/30d -- 24h just glides */}
          {snap &&
            series.map((p, i) => (
              <circle key={`m${i}`} className="chart-marker" cx={xFor(i)} cy={yFor(p.pageviews)} r={2} />
            ))}

          {ticks.map(({ p, i }) => {
            const x = xFor(i);
            const anchor = x < PAD.left + 18 ? "start" : x > W - PAD.right - 18 ? "end" : "middle"; // don't clip edge labels
            return (
              <text key={i} className="chart-axis" x={x} y={H - 6} textAnchor={anchor}>
                {tickLabel(p.bucket, range, hour12, multiYear)}
              </text>
            );
          })}

          {show && (
            <g>
              <line className="chart-cursor" x1={dotX} x2={dotX} y1={PAD.top} y2={baseline} />
              <circle className="chart-dot-visitors" cx={dotX} cy={visitorsY} r={3.5} />
              <circle className="chart-dot-views" cx={dotX} cy={viewsY} r={4} />
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
