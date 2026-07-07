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

    // Everything from here down describes the traffic, so it's pageviews only.
    const topPages = db
      .prepare(
        `SELECT path, COUNT(*) AS views
         FROM events WHERE site_id = ? AND ts >= ? AND name = 'pageview'
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
         GROUP BY browser ORDER BY views DESC`,
      )
      .all(site, since);

    const systems = db
      .prepare(
        `SELECT os AS name, COUNT(*) AS views
         FROM events WHERE site_id = ? AND ts >= ? AND name = 'pageview'
         GROUP BY os ORDER BY views DESC`,
      )
      .all(site, since);

    const devices = db
      .prepare(
        `SELECT device AS name, COUNT(*) AS views
         FROM events WHERE site_id = ? AND ts >= ? AND name = 'pageview'
         GROUP BY device ORDER BY views DESC`,
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
      topPages,
      topReferrers,
      browsers,
      systems,
      devices,
      countries,
      events,
      series,
    };
  });
}
