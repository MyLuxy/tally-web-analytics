import type { ReactNode } from "react";
import { ClickableCard } from "./ClickableCard.js";
import { Donut } from "./Donut.js";
import { TallyMarks } from "./TallyMarks.js";
import { ExportCsvButton, InfoDot, Rows } from "./StatList.js";
import type { Row } from "./StatList.js";

const PREVIEW_ROWS = 5;
const PREVIEW_CHART_ITEMS = 5;

export type BreakdownTab = {
  key: string; // must match one of App.tsx's ExpandTarget values
  label: string;
  rows: Row[];
  empty: string;
  info?: string; // one-liner shown next to the export button, plain-list tabs only
  rowIcon?: (row: Row) => ReactNode; // per-row icon for plain-list tabs, e.g. a referrer's favicon
  // donut+legend instead of a bar list, for the tabs with just a few named buckets (browsers/OS/devices/countries)
  chart?: { name: string; value: number; code?: string }[];
  icon?: (name: string, code?: string) => ReactNode;
};

// fixed palette, not real brand colors, Chrome/Safari/Windows are all blue-ish and clump together otherwise
const CHART_PALETTE = [
  "var(--accent)", // blue
  "var(--accent-4)", // amber
  "var(--accent-3)", // purple
  "var(--accent-5)", // rose
  "var(--accent-2)", // teal
  "var(--neutral-cat)", // grey
];

export function BreakdownChart({
  data,
  icon,
  empty,
  colorFor,
  onSliceClick,
  size = 140,
  thickness = 20,
  lift3d = false,
}: {
  data: { name: string; value: number; code?: string }[];
  icon?: (name: string, code?: string) => ReactNode;
  empty: string;
  colorFor?: (name: string, code?: string) => string | undefined; // custom override, see App.tsx's breakdownColors
  onSliceClick?: (name: string, code: string | undefined, clientX: number, clientY: number) => void;
  size?: number;
  thickness?: number;
  lift3d?: boolean; // the expanded sheet only, see Donut
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

  const items = data.map((d, i) => ({
    ...d,
    color: colorFor?.(d.name, d.code) ?? CHART_PALETTE[i % CHART_PALETTE.length]!,
  }));

  return (
    <div className="breakdown-chart">
      <Donut
        segments={items.map((it) => ({
          label: it.name,
          value: it.value,
          color: it.color,
          icon: icon?.(it.name, it.code),
          code: it.code,
        }))}
        size={size}
        thickness={thickness}
        lift3d={lift3d}
        onSegmentClick={onSliceClick ? (seg, x, y) => onSliceClick(seg.label, seg.code, x, y) : undefined}
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

// browsers/OS/devices/countries share one card with tabs instead of being 4 separate cards. tab state lives in App.tsx so it stays synced with the expanded sheet's tabs
export function BreakdownCard({
  tabs,
  activeKey,
  onTabChange,
  expandedKey,
  transitioningKey,
  onExpand,
  colorFor,
  onSliceClick,
  rowColor,
}: {
  tabs: BreakdownTab[];
  activeKey: string;
  onTabChange: (key: string) => void;
  expandedKey: string | null; // which tab's sheet is open, if any
  transitioningKey: string | null; // which tab currently owns the transition name
  onExpand: (key: string) => void;
  colorFor?: (name: string, code?: string) => string | undefined;
  onSliceClick?: (name: string, code: string | undefined, clientX: number, clientY: number) => void;
  rowColor?: string; // overrides the rank+underline color for row tabs (chart tabs use colorFor instead)
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
          {!active.chart && active.info && <InfoDot text={active.info} />}
          {/* donut tabs export from the expanded sheet instead, this preview's only a partial list */}
          {!active.chart && active.rows.length > 0 && <ExportCsvButton title={active.label} rows={active.rows} />}
        </div>
      </div>

      {/* row tabs skip the shared view transition, a 5-row preview morphing into a 500-row list just looks like the bars jumping */}
      <div className={active.chart ? "card-content" : "card-content card-content-list"}>
        {active.chart ? (
          <BreakdownChart
            data={active.chart.slice(0, PREVIEW_CHART_ITEMS)}
            icon={active.icon}
            empty={active.empty}
            colorFor={colorFor}
            onSliceClick={onSliceClick}
            lift3d
          />
        ) : (
          <Rows rows={active.rows.slice(0, PREVIEW_ROWS)} empty={active.empty} icon={active.rowIcon} color={rowColor} />
        )}
      </div>
    </ClickableCard>
  );
}
