import { useState } from "react";
import { ClickableCard } from "./ClickableCard.js";
import { Donut } from "./Donut.js";
import { TallyMarks } from "./TallyMarks.js";
import { ExportCsvButton, Rows } from "./StatList.js";
import type { Row } from "./StatList.js";
import type { PlatformIcon } from "./DeviceIcons.js";

// Cards stay compact -- a handful of rows is enough to read the shape of the
// data; clicking the card is what gets you the rest (see StatList, which
// this mirrors).
const PREVIEW_ROWS = 5;

export type BreakdownTab = {
  key: string; // must match one of App.tsx's ExpandTarget values
  label: string;
  unit: string;
  rows: Row[];
  empty: string;
  // browsers/OS/devices show a donut + icon legend instead of the plain bar
  // list every other breakdown uses -- a handful of named buckets reads
  // better as "what share is Chrome" than as another top-10 list. Countries
  // has no natural icon set (and can run long), so it stays on `rows`.
  chart?: { name: string; value: number }[];
  icon?: (name: string) => PlatformIcon;
};

// Falls back to this when a name has no real brand colour of its own (a
// device's form factor isn't a brand, and the hand-drawn Edge/"Other"
// glyphs aren't accurate enough to claim a real brand colour either).
const FALLBACK_PALETTE = [
  "var(--accent)",
  "var(--accent-2)",
  "var(--accent-3)",
  "var(--accent-4)",
  "var(--accent-5)",
  "var(--neutral-cat)",
];

function BreakdownChart({
  data,
  icon,
  empty,
}: {
  data: { name: string; value: number }[];
  icon?: (name: string) => PlatformIcon;
  empty: string;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (total === 0) {
    return (
      <div className="panel-empty">
        <TallyMarks count={3} className="panel-empty-mark" />
        <p className="ink-soft">{empty}</p>
      </div>
    );
  }

  // real brand colour when we have one (Chrome blue, Firefox orange, ...),
  // otherwise cycle the app's own accents so every slice still reads distinct
  const items = data.map((d, i) => {
    const meta = icon?.(d.name);
    return { ...d, ...meta, color: meta?.color ?? FALLBACK_PALETTE[i % FALLBACK_PALETTE.length]! };
  });

  return (
    <div className="breakdown-chart">
      <Donut segments={items.map((it) => ({ label: it.name, value: it.value, color: it.color }))} size={140} thickness={20} />
      <ul className="breakdown-chart-legend">
        {items.map((it) => {
          const pct = Math.round((it.value / total) * 100);
          return (
            <li key={it.name} className="breakdown-chart-row">
              <span className="breakdown-chart-icon" style={{ color: it.color }}>
                {it.icon}
              </span>
              <span className="breakdown-chart-name">{it.name}</span>
              <span className="breakdown-chart-stats">
                <span className="breakdown-chart-pct num">{pct}%</span>
                <span className="breakdown-chart-value num">{it.value.toLocaleString("en-US")}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Browsers, OS, devices and countries used to be four separate cards that
// all looked the same. They're really one question -- "who's visiting,
// broken down how?" -- so they share a single card with a tab switcher
// instead, which is one less repeated shape on the page for each of them.
export function BreakdownCard({
  tabs,
  expandedKey,
  transitioningKey,
  onExpand,
}: {
  tabs: BreakdownTab[];
  expandedKey: string | null; // the tab key whose sheet is fully open, if it's one of these
  transitioningKey: string | null; // the tab key currently allowed to wear the transition name, if it's one of these
  onExpand: (key: string) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = tabs[activeIndex]!;
  const isExpanded = expandedKey === active.key;
  const isTransitioning = transitioningKey === active.key;

  return (
    <ClickableCard
      cardKey={active.key}
      expanded={isExpanded}
      transitioning={isTransitioning}
      onExpand={() => onExpand(active.key)}
      ariaLabel={`${active.label}: view all`}
      className="card-span-2"
    >
      <div className="panel-head">
        <div className="breakdown-tabs" role="tablist" aria-label="Breakdown by">
          {tabs.map((t, i) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={i === activeIndex}
              className="segment"
              onClick={(e) => {
                e.stopPropagation(); // switch tabs, don't also expand the card
                setActiveIndex(i);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="panel-head-actions">
          {active.rows.length > 0 && <ExportCsvButton title={active.label} rows={active.rows} />}
          <span className="eyebrow" translate="no">{active.unit}</span>
        </div>
      </div>

      <div className="card-content">
        {active.chart ? (
          <BreakdownChart data={active.chart} icon={active.icon} empty={active.empty} />
        ) : (
          <Rows rows={active.rows.slice(0, PREVIEW_ROWS)} empty={active.empty} />
        )}
      </div>
    </ClickableCard>
  );
}
