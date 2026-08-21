// Client-side CSV export for a stat panel's rows -- no server round trip,
// since the dashboard already has the data in hand.

function csvField(v: string | number): string {
  const s = String(v);
  // quote (and escape embedded quotes in) anything that would otherwise break
  // the column structure -- commas, quotes, or a literal newline in the value
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rowsToCsv(header: [string, string], rows: { label: string; value: number }[]): string {
  const lines = [
    header.map(csvField).join(","),
    ...rows.map((r) => [csvField(r.label), csvField(r.value)].join(",")),
  ];
  return lines.join("\r\n");
}

export function downloadCsv(filename: string, csv: string) {
  // a BOM so Excel (which guesses encoding from the first bytes, not a
  // declared charset) doesn't mangle any non-ASCII labels
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
