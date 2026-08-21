import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { TallyMarks } from "./TallyMarks.js";
import { downloadCsv, rowsToCsv } from "../lib/csv.js";

// Ledger-style breakdown: a label, a count, and a faint bar behind each row
// scaled to the leader. Used for pages, referrers and browsers alike.

// label can be a node (e.g. a flag + name); title is the plain-text tooltip.
export type Row = { label: ReactNode; value: number; title?: string };

// Cards stay compact on the base dashboard -- a handful of rows is enough to
// read the shape of the data; clicking the card is what gets you the rest.
const PREVIEW_ROWS = 5;

export function StatList({
  title,
  unit,
  rows,
  empty,
  info,
  onViewAll,
}: {
  title: string;
  unit: string;
  rows: Row[];
  empty: string;
  info?: string; // optional one-liner explaining the section
  onViewAll?: () => void; // cards show a short preview; clicking opens the full list in a modal
}) {
  const clickable = Boolean(onViewAll && rows.length > 0);

  return (
    <section
      className={`panel${clickable ? " panel-clickable" : ""}`}
      {...(clickable
        ? {
            role: "button",
            tabIndex: 0,
            "aria-label": `${title}: view all`,
            onClick: onViewAll,
            onKeyDown: (e: ReactKeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onViewAll?.();
              }
            },
          }
        : {})}
    >
      <div className="panel-head">
        <h2 className="panel-title">
          {title}
          {info && <InfoDot text={info} />}
        </h2>
        <div className="panel-head-actions">
          {rows.length > 0 && <ExportCsvButton title={title} rows={rows} />}
          {/* the unit ("views") is a fixed label -- keep browser auto-translate off it */}
          <span className="eyebrow" translate="no">{unit}</span>
          {clickable && <ExpandIcon />}
        </div>
      </div>

      <Rows rows={rows.slice(0, PREVIEW_ROWS)} empty={empty} />

      {/* rows is only ever a top-10 slice from the server, so it can't say
          exactly how many more there are -- the full count only comes back
          once the modal actually fetches the uncapped breakdown */}
      {clickable && rows.length > PREVIEW_ROWS && (
        <div className="panel-more">View full list</div>
      )}
    </section>
  );
}

// Purely decorative -- the whole card is the click target (see role="button"
// above); this just hints that it's one.
function ExpandIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      className="expand-icon">
      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m11-5v3a2 2 0 0 1-2 2h-3" />
    </svg>
  );
}

// The bar-chart-style row list, shared between a panel's top-10 slice and the
// "View all" modal's full list -- same look, just a different row count.
export function Rows({ rows, empty }: { rows: Row[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));

  if (rows.length === 0) {
    return (
      <div className="panel-empty">
        <TallyMarks count={3} className="panel-empty-mark" />
        <p className="ink-soft">{empty}</p>
      </div>
    );
  }

  return (
    <ul className="rows">
      {rows.map((r, i) => {
        const title = r.title ?? (typeof r.label === "string" ? r.label : undefined);
        return (
          <li className="row" key={title ?? i}>
            <span className="row-bar" style={{ width: `${(r.value / max) * 100}%` }} />
            <span className="row-label" title={title}>{r.label}</span>
            <span className="row-value num">{r.value.toLocaleString("en-US")}</span>
          </li>
        );
      })}
    </ul>
  );
}

// Downloads whatever rows are currently shown (the panel's top-10 slice, or
// the full list when used inside the "View all" modal) as a two-column CSV.
export function ExportCsvButton({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <button
      type="button"
      className="export-btn"
      title={`Export "${title}" as CSV`}
      aria-label={`Export ${title} as CSV`}
      onClick={(e) => {
        e.stopPropagation(); // sits inside a whole-card click target (see StatList)
        const csvRows = rows.map((r) => ({
          label: r.title ?? (typeof r.label === "string" ? r.label : String(r.value)),
          value: r.value,
        }));
        const csv = rowsToCsv([title, "count"], csvRows);
        const stamp = new Date().toISOString().slice(0, 10);
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        downloadCsv(`tally-${slug}-${stamp}.csv`, csv);
      }}
    >
      <DownloadIcon />
    </button>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12m0 0-4-4m4 4 4-4M4 19h16" />
    </svg>
  );
}

// A little info button next to a section title; click to pop a short blurb.
function InfoDot({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    // stopPropagation: this can sit inside a whole-card click target (see
    // StatList) and shouldn't also trigger it
    <span className="info" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="info-btn"
        aria-label="What is this?"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
      </button>
      {open && (
        <span className="info-pop" role="tooltip">
          {text}
        </span>
      )}
    </span>
  );
}
