// A ring chart built from plain stacked <circle> strokes -- same "no charting
// library" approach as Chart.tsx. Each segment is a dashed stroke covering its
// share of the circumference, offset to start where the previous one ended.

export type DonutSegment = {
  value: number;
  color: string; // any CSS colour expression, e.g. "var(--accent)" or a color-mix()
};

export function Donut({
  segments,
  size = 116,
  thickness = 16,
  centerLabel,
  centerSub,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSub?: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const visible = segments.filter((s) => s.value > 0);

  let offset = 0;

  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="donut-svg">
        {/* start at 12 o'clock instead of 3 o'clock, and draw clockwise */}
        <g transform={`translate(${size / 2} ${size / 2}) rotate(-90)`}>
          {total === 0 ? (
            <circle r={r} className="donut-empty" strokeWidth={thickness} fill="none" />
          ) : (
            visible.map((s, i) => {
              const dash = (s.value / total) * circumference;
              const el = (
                <circle
                  key={i}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={thickness}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offset}
                  // a single full-circle segment gets round caps so it doesn't
                  // show a seam; multiple segments use butt caps so they sit
                  // flush against their neighbours instead of overlapping
                  strokeLinecap={visible.length === 1 ? "round" : "butt"}
                />
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
    </div>
  );
}
