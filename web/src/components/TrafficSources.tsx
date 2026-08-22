import type { Stats } from "../api.js";
import { RadarChart } from "./RadarChart.js";
import { TallyMarks } from "./TallyMarks.js";
import { ClickableCard } from "./ClickableCard.js";
import { ExpandIcon } from "./StatList.js";
import type { Row } from "./StatList.js";

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

// "All referrers" -- unlike every other breakdown, this one can genuinely run
// long (a site can accumulate hundreds of distinct hosts), so it doesn't use
// the plain bar-list every other panel shares. A wrapping grid of small
// cards fills the sheet's width instead of one narrow column, and a bounded,
// independently-scrolling area keeps a long tail from stretching the sheet
// itself -- the chart and legend above stay put while just this scrolls.
export function ReferrerBoard({ rows, empty }: { rows: Row[]; empty: string }) {
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
          const domain = typeof r.label === "string" ? r.label : (r.title ?? String(r.value));
          return (
            <li className="referrer-item" key={r.title ?? domain}>
              <span className="referrer-rank">{i + 1}.</span>
              {/* best-effort site icon -- just a nicety, so a missing/blocked
                  one silently leaves the fallback dot rather than a broken-image icon */}
              <img
                className="referrer-favicon"
                src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`}
                alt=""
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.visibility = "hidden";
                }}
              />
              <span className="referrer-domain" title={domain}>
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
        <div className="panel-head-actions">
          <span className="eyebrow" translate="no">views</span>
          <ExpandIcon />
        </div>
      </div>
      <div className="card-content">
        <TrafficSourcesContent sources={sources} radarSize={380} layout="column" />
      </div>
    </ClickableCard>
  );
}
