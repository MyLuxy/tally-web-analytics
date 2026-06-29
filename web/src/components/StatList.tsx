import { TallyMarks } from "./TallyMarks.js";

// Ledger-style breakdown: a label, a count, and a faint bar behind each row
// scaled to the leader. Used for pages, referrers and browsers alike.

export type Row = { label: string; value: number };

export function StatList({
  title,
  unit,
  rows,
  empty,
}: {
  title: string;
  unit: string;
  rows: Row[];
  empty: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="panel-title">{title}</h2>
        <span className="eyebrow">{unit}</span>
      </div>

      {rows.length === 0 ? (
        <div className="panel-empty">
          <TallyMarks count={3} className="panel-empty-mark" />
          <p className="ink-soft">{empty}</p>
        </div>
      ) : (
        <ul className="rows">
          {rows.map((r) => (
            <li className="row" key={r.label}>
              <span className="row-bar" style={{ width: `${(r.value / max) * 100}%` }} />
              <span className="row-label" title={r.label}>{r.label}</span>
              <span className="row-value num">{r.value.toLocaleString("en-US")}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
