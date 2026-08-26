import type { FastifyInstance } from "fastify";
import { openDb } from "../db.js";
import { bearerGuard } from "../auth.js";
import { categorizeReferrer } from "../referrerCategory.js";

const DAY = 24 * 60 * 60 * 1000;

const RANGES: Record<string, { buckets: number; bucketMs: number }> = {
  "24h": { buckets: 24, bucketMs: 60 * 60 * 1000 },
  "7d": { buckets: 7, bucketMs: DAY },
  "30d": { buckets: 30, bucketMs: DAY },
};

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

// "View all" reruns these without the top-10 cap the dashboard panels use, still limited to 500 tho
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
  // first pageview per visitor = entry page, ROW_NUMBER grabs just that
  entryPages: `SELECT path AS key, COUNT(*) AS value FROM (
                 SELECT path, ROW_NUMBER() OVER (PARTITION BY visitor_hash ORDER BY ts ASC) AS rn
                 FROM events WHERE site_id = ? AND ts >= ? AND name = 'pageview'
               ) WHERE rn = 1
               GROUP BY path ORDER BY value DESC LIMIT 500`,
} as const;

type BreakdownMetric = keyof typeof BREAKDOWN_METRICS;

export async function statsRoutes(app: FastifyInstance) {
  app.addHook("onRequest", bearerGuard); // only guards this plugin, collect stays open

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
    const { since, nowBucket, bucketMs } = win;

    const totals = db
      .prepare(
        `SELECT COUNT(*) FILTER (WHERE name = 'pageview') AS pageviews,
                COUNT(DISTINCT visitor_hash) AS visitors
         FROM events WHERE site_id = ? AND ts >= ?`,
      )
      .get(site, since) as { pageviews: number; visitors: number };

    // for the "+12% vs last period" thing, doesn't make sense for range=all
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

    const topPages = db
      .prepare(
        `SELECT path, COUNT(*) AS views
         FROM events WHERE site_id = ? AND ts >= ? AND name = 'pageview'
         GROUP BY path ORDER BY views DESC LIMIT 10`,
      )
      .all(site, since);

    // uncapped this time, otherwise long-tail referrers get miscounted as direct
    const allReferrers = db
      .prepare(
        `SELECT referrer, COUNT(*) AS views
         FROM events WHERE site_id = ? AND ts >= ? AND name = 'pageview' AND referrer IS NOT NULL
         GROUP BY referrer`,
      )
      .all(site, since) as { referrer: string; views: number }[];

    const trafficSources = { direct: 0, search: 0, social: 0, referral: 0 };
    let referredViews = 0;
    for (const r of allReferrers) {
      trafficSources[categorizeReferrer(r.referrer)] += r.views;
      referredViews += r.views;
    }
    trafficSources.direct = Math.max(0, totals.pageviews - referredViews);

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

    const events = db
      .prepare(
        `SELECT name, COUNT(*) AS count
         FROM events WHERE site_id = ? AND ts >= ? AND name <> 'pageview'
         GROUP BY name ORDER BY count DESC LIMIT 10`,
      )
      .all(site, since);

    type Bucket = { bucket: number; pageviews: number; visitors: number };
    const counted = db
      .prepare(
        // CAST or sqlite does float division and nothing snaps to a bucket right
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
      trafficSources,
      topReferrers,
      browsers,
      systems,
      devices,
      countries,
      events,
      series,
    };
  });

  // separate endpoint so the header can poll this cheaply without rerunning the big query
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
