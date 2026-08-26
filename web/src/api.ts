export type Range = "24h" | "7d" | "30d" | "all";

export type Stats = {
  site: string;
  range: Range;
  since: number;
  totals: { pageviews: number; visitors: number };
  previousTotals: { pageviews: number; visitors: number } | null;
  topPages: { path: string; views: number }[];
  entryPages: { path: string; views: number }[];
  trafficSources: { direct: number; search: number; social: number; referral: number };
  topReferrers: { source: string; views: number }[];
  browsers: { name: string; views: number }[];
  systems: { name: string; views: number }[];
  devices: { name: string; views: number }[];
  countries: { name: string; views: number }[];
  events: { name: string; count: number }[];
  series: { bucket: number; pageviews: number; visitors: number }[];
};

export type Site = { site: string; events: number; lastSeen: number };

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

const TOKEN_KEY = "tally_token";
export const getToken = () => localStorage.getItem(TOKEN_KEY) ?? "";
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);

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

// strip trailing slash or we get a double // in the api paths below
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

export function fetchBreakdown(
  site: string,
  range: Range,
  metric: BreakdownMetric,
): Promise<BreakdownRow[]> {
  return readApi<{ rows: BreakdownRow[] }>(
    `/api/stats/breakdown?site=${encodeURIComponent(site)}&range=${range}&metric=${metric}`,
  ).then((body) => body.rows);
}
