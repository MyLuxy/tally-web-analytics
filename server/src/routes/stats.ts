import type { FastifyInstance } from "fastify";
import { openDb } from "../db.js";
import { bearerGuard } from "../auth.js";

// Read side. One endpoint that returns everything the dashboard needs for a
// given site + time range in a single round trip. If this grows we can split
// it, but for now a fat summary object beats six chatty endpoints.

// each range is a fixed number of evenly spaced buckets
const RANGES: Record<string, { buckets: number; bucketMs: number }> = {
  "24h": { buckets: 24, bucketMs: 60 * 60 * 1000 },
  "7d": { buckets: 7, bucketMs: 24 * 60 * 60 * 1000 },
  "30d": { buckets: 30, bucketMs: 24 * 60 * 60 * 1000 },
};

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

    const cfg = RANGES[range];
    if (!cfg) {
      return reply
        .code(400)
        .send({ error: `range must be one of ${Object.keys(RANGES).join(", ")}` });
    }

    const db = openDb();
    const { buckets, bucketMs } = cfg;
    // align "now" down to the current bucket, then step back N-1 buckets, so the
    // window always lands on clean hour/day boundaries
    const nowBucket = Math.floor(Date.now() / bucketMs) * bucketMs;
    const since = nowBucket - (buckets - 1) * bucketMs;

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
