import type { Stats } from "../api.js";
import { RadarChart } from "./RadarChart.js";
import { TallyMarks } from "./TallyMarks.js";
import { ClickableCard } from "./ClickableCard.js";
import { ExpandIcon } from "./StatList.js";

// direct/search/social/referral, in the fixed order they should always list
// in -- not sorted by size, so the chart doesn't reshuffle every time the
// range changes. Each category gets its own accent from the palette; Direct
// (no signal at all) stays plain grey in the legend below.
const CATEGORIES: { key: keyof Stats["trafficSources"]; label: string; color: string }[] = [
  { key: "direct", label: "Direct", color: "var(--neutral-cat)" },
  { key: "search", label: "Search", color: "var(--accent)" },
  { key: "social", label: "Social", color: "var(--accent-4)" },
  { key: "referral", label: "Referral", color: "var(--accent-3)" },
];

// The radar + legend body, shared between the compact card below and the
// bigger rendering inside its expanded sheet (see App.tsx) -- no card chrome
// of its own, so it can't accidentally nest a clickable card inside another.
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
              <span className="dot" style={{ background: c.color }} />
              <span className="traffic-source-label">{c.label}</span>
              <span className="traffic-source-pct num">{pct}%</span>
              <span className="traffic-source-value num">{value.toLocaleString("en-US")}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function TrafficSourcesCard({
  sources,
  transitioning,
  onExpand,
}: {
  sources: Stats["trafficSources"];
  transitioning: boolean;
  onExpand: () => void;
}) {
  return (
    <ClickableCard
      cardKey="trafficSources"
      transitioning={transitioning}
      onExpand={onExpand}
      ariaLabel="Traffic sources: view full breakdown"
    >
      <div className="panel-head">
        <h2 className="panel-title">Traffic sources</h2>
        <div className="panel-head-actions">
          <span className="eyebrow" translate="no">views</span>
          <ExpandIcon />
        </div>
      </div>
      <TrafficSourcesContent sources={sources} radarSize={380} layout="column" />
    </ClickableCard>
  );
}
