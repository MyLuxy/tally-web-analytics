import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { TallyMarks } from "./TallyMarks.js";
import { ClickableCard } from "./ClickableCard.js";
import { Modal } from "./Modal.js";
import { downloadCsv, rowsToCsv } from "../lib/csv.js";

// label can be a node (flag + name etc), title's the plain-text tooltip, code's an optional lookup key separate from the display label
export type Row = { label: ReactNode; value: number; title?: string; code?: string };

const PREVIEW_ROWS = 5;

export function StatList({
  cardKey,
  expanded,
  transitioning,
  title,
  rows,
  empty,
  info,
  onExpand,
  className,
  icon,
}: {
  cardKey: string;
  expanded: boolean;
  transitioning: boolean;
  title: string;
  rows: Row[];
  empty: string;
  info?: string; // optional one-liner explaining the section
  onExpand?: () => void; // cards show a short preview; clicking opens the full list full-screen
  className?: string; // e.g. "card-span-2" -- lets the dashboard's bento grid vary this card's width
  icon?: (row: Row) => ReactNode; // e.g. a referrer's favicon; most lists (pages) have none
}) {
  const clickable = Boolean(onExpand && rows.length > 0);

  const head = (
    <div className="panel-head">
      <h2 className="panel-title">
        {title}
        {info && <InfoDot text={info} />}
      </h2>
      <div className="panel-head-actions">
        {rows.length > 0 && <ExportCsvButton title={title} rows={rows} />}
      </div>
    </div>
  );

  const body = (
    // card-content-list skips the shared view transition, a 5-row preview morphing into a hundred-row list just looks like the bars jumping
    <div className="card-content card-content-list">
      <Rows rows={rows.slice(0, PREVIEW_ROWS)} empty={empty} icon={icon} />
    </div>
  );

  if (!clickable) {
    return (
      <section className={`panel${className ? ` ${className}` : ""}`}>
        {head}
        {body}
      </section>
    );
  }

  return (
    <ClickableCard
      cardKey={cardKey}
      expanded={expanded}
      transitioning={transitioning}
      onExpand={onExpand!}
      ariaLabel={`${title}: view all`}
      className={className}
    >
      {head}
      {body}
    </ClickableCard>
  );
}


export function Rows({ rows, empty, icon }: { rows: Row[]; empty: string; icon?: (row: Row) => ReactNode }) {
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
            <span className="row-label" title={title}>
              {icon && <span className="row-icon">{icon(r)}</span>}
              <span className="row-label-text">{r.label}</span>
            </span>
            <span className="row-value num">{r.value.toLocaleString("en-US")}</span>
          </li>
        );
      })}
    </ul>
  );
}

// confirm step first, this sits inside a whole-card click target and a stray click shouldn't silently download a file
export function ExportCsvButton({ title, rows }: { title: string; rows: Row[] }) {
  const [confirming, setConfirming] = useState(false);

  function download() {
    const csvRows = rows.map((r) => ({
      label: r.title ?? (typeof r.label === "string" ? r.label : String(r.value)),
      value: r.value,
    }));
    const csv = rowsToCsv([title, "count"], csvRows);
    const stamp = new Date().toISOString().slice(0, 10);
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    downloadCsv(`tally-${slug}-${stamp}.csv`, csv);
  }

  return (
    <>
      <button
        type="button"
        className="export-btn"
        title={`Export "${title}" as CSV`}
        aria-label={`Export ${title} as CSV`}
        onClick={(e) => {
          e.stopPropagation(); // sits inside a whole-card click target (see StatList)
          setConfirming(true);
        }}
      >
        <DownloadIcon />
      </button>
      {confirming && (
        <ExportConfirm
          title={title}
          count={rows.length}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            download();
          }}
        />
      )}
    </>
  );
}

function ExportConfirm({
  title,
  count,
  onCancel,
  onConfirm,
}: {
  title: string;
  count: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal title="Export CSV" onClose={onCancel}>
      <p className="ink-soft">
        Download &ldquo;{title}&rdquo; as a CSV file? {count} row{count === 1 ? "" : "s"}.
      </p>
      <div className="confirm-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn-primary" onClick={onConfirm}>
          Download
        </button>
      </div>
    </Modal>
  );
}

function DownloadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12m0 0-4-4m4 4 4-4M4 19h16" />
    </svg>
  );
}

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
    <span className="info" ref={ref} onClick={(e) => e.stopPropagation()}> {/* sits inside a whole-card click target */}
      <button
        type="button"
        className="info-btn"
        aria-label="What is this?"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg
          width="20"
          height="20"
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
