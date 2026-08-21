import type { FastifyInstance } from "fastify";
import { openDb } from "../db.js";
import { bearerGuard } from "../auth.js";

// Read side. One endpoint that returns everything the dashboard needs for a
// given site + time range in a single round trip. If this grows we can split
// it, but for now a fat summary object beats six chatty endpoints.

const DAY = 24 * 60 * 60 * 1000;

// each fixed range is a set number of evenly spaced buckets. "all" is handled
// separately below, since its window depends on how far back the data goes.
const RANGES: Record<string, { buckets: number; bucketMs: number }> = {
  "24h": { buckets: 24, bucketMs: 60 * 60 * 1000 },
  "7d": { buckets: 7, bucketMs: DAY },
  "30d": { buckets: 30, bucketMs: DAY },
};

// The window for a stats request: where it starts, the last (aligned) bucket,
// and how wide each bucket is. Fixed ranges read straight off the table; "all"
// runs from the site's first event, with a bucket size that scales to the span
// so the chart never turns into hundreds of points.
function resolveWindow(
  db: ReturnType<typeof openDb>,
  site: string,
  range: string,
): { since: number; nowBucket: number; bucketMs: number } | null {
  if (range === "all") {
    const row = db
      .prepare(`SELECT MIN(ts) AS first FROM events WHERE site_id = ?`)
      .get(site) as { first: number | null };
    const firstTs = row.first ?? Date.now();
    const span = Date.now() - firstTs;
    // daily up to ~2 months, weekly up to ~2 years, monthly beyond that
    const bucketMs = span <= 60 * DAY ? DAY : span <= 730 * DAY ? 7 * DAY : 30 * DAY;
    const nowBucket = Math.floor(Date.now() / bucketMs) * bucketMs;
    const since = Math.floor(firstTs / bucketMs) * bucketMs;
    return { since, nowBucket, bucketMs };
  }

  const cfg = RANGES[range];
  if (!cfg) return null;
  const { buckets, bucketMs } = cfg;
  const nowBucket = Math.floor(Date.now() / bucketMs) * bucketMs;
  return { since: nowBucket - (buckets - 1) * bucketMs, nowBucket, bucketMs };
}

type Query = { site?: string; range?: string };

// Panels only ever show a top-N slice of these breakdowns (see the LIMITs
// below); "View all" in the dashboard re-runs the same grouping without a
// cap so nothing that got tracked looks "missing" just because it fell
// outside the panel's top 10. A generous LIMIT still applies here so one
// pathological site (e.g. thousands of distinct referrer URLs) can't hand
// the dashboard an unbounded response.
const BREAKDOWN_METRICS = {
  pages: `SELECT path AS key, COUNT(*) AS value FROM events
          WHERE site_id = ? AND ts >= ? AND name = 'pageview'
          GROUP BY path ORDER BY value DESC LIMIT 500`,
  referrers: `SELECT referrer AS key, COUNT(*) AS value FROM events
              WHERE site_id = ? AND ts >= ? AND name = 'pageview' AND referrer IS NOT NULL
              GROUP BY referrer ORDER BY value DESC LIMIT 500`,
  browsers: `SELECT browser AS key, COUNT(*) AS value FROM events
             WHERE site_id = ? AND ts >= ? AND name = 'pageview'
             GROUP BY browser ORDER BY value DESC LIMIT 500`,
  systems: `SELECT os AS key, COUNT(*) AS value FROM events
            WHERE site_id = ? AND ts >= ? AND name = 'pageview'
            GROUP BY os ORDER BY value DESC LIMIT 500`,
  devices: `SELECT device AS key, COUNT(*) AS value FROM events
            WHERE site_id = ? AND ts >= ? AND name = 'pageview'
            GROUP BY device ORDER BY value DESC LIMIT 500`,
  countries: `SELECT country AS key, COUNT(*) AS value FROM events
              WHERE site_id = ? AND ts >= ? AND name = 'pageview' AND country IS NOT NULL
              GROUP BY country ORDER BY value DESC LIMIT 500`,
  events: `SELECT name AS key, COUNT(*) AS value FROM events
           WHERE site_id = ? AND ts >= ? AND name <> 'pageview'
           GROUP BY name ORDER BY value DESC LIMIT 500`,
  // The first pageview of each visitor's window, i.e. what page brought them
  // in -- distinct from "top pages" (every view, including internal
  // navigation). ROW_NUMBER over each visitor's events ordered by time gives
  // the earliest row per visitor; keeping only rn=1 before grouping by path
  // is what turns "most-viewed page" into "most common entry page".
  entryPages: `SELECT path AS key, COUNT(*) AS value FROM (
                 SELECT path, ROW_NUMBER() OVER (PARTITION BY visitor_hash ORDER BY ts ASC) AS rn
                 FROM events WHERE site_id = ? AND ts >= ? AND name = 'pageview'
               ) WHERE rn = 1
               GROUP BY path ORDER BY value DESC LIMIT 500`,
} as const;

