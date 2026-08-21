import type { Stats } from "../api.js";
import { Donut } from "./Donut.js";
import { TallyMarks } from "./TallyMarks.js";
import { ClickableCard } from "./ClickableCard.js";
import { ExpandIcon } from "./StatList.js";

// direct/search/social/referral, in the fixed order they should always list
// in -- not sorted by size, so the legend doesn't reshuffle every time the
// range changes. Each category gets its own accent from the palette; Direct
// (no signal at all) stays plain grey.
const CATEGORIES: { key: keyof Stats["trafficSources"]; label: string; color: string }[] = [
  { key: "direct", label: "Direct", color: "var(--ink-faint)" },
  { key: "search", label: "Search", color: "var(--accent)" },
  { key: "social", label: "Social", color: "var(--accent-2)" },
  { key: "referral", label: "Referral", color: "var(--accent-3)" },
];

// The donut + legend body, shared between the compact card below and the
// bigger rendering inside its expanded sheet (see App.tsx) -- no card chrome
// of its own, so it can't accidentally nest a clickable card inside another.
export function TrafficSourcesContent({
  sources,
  donutSize = 116,
}: {
  sources: Stats["trafficSources"];
  donutSize?: number;
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
    <div className="traffic-sources">
      <Donut
        size={donutSize}
        segments={CATEGORIES.map((c) => ({ value: sources[c.key], color: c.color }))}
        centerLabel={total.toLocaleString("en-US", { notation: total >= 100_000 ? "compact" : undefined })}
        centerSub="views"
      />
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
  expanded,
  onExpand,
}: {
  sources: Stats["trafficSources"];
  expanded: boolean;
  onExpand: () => void;
}) {
  return (
    <ClickableCard
      cardKey="trafficSources"
      expanded={expanded}
      onExpand={onExpand}
      ariaLabel="Traffic sources: view full breakdown"
      className="card-span-2"
    >
      <div className="panel-head">
        <h2 className="panel-title">Traffic sources</h2>
        <div className="panel-head-actions">
          <span className="eyebrow" translate="no">views</span>
          <ExpandIcon />
        </div>
      </div>
      <TrafficSourcesContent sources={sources} />
    </ClickableCard>
  );
}
