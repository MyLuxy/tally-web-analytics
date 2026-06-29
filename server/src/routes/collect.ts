import type { FastifyInstance, FastifyRequest } from "fastify";
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

export async function collectRoutes(app: FastifyInstance) {
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
      ts: Date.now(),
    });

    // 204: the browser fired this with sendBeacon and isn't listening anyway.
    return reply.code(204).send();
  });
}
