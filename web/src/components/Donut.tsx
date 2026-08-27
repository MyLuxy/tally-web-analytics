// ring chart from stacked dashed <circle> strokes, no library
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

export type DonutSegment = {
  label: string;
  value: number;
  color: string; // any CSS colour expression, e.g. "var(--accent)" or a color-mix()
  icon?: ReactNode; // shown next to the label in the hover tip, see BreakdownChart
  code?: string; // stable id for color-key lookups where label alone isn't (countries), see App.tsx
};

const fmt = (n: number) => n.toLocaleString("en-US");

export function Donut({
  segments,
  size = 116,
  thickness = 16,
  centerLabel,
  centerSub,
  lift3d = false,
  onSegmentClick,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSub?: string;
  lift3d?: boolean; // the expanded sheet's bigger donut only -- pops the hovered slice up in 3D
  onSegmentClick?: (segment: DonutSegment, clientX: number, clientY: number) => void;
}) {
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  // raw mousemove fires way faster than we need to re-render, throttle to one update per frame
  const pendingRef = useRef<{ i: number; x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  function queueHover(next: { i: number; x: number; y: number } | null) {
    pendingRef.current = next;
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setHover(pendingRef.current);
    });
  }

  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const visible = segments.filter((s) => s.value > 0);

  let offset = 0;
  const items = visible.map((s, i) => {
    const dash = (s.value / total) * circumference;
    const dashOffset = offset;
    const linecap: "round" | "butt" = visible.length === 1 ? "round" : "butt";
    offset += dash;
    return { s, i, dash, dashOffset, linecap };
  });
  const liftedHover = lift3d && hover ? items[hover.i] : undefined;

  return (
    <div
      className="donut"
      style={{ width: size, maxWidth: "100%", aspectRatio: "1 / 1" }} // maxWidth+aspectRatio so it shrinks square on narrow screens instead of overflowing
      onMouseLeave={() => queueHover(null)}
    >
      {/* clears the tip when the cursor's over the hole or the corners, not covered by any segment's own hit-circle */}
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${size} ${size}`}
        className="donut-svg"
        onMouseMove={() => queueHover(null)}
      >
        <g transform={`translate(${size / 2} ${size / 2}) rotate(-90)`}>
          {total === 0 ? (
            <circle r={r} className="donut-empty" strokeWidth={thickness} fill="none" />
          ) : (
            items.map(({ s, i, dash, dashOffset, linecap }) => (
              <g key={i}>
                <circle
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={thickness}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-dashOffset}
                  strokeLinecap={linecap} // round cap avoids a seam on a lone full-circle segment
                  className="donut-segment"
                />
                {/* invisible wider twin, the real stroke is too thin to reliably hover */}
                <circle
                  r={r}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={thickness + 44}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-dashOffset}
                  strokeLinecap={linecap}
                  style={{ pointerEvents: "stroke", cursor: onSegmentClick ? "pointer" : undefined }}
                  onMouseMove={(e) => {
                    e.stopPropagation(); // don't trigger the svg's clear-on-move too
                    const rect = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
                    queueHover({ i, x: e.clientX - rect.left, y: e.clientY - rect.top });
                  }}
                  onClick={
                    onSegmentClick
                      ? (e) => {
                          e.stopPropagation();
                          onSegmentClick(s, e.clientX, e.clientY);
                        }
                      : undefined
                  }
                />
              </g>
            ))
          )}
          {/* redrawn on top so its shadow doesn't get sliced off by a later segment painting over it */}
          {liftedHover && (
            <circle
              r={r}
              fill="none"
              stroke={liftedHover.s.color}
              strokeWidth={thickness}
              strokeDasharray={`${liftedHover.dash} ${circumference - liftedHover.dash}`}
              strokeDashoffset={-liftedHover.dashOffset}
              strokeLinecap={liftedHover.linecap}
              style={{
                pointerEvents: "none",
                // "lift" is just shadow + brightness, no actual movement
                filter:
                  "drop-shadow(0 3px 5px rgba(0, 0, 0, 0.45)) drop-shadow(0 12px 20px rgba(0, 0, 0, 0.4)) brightness(1.22)",
              }}
            />
          )}
        </g>
      </svg>
      {(centerLabel || centerSub) && (
        <div className="donut-center">
          {centerLabel && <div className="donut-center-value num">{centerLabel}</div>}
          {centerSub && <div className="donut-center-sub eyebrow">{centerSub}</div>}
        </div>
      )}
      {hover && (
        <div className="donut-tip" style={{ left: hover.x, top: hover.y }}>
          <strong>
            {visible[hover.i]!.icon && (
              <span className="donut-tip-icon" style={{ color: visible[hover.i]!.color }}>
                {visible[hover.i]!.icon}
              </span>
            )}
            {visible[hover.i]!.label}
          </strong>
          <span>
            {fmt(visible[hover.i]!.value)} · {total > 0 ? Math.round((visible[hover.i]!.value / total) * 100) : 0}%
          </span>
        </div>
      )}
    </div>
  );
}
