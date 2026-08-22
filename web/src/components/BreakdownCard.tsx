import type { ReactNode } from "react";
import { ClickableCard } from "./ClickableCard.js";
import { Donut } from "./Donut.js";
import { TallyMarks } from "./TallyMarks.js";
import { ExportCsvButton, Rows } from "./StatList.js";
import type { Row } from "./StatList.js";

// Cards stay compact -- a handful of rows is enough to read the shape of the
// data; clicking the card is what gets you the rest (see StatList, which
// this mirrors).
const PREVIEW_ROWS = 5;
const PREVIEW_CHART_ITEMS = 5;

export type BreakdownTab = {
  key: string; // must match one of App.tsx's ExpandTarget values
  label: string;
  rows: Row[];
  empty: string;
  // browsers/OS/devices/countries show a donut + icon legend instead of the
  // plain bar list every other breakdown uses -- a handful of named buckets
  // reads better as "what share is Chrome" than as another top-10 list.
  // `code` is the lookup key for `icon` when it differs from the display
  // name (a country's flag is keyed by its ISO code, not "France").
  chart?: { name: string; value: number; code?: string }[];
  icon?: (name: string, code?: string) => ReactNode;
};

// Assigned by position, not by brand -- Chrome, Safari and Windows are all
// some shade of blue in real life, and a real-colour donut kept clumping
// blues together. A fixed, deliberately spread-out palette instead, so
// whichever two items land next to each other always read as distinct.
const CHART_PALETTE = [
  "var(--accent)", // blue
  "var(--accent-4)", // amber
  "var(--accent-3)", // purple
  "var(--accent-5)", // rose
  "var(--accent-2)", // teal
  "var(--neutral-cat)", // grey
];

// Exported so the expanded sheet (see App.tsx) can render the same donut,
// bigger, instead of duplicating this.
export function BreakdownChart({
  data,
  icon,
  empty,
  size = 140,
  thickness = 20,
  lift3d = false,
}: {
  data: { name: string; value: number; code?: string }[];
  icon?: (name: string, code?: string) => ReactNode;
  empty: string;
  size?: number;
  thickness?: number;
  lift3d?: boolean; // the expanded sheet only -- see Donut
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

  const items = data.map((d, i) => ({ ...d, color: CHART_PALETTE[i % CHART_PALETTE.length]! }));

  return (
    <div className="breakdown-chart">
      <Donut
        segments={items.map((it) => ({ label: it.name, value: it.value, color: it.color }))}
        size={size}
        thickness={thickness}
        lift3d={lift3d}
      />
      <ul className="breakdown-chart-legend">
        {items.map((it) => {
          const pct = Math.round((it.value / total) * 100);
          return (
            <li key={it.name} className="breakdown-chart-row">
              <span className="breakdown-chart-main">
                <span className="breakdown-chart-icon" style={{ color: it.color }}>
                  {icon?.(it.name, it.code)}
                </span>
                <span className="breakdown-chart-name">{it.name}</span>
              </span>
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
// The active tab is controlled by App.tsx (not local state) so it stays in
// sync with the same tab switcher inside the expanded sheet.
export function BreakdownCard({
  tabs,
  activeKey,
  onTabChange,
  expandedKey,
  transitioningKey,
  onExpand,
}: {
  tabs: BreakdownTab[];
  activeKey: string;
  onTabChange: (key: string) => void;
  expandedKey: string | null; // the tab key whose sheet is fully open, if it's one of these
  transitioningKey: string | null; // the tab key currently allowed to wear the transition name, if it's one of these
  onExpand: (key: string) => void;
}) {
  const active = tabs.find((t) => t.key === activeKey) ?? tabs[0]!;
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
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={t.key === active.key}
              className="segment"
              onClick={(e) => {
                e.stopPropagation(); // switch tabs, don't also expand the card
                onTabChange(t.key);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="panel-head-actions">
          {active.rows.length > 0 && <ExportCsvButton title={active.label} rows={active.rows} />}
        </div>
      </div>

      <div className="card-content">
        {active.chart ? (
          // capped so the card can't grow past a handful of rows -- Countries
          // especially could otherwise list a dozen+ of them here. The full
          // set is one click away, in the expanded sheet.
          <BreakdownChart data={active.chart.slice(0, PREVIEW_CHART_ITEMS)} icon={active.icon} empty={active.empty} />
        ) : (
          <Rows rows={active.rows.slice(0, PREVIEW_ROWS)} empty={active.empty} />
        )}
      </div>
    </ClickableCard>
  );
}
