// Shape of GET /api/stats. Mirrors what the server returns; if the two drift,
// this is the one place to reconcile them.

export type Range = "24h" | "7d" | "30d";

export type Stats = {
  site: string;
  range: Range;
  since: number;
  totals: { pageviews: number; visitors: number };
  topPages: { path: string; views: number }[];
  topReferrers: { source: string; views: number }[];
  browsers: { name: string; views: number }[];
  series: { bucket: number; pageviews: number; visitors: number }[];
};

export async function fetchStats(site: string, range: Range): Promise<Stats> {
  const res = await fetch(`/api/stats?site=${encodeURIComponent(site)}&range=${range}`);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.error ?? `request failed (${res.status})`);
  }
  return res.json();
}
