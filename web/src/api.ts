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
  systems: { name: string; views: number }[];
  devices: { name: string; views: number }[];
  series: { bucket: number; pageviews: number; visitors: number }[];
};

export type Site = { site: string; events: number; lastSeen: number };

export async function fetchSites(): Promise<Site[]> {
  const res = await fetch("/api/sites");
  if (!res.ok) throw new Error(`could not load sites (${res.status})`);
  const body = await res.json();
  return body.sites;
}

export async function fetchStats(site: string, range: Range): Promise<Stats> {
  const res = await fetch(`/api/stats?site=${encodeURIComponent(site)}&range=${range}`);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.error ?? `request failed (${res.status})`);
  }
  return res.json();
}
