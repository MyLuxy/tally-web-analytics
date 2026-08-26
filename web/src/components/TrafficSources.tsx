import type { ReactNode } from "react";
import type { Stats } from "../api.js";
import { RadarChart } from "./RadarChart.js";
import { TallyMarks } from "./TallyMarks.js";
import { ClickableCard } from "./ClickableCard.js";
import type { Row } from "./StatList.js";

// fixed order, not sorted by size, so the chart doesn't reshuffle when the range changes
const CATEGORIES: { key: keyof Stats["trafficSources"]; label: string; color: string }[] = [
  { key: "direct", label: "Direct", color: "var(--neutral-cat)" },
  { key: "search", label: "Search", color: "var(--accent)" },
  { key: "social", label: "Social", color: "var(--accent-4)" },
  { key: "referral", label: "Referral", color: "var(--accent-3)" },
];

// no card chrome of its own, shared by the compact card and the expanded sheet -- keeps a clickable card from nesting inside another
export function TrafficSourcesContent({
  sources,
  radarSize = 200,
  layout = "row",
}: {
  sources: Stats["trafficSources"];
  radarSize?: number;
  layout?: "row" | "column"; // "column" centres the chart above a full-width legend
}) {
  const total = CATEGORIES.reduce((sum, c) => sum + sources[c.key], 0);

  if (total === 0) {
    return (
      <div className="panel-empty">
        <TallyMarks count={3} className="panel-empty-mark" />
        <p className="ink-soft">No pageviews recorded.</p>
      </div>
    );
  }

  return (
    <div className={`traffic-sources${layout === "column" ? " traffic-sources-column" : ""}`}>
      <RadarChart size={radarSize} axes={CATEGORIES.map((c) => ({ label: c.label, value: sources[c.key] }))} />
      <ul className="traffic-sources-legend">
        {CATEGORIES.map((c) => {
          const value = sources[c.key];
          const pct = total > 0 ? Math.round((value / total) * 100) : 0;
          return (
            <li key={c.key} className="traffic-source-row">
              <span className="traffic-source-main">
                <span className="dot" style={{ background: c.color }} />
                <span className="traffic-source-label">{c.label}</span>
              </span>
              <span className="traffic-source-stats">
                <span className="traffic-source-pct num">{pct}%</span>
                <span className="traffic-source-value num">{value.toLocaleString("en-US")}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// referrers/countries can run to hundreds of rows, so this gets its own scrolling grid instead of the plain bar-list, keeps the sheet from stretching
export function RankedBoard({ rows, icon, empty }: { rows: Row[]; icon: (row: Row) => ReactNode; empty: string }) {
  if (rows.length === 0) {
    return (
      <div className="panel-empty">
        <TallyMarks count={3} className="panel-empty-mark" />
        <p className="ink-soft">{empty}</p>
      </div>
    );
  }

  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <div className="referrer-scroll">
      <ul className="referrer-grid">
        {rows.map((r, i) => {
          const label = typeof r.label === "string" ? r.label : (r.title ?? String(r.value));
          return (
            <li className="referrer-item" key={r.title ?? label}>
              <span className="referrer-rank">{i + 1}</span>
              {icon(r)}
              <span className="referrer-domain" title={label}>
                {r.label}
              </span>
              <span className="referrer-value num">{r.value.toLocaleString("en-US")}</span>
              <span className="referrer-fill" style={{ width: `${(r.value / max) * 100}%` }} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function TrafficSourcesCard({
  sources,
  expanded,
  transitioning,
  onExpand,
}: {
  sources: Stats["trafficSources"];
  expanded: boolean;
  transitioning: boolean;
  onExpand: () => void;
}) {
  return (
    <ClickableCard
      cardKey="trafficSources"
      expanded={expanded}
      transitioning={transitioning}
      onExpand={onExpand}
      ariaLabel="Traffic sources: view full breakdown"
    >
      <div className="panel-head">
        <h2 className="panel-title">Traffic sources</h2>
      </div>
      <div className="card-content">
        <TrafficSourcesContent sources={sources} radarSize={380} layout="column" />
      </div>
    </ClickableCard>
  );
}
