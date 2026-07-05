import type { FastifyInstance, FastifyRequest } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { insertEvent } from "../db.js";
import { optedOut, parseUserAgent, visitorHash } from "../privacy.js";

// What the tracker sends us. Everything except `site` is optional so a busted
// or partial payload still counts as a pageview instead of being dropped.
type Payload = {
  site?: string;
  name?: string;
  path?: string;
  referrer?: string | null;
};

// We only keep the path, never the query string -- query params are where the
// personal stuff (emails in links, tokens, utm noise) tends to hide.
function cleanPath(raw: string | undefined): string {
  if (!raw) return "/";
  try {
    // raw may be a full url or just a path; URL needs a base for the latter
    const u = new URL(raw, "http://x");
    return u.pathname || "/";
  } catch {
    return "/";
  }
}

// Keep only the referrer's host. We care that traffic came from twitter.com,
// not which exact tweet.
function referrerHost(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).host || null;
  } catch {
    return null;
  }
}

function clientIp(req: FastifyRequest): string {
  // Behind a proxy you'd trust x-forwarded-for; locally req.ip is fine. Note
  // the IP never gets stored -- it only feeds the daily visitor hash.
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0]!.trim();
  return req.ip;
}

// Let the edge tell us the country. Cloudflare, Vercel and Fastly all resolve
// it from the IP at their edge and pass a 2-letter code header, so we get
// country without ever looking at -- let alone storing -- the IP ourselves.
function country(req: FastifyRequest): string | null {
  const h = req.headers;
  const raw = h["cf-ipcountry"] ?? h["x-vercel-ip-country"] ?? h["x-country-code"];
  const code = (typeof raw === "string" ? raw : "").trim().toUpperCase();
  // Cloudflare sends "XX" for unknown and "T1"/"A1" for Tor/anonymous proxies
  if (!/^[A-Z]{2}$/.test(code) || code === "XX") return null;
  return code;
}

export async function collectRoutes(app: FastifyInstance) {
  // Collect has to stay open to the world, which also means anyone can hammer
  // it. Cap how fast a single IP can post so a runaway script (or a hostile
  // one) can't flood the endpoint, skew the stats and bloat the db. Scoped to
  // this plugin, so the dashboard API isn't affected. Both knobs are env-tunable
  // for busy sites, or sites sitting behind a shared NAT. The limiter keys on
  // req.ip, which trustProxy already resolves to the real client behind a proxy.
  await app.register(rateLimit, {
    max: Number(process.env.TALLY_RATE_MAX ?? 120),
    timeWindow: process.env.TALLY_RATE_WINDOW ?? "1 minute",
  });

  app.post("/api/collect", async (req, reply) => {
    if (optedOut(req.headers)) {
      // honour the opt-out, but don't make the tracker look broken
      return reply.code(202).send();
    }

    const body = (req.body ?? {}) as Payload;
    const site = body.site?.trim();
    if (!site) {
      return reply.code(400).send({ error: "missing site" });
    }

    const ua = req.headers["user-agent"] ?? "";
    const { browser, os, device } = parseUserAgent(ua);

    insertEvent({
      site_id: site,
      name: body.name?.trim() || "pageview",
      path: cleanPath(body.path),
      referrer: referrerHost(body.referrer),
      visitor_hash: visitorHash(site, clientIp(req), ua),
      browser,
      os,
      device,
      country: country(req),
      ts: Date.now(),
    });

    // 204: the browser fired this with sendBeacon and isn't listening anyway.
    return reply.code(204).send();
  });
}
