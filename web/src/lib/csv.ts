function csvField(v: string | number): string {
  const s = String(v);
  // quote if it has commas/quotes/newlines, otherwise breaks the csv
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
  // BOM so excel doesn't mangle accented chars etc
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
