import { useState } from "react";
import { ClickableCard } from "./ClickableCard.js";
import { ExpandIcon, ExportCsvButton, Rows } from "./StatList.js";
import type { Row } from "./StatList.js";

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
};

// Browsers, OS, devices and countries used to be four separate cards that
// all looked the same. They're really one question -- "who's visiting,
// broken down how?" -- so they share a single card with a tab switcher
// instead, which is one less repeated shape on the page for each of them.
export function BreakdownCard({
  tabs,
  expanded,
  onExpand,
}: {
  tabs: BreakdownTab[];
  expanded: string | null; // the currently expanded tab's key, if it's one of these
  onExpand: (key: string) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = tabs[activeIndex]!;
  const isExpanded = expanded === active.key;

  return (
    <ClickableCard
      cardKey={active.key}
      expanded={isExpanded}
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
          <ExpandIcon />
        </div>
      </div>

      <Rows rows={active.rows.slice(0, PREVIEW_ROWS)} empty={active.empty} />

      {active.rows.length > PREVIEW_ROWS && <div className="panel-more">View full list</div>}
    </ClickableCard>
  );
}
