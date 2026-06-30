import type { FastifyInstance } from "fastify";
import { openDb } from "../db.js";
import { bearerGuard } from "../auth.js";

// Read side. One endpoint that returns everything the dashboard needs for a
// given site + time range in a single round trip. If this grows we can split
// it, but for now a fat summary object beats six chatty endpoints.

const RANGES: Record<string, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
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

    const window = RANGES[range];
    if (!window) {
      return reply
        .code(400)
        .send({ error: `range must be one of ${Object.keys(RANGES).join(", ")}` });
    }

    const db = openDb();
    const since = Date.now() - window;
    // bucket by hour for the last day, by day otherwise -- keeps the chart
    // readable at both ends instead of 720 hourly points for a month.
    const bucketMs = range === "24h" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

    const totals = db
      .prepare(
        `SELECT COUNT(*) AS pageviews, COUNT(DISTINCT visitor_hash) AS visitors
         FROM events WHERE site_id = ? AND ts >= ?`,
      )
      .get(site, since) as { pageviews: number; visitors: number };

    const topPages = db
      .prepare(
        `SELECT path, COUNT(*) AS views
         FROM events WHERE site_id = ? AND ts >= ?
         GROUP BY path ORDER BY views DESC LIMIT 10`,
      )
      .all(site, since);

    const topReferrers = db
      .prepare(
        `SELECT referrer AS source, COUNT(*) AS views
         FROM events WHERE site_id = ? AND ts >= ? AND referrer IS NOT NULL
         GROUP BY referrer ORDER BY views DESC LIMIT 10`,
      )
      .all(site, since);

    const browsers = db
      .prepare(
        `SELECT browser AS name, COUNT(*) AS views
         FROM events WHERE site_id = ? AND ts >= ?
         GROUP BY browser ORDER BY views DESC`,
      )
      .all(site, since);

    const systems = db
      .prepare(
        `SELECT os AS name, COUNT(*) AS views
         FROM events WHERE site_id = ? AND ts >= ?
         GROUP BY os ORDER BY views DESC`,
      )
      .all(site, since);

    const devices = db
      .prepare(
        `SELECT device AS name, COUNT(*) AS views
         FROM events WHERE site_id = ? AND ts >= ?
         GROUP BY device ORDER BY views DESC`,
      )
      .all(site, since);

    // timeseries: floor each event's ts to its bucket and count per bucket
    const series = db
      .prepare(
        // CAST forces integer division -- without it SQLite divides in floating
        // point and every event lands in its own bucket instead of snapping to
        // the hour/day boundary.
        `SELECT CAST(ts / ? AS INTEGER) * ? AS bucket,
                COUNT(*) AS pageviews,
                COUNT(DISTINCT visitor_hash) AS visitors
         FROM events WHERE site_id = ? AND ts >= ?
         GROUP BY bucket ORDER BY bucket ASC`,
      )
      .all(bucketMs, bucketMs, site, since);

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
      series,
    };
  });
}