type BreakdownMetric = keyof typeof BREAKDOWN_METRICS;

export async function statsRoutes(app: FastifyInstance) {
  // Guard the whole read side. Scoped to this plugin, so /api/collect (a
  // separate plugin) stays open. No-ops unless TALLY_TOKEN is set.
  app.addHook("onRequest", bearerGuard);

  // The dashboard asks for this on load to populate its site picker, instead of
  // hard-coding which sites exist. Most active first.
  app.get("/api/sites", async () => {
    const db = openDb();
    const sites = db
      .prepare(
        `SELECT site_id AS site, COUNT(*) AS events, MAX(ts) AS lastSeen
         FROM events GROUP BY site_id ORDER BY lastSeen DESC`,
      )
      .all();
    return { sites };
  });

  app.get("/api/stats", async (req, reply) => {
    const { site, range = "7d" } = req.query as Query;
    if (!site) {
      return reply.code(400).send({ error: "missing site" });
    }

    const db = openDb();
    const win = resolveWindow(db, site, range);
    if (!win) {
      return reply
        .code(400)
        .send({ error: `range must be one of ${[...Object.keys(RANGES), "all"].join(", ")}` });
    }
    // since: window start, aligned to a clean hour/day/bucket boundary.
    // nowBucket: the last bucket. bucketMs: how wide each bucket is.
    const { since, nowBucket, bucketMs } = win;

    // Pageviews count only real pageviews; custom events (name != 'pageview')
    // get their own panel below and must not inflate the traffic numbers.
    // Visitors stay counted across everything -- a person is a person whether
    // they loaded a page or fired an event.
    const totals = db
      .prepare(
        `SELECT COUNT(*) FILTER (WHERE name = 'pageview') AS pageviews,
                COUNT(DISTINCT visitor_hash) AS visitors
         FROM events WHERE site_id = ? AND ts >= ?`,
      )
      .get(site, since) as { pageviews: number; visitors: number };

    // Same-length window immediately before this one, so the dashboard can show
    // "+12% vs last period" next to the headline metrics. Doesn't apply to
    // "all" -- there's no period before all of recorded history.
    let previousTotals: { pageviews: number; visitors: number } | null = null;
    if (range !== "all") {
      const windowMs = nowBucket - since + bucketMs;
      const prevSince = since - windowMs;
      previousTotals = db
        .prepare(
          `SELECT COUNT(*) FILTER (WHERE name = 'pageview') AS pageviews,
                  COUNT(DISTINCT visitor_hash) AS visitors
           FROM events WHERE site_id = ? AND ts >= ? AND ts < ?`,
        )
        .get(site, prevSince, since) as { pageviews: number; visitors: number };
    }

    // Everything from here down describes the traffic, so it's pageviews only.
    const topPages = db
      .prepare(
        `SELECT path, COUNT(*) AS views
         FROM events WHERE site_id = ? AND ts >= ? AND name = 'pageview'
         GROUP BY path ORDER BY views DESC LIMIT 10`,
      )
      .all(site, since);

    const entryPages = db
      .prepare(
        `SELECT path, COUNT(*) AS views FROM (
           SELECT path, ROW_NUMBER() OVER (PARTITION BY visitor_hash ORDER BY ts ASC) AS rn
           FROM events WHERE site_id = ? AND ts >= ? AND name = 'pageview'
         ) WHERE rn = 1
         GROUP BY path ORDER BY views DESC LIMIT 10`,
      )
      .all(site, since);

    const topReferrers = db
      .prepare(
        `SELECT referrer AS source, COUNT(*) AS views
         FROM events WHERE site_id = ? AND ts >= ? AND name = 'pageview' AND referrer IS NOT NULL
         GROUP BY referrer ORDER BY views DESC LIMIT 10`,
      )
      .all(site, since);

    const browsers = db
      .prepare(
        `SELECT browser AS name, COUNT(*) AS views
         FROM events WHERE site_id = ? AND ts >= ? AND name = 'pageview'
         GROUP BY browser ORDER BY views DESC LIMIT 10`,
      )
      .all(site, since);

    const systems = db
      .prepare(
        `SELECT os AS name, COUNT(*) AS views
         FROM events WHERE site_id = ? AND ts >= ? AND name = 'pageview'
         GROUP BY os ORDER BY views DESC LIMIT 10`,
      )
      .all(site, since);

    const devices = db
      .prepare(
        `SELECT device AS name, COUNT(*) AS views
         FROM events WHERE site_id = ? AND ts >= ? AND name = 'pageview'
         GROUP BY device ORDER BY views DESC LIMIT 10`,
      )
      .all(site, since);

    const countries = db
      .prepare(
        `SELECT country AS name, COUNT(*) AS views
         FROM events WHERE site_id = ? AND ts >= ? AND name = 'pageview' AND country IS NOT NULL
         GROUP BY country ORDER BY views DESC LIMIT 10`,
      )
      .all(site, since);

    // Custom events -- anything the site reported with tally('name'). This is
    // the flip side of the pageview filter above: only the non-pageview rows.
    const events = db
      .prepare(
        `SELECT name, COUNT(*) AS count
         FROM events WHERE site_id = ? AND ts >= ? AND name <> 'pageview'
         GROUP BY name ORDER BY count DESC LIMIT 10`,
      )
      .all(site, since);

    // timeseries: count per bucket, then fill in every bucket in the window
    // (empty ones included) so the chart always has exactly `buckets` points,
    // evenly spaced -- no gaps, no stray extra day.
    type Bucket = { bucket: number; pageviews: number; visitors: number };
    const counted = db
      .prepare(
        // CAST forces integer division -- without it SQLite divides in floating
        // point and every event lands in its own bucket instead of snapping.
        `SELECT CAST(ts / ? AS INTEGER) * ? AS bucket,
                COUNT(*) FILTER (WHERE name = 'pageview') AS pageviews,
                COUNT(DISTINCT visitor_hash) AS visitors
         FROM events WHERE site_id = ? AND ts >= ?
         GROUP BY bucket`,
      )
      .all(bucketMs, bucketMs, site, since) as Bucket[];

    const byBucket = new Map(counted.map((b) => [b.bucket, b]));
    const series: Bucket[] = [];
    for (let b = since; b <= nowBucket; b += bucketMs) {
      const hit = byBucket.get(b);
      series.push({ bucket: b, pageviews: hit?.pageviews ?? 0, visitors: hit?.visitors ?? 0 });
    }

    return {
      site,
      range,
      since,
      totals,
      previousTotals,
      topPages,
      entryPages,
      topReferrers,
      browsers,
      systems,
      devices,
      countries,
      events,
      series,
    };
  });

  // Powers the "live now" pulse in the header: visitors seen in the last five
  // minutes. Deliberately its own cheap endpoint (not folded into /api/stats)
  // so the dashboard can poll it on a short interval without re-running the
  // full stats query every time.
  app.get("/api/live", async (req, reply) => {
    const { site } = req.query as Query;
    if (!site) {
      return reply.code(400).send({ error: "missing site" });
    }
    const db = openDb();
    const since = Date.now() - 5 * 60 * 1000;
    const row = db
      .prepare(
        `SELECT COUNT(DISTINCT visitor_hash) AS visitors
         FROM events WHERE site_id = ? AND ts >= ?`,
      )
      .get(site, since) as { visitors: number };
    return { visitors: row.visitors };
  });

  // Backs the "View all" button on each panel: same grouping as above, same
  // site/range window, but without the top-10 cap.
  app.get("/api/stats/breakdown", async (req, reply) => {
    const { site, range = "7d", metric } = req.query as Query & { metric?: string };
    if (!site) {
      return reply.code(400).send({ error: "missing site" });
    }
    if (!metric || !(metric in BREAKDOWN_METRICS)) {
      return reply
        .code(400)
        .send({ error: `metric must be one of ${Object.keys(BREAKDOWN_METRICS).join(", ")}` });
    }

    const db = openDb();
    const win = resolveWindow(db, site, range);
    if (!win) {
      return reply
        .code(400)
        .send({ error: `range must be one of ${[...Object.keys(RANGES), "all"].join(", ")}` });
    }

    const rows = db
      .prepare(BREAKDOWN_METRICS[metric as BreakdownMetric])
      .all(site, win.since);

    return { metric, rows };
  });
}
