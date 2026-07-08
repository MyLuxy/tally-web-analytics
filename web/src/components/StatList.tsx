import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { TallyMarks } from "./TallyMarks.js";

// Ledger-style breakdown: a label, a count, and a faint bar behind each row
// scaled to the leader. Used for pages, referrers and browsers alike.

// label can be a node (e.g. a flag + name); title is the plain-text tooltip.
export type Row = { label: ReactNode; value: number; title?: string };

export function StatList({
  title,
  unit,
  rows,
  empty,
  info,
}: {
  title: string;
  unit: string;
  rows: Row[];
  empty: string;
  info?: string; // optional one-liner explaining the section
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="panel-title">
          {title}
          {info && <InfoDot text={info} />}
        </h2>
        {/* the unit ("views") is a fixed label -- keep browser auto-translate off it */}
        <span className="eyebrow" translate="no">{unit}</span>
      </div>

      {rows.length === 0 ? (
        <div className="panel-empty">
          <TallyMarks count={3} className="panel-empty-mark" />
          <p className="ink-soft">{empty}</p>
        </div>
      ) : (
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
      )}
    </section>
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
    <span className="info" ref={ref}>
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
