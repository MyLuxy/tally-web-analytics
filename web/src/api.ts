// Shape of GET /api/stats. Mirrors what the server returns; if the two drift,
// this is the one place to reconcile them.

export type Range = "24h" | "7d" | "30d" | "all";

export type Stats = {
  site: string;
  range: Range;
  since: number;
  totals: { pageviews: number; visitors: number };
  previousTotals: { pageviews: number; visitors: number } | null;
  topPages: { path: string; views: number }[];
  entryPages: { path: string; views: number }[];
  topReferrers: { source: string; views: number }[];
  browsers: { name: string; views: number }[];
  systems: { name: string; views: number }[];
  devices: { name: string; views: number }[];
  countries: { name: string; views: number }[];
  events: { name: string; count: number }[];
  series: { bucket: number; pageviews: number; visitors: number }[];
};

export type Site = { site: string; events: number; lastSeen: number };

// The panels above only show a top-10 slice; this backs each panel's
// "View all" button with the same grouping, uncapped.
export type BreakdownMetric =
  | "pages"
  | "entryPages"
  | "referrers"
  | "browsers"
  | "systems"
  | "devices"
  | "countries"
  | "events";

export type BreakdownRow = { key: string; value: number };

// When the server runs with TALLY_TOKEN set, the read API needs a bearer token.
// We keep whatever the user typed in localStorage and send it along.
const TOKEN_KEY = "tally_token";
export const getToken = () => localStorage.getItem(TOKEN_KEY) ?? "";
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);

// Thrown when the read API answers 401, so the UI can prompt for a token
// instead of showing a generic "couldn't load" error.
export class Unauthorized extends Error {
  constructor() {
    super("unauthorized");
    this.name = "Unauthorized";
  }
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

// Matches whatever `base` the dashboard was built with (see vite.config.ts)
// -- "/" at root (default), or e.g. "/analytics/" when reverse-proxied under
// a sub-path on someone else's domain. Trailing slash stripped so paths
// below don't end up with a doubled "//api/...".
const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function readApi<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (res.status === 401) throw new Unauthorized();
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.error ?? `request failed (${res.status})`);
  }
  return res.json();
}

export async function fetchSites(): Promise<Site[]> {
  const body = await readApi<{ sites: Site[] }>("/api/sites");
  return body.sites;
}

export function fetchStats(site: string, range: Range): Promise<Stats> {
  return readApi<Stats>(`/api/stats?site=${encodeURIComponent(site)}&range=${range}`);
}

// Polled on a short interval for the "live now" pulse in the header -- kept
// separate from fetchStats so refreshing it doesn't re-run (or re-flash) the
// whole dashboard.
export async function fetchLive(site: string): Promise<number> {
  const body = await readApi<{ visitors: number }>(`/api/live?site=${encodeURIComponent(site)}`);
  return body.visitors;
}

export function fetchBreakdown(
  site: string,
  range: Range,
  metric: BreakdownMetric,
): Promise<BreakdownRow[]> {
  return readApi<{ rows: BreakdownRow[] }>(
    `/api/stats/breakdown?site=${encodeURIComponent(site)}&range=${range}&metric=${metric}`,
  ).then((body) => body.rows);
}
