// A ring chart built from plain stacked <circle> strokes -- same "no charting
// library" approach as Chart.tsx. Each segment is a dashed stroke covering its
// share of the circumference, offset to start where the previous one ended.
import { useEffect, useRef, useState } from "react";

export type DonutSegment = {
  label: string;
  value: number;
  color: string; // any CSS colour expression, e.g. "var(--accent)" or a color-mix()
};

const fmt = (n: number) => n.toLocaleString("en-US");

export function Donut({
  segments,
  size = 116,
  thickness = 16,
  centerLabel,
  centerSub,
  parallax = false,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSub?: string;
  parallax?: boolean; // the expanded sheet's bigger donut only -- a 3D tilt/lift on the hovered slice
}) {
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  // raw mousemove can fire far faster than React (and the browser) can
  // usefully repaint -- setting state on every single event was flooding
  // re-renders and showed up as a freeze/stutter moving quickly across
  // segments. Coalesce to at most one update per animation frame instead.
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

  // tilt magnitude follows where the cursor sits over the slice, relative
  // to the donut's own centre -- so it reads as a slice tipping toward the
  // cursor rather than a single fixed pop animation
  const maxTilt = 16;
  const cx = size / 2;
  const cy = size / 2;
  const tiltX = hover ? -((hover.y - cy) / cy) * maxTilt : 0;
  const tiltY = hover ? ((hover.x - cx) / cx) * maxTilt : 0;

  let offset = 0;

  return (
    <div className="donut" style={{ width: size, height: size }} onMouseLeave={() => queueHover(null)}>
      {/* clears the tooltip over the hole in the middle (or the square's
          corners outside the ring) -- neither is covered by a segment's own
          hit-circle, so without this the last-hovered segment's tip just
          stayed on screen instead of disappearing like it does once the
          cursor actually leaves the donut. Each segment's own handler stops
          the event here so hovering it doesn't immediately clear itself. */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="donut-svg"
        onMouseMove={() => queueHover(null)}
      >
        {/* start at 12 o'clock instead of 3 o'clock, and draw clockwise */}
        <g transform={`translate(${size / 2} ${size / 2}) rotate(-90)`}>
          {total === 0 ? (
            <circle r={r} className="donut-empty" strokeWidth={thickness} fill="none" />
          ) : (
            visible.map((s, i) => {
              const dash = (s.value / total) * circumference;
              const dashOffset = offset;
              const linecap = visible.length === 1 ? "round" : "butt";
              const el = (
                <g key={i}>
                  <circle
                    r={r}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={thickness}
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeDashoffset={-dashOffset}
                    // a single full-circle segment gets round caps so it doesn't
                    // show a seam; multiple segments use butt caps so they sit
                    // flush against their neighbours instead of overlapping
                    strokeLinecap={linecap}
                    className="donut-segment"
                    style={
                      parallax && hover?.i === i
                        ? {
                            transform: `perspective(600px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateZ(16px) scale(1.04)`,
                            filter: "drop-shadow(0 10px 16px rgba(0, 0, 0, 0.35))",
                          }
                        : undefined
                    }
                  />
                  {/* invisible, much wider twin -- the thin visible stroke was
                      an easy target to slip off of at normal cursor speed,
                      which is what actually looked like the hover "freezing"
                      (it hadn't frozen, it had just lost the segment). This
                      one owns the hover, sized for a forgiving hit area. */}
                  <circle
                    r={r}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={thickness + 44}
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeDashoffset={-dashOffset}
                    strokeLinecap={linecap}
                    style={{ pointerEvents: "stroke" }}
                    onMouseMove={(e) => {
                      e.stopPropagation(); // don't also trigger the svg's clear-on-move
                      const rect = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
                      queueHover({ i, x: e.clientX - rect.left, y: e.clientY - rect.top });
                    }}
                  />
                </g>
              );
              offset += dash;
              return el;
            })
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
          <strong>{visible[hover.i]!.label}</strong>
          <span>
            {fmt(visible[hover.i]!.value)} · {total > 0 ? Math.round((visible[hover.i]!.value / total) * 100) : 0}%
          </span>
        </div>
      )}
    </div>
  );
}
