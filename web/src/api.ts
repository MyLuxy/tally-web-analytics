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

async function readApi<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: authHeaders() });
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
