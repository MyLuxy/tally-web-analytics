import type { FastifyInstance, FastifyRequest } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { insertEvent } from "../db.js";
import { optedOut, parseUserAgent, visitorHash } from "../privacy.js";

type Payload = {
  site?: string;
  name?: string;
  path?: string;
  referrer?: string | null;
};

// strip query string, that's where emails/tokens/utm junk hides
function cleanPath(raw: string | undefined): string {
  if (!raw) return "/";
  try {
    const u = new URL(raw, "http://x");
    return u.pathname || "/";
  } catch {
    return "/";
  }
}

function referrerHost(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).host || null;
  } catch {
    return null;
  }
}

// origin header tells us what site the tracker's running on, used to catch self-referrals
function pageHost(req: FastifyRequest): string | null {
  const raw = req.headers["origin"] ?? req.headers["referer"];
  if (typeof raw !== "string") return null;
  try {
    return new URL(raw).host || null;
  } catch {
    return null;
  }
}

function clientIp(req: FastifyRequest): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0]!.trim();
  return req.ip;
}

// cloudflare/vercel/fastly resolve country from ip at the edge and pass a header, so we
// get the country without touching the ip ourselves
function country(req: FastifyRequest): string | null {
  const h = req.headers;
  const raw = h["cf-ipcountry"] ?? h["x-vercel-ip-country"] ?? h["x-country-code"];
  const code = (typeof raw === "string" ? raw : "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || code === "XX") return null; // XX = cloudflare unknown
  return code;
}

export async function collectRoutes(app: FastifyInstance) {
  // rate limit because this endpoint's public and someone could spam it
  await app.register(rateLimit, {
    max: Number(process.env.TALLY_RATE_MAX ?? 120),
    timeWindow: process.env.TALLY_RATE_WINDOW ?? "1 minute",
  });

  app.post("/api/collect", async (req, reply) => {
    if (optedOut(req.headers)) {
      return reply.code(202).send(); // pretend it worked, don't break the tracker
    }

    const body = (req.body ?? {}) as Payload;
    const site = body.site?.trim();
    if (!site) {
      return reply.code(400).send({ error: "missing site" });
    }

    const ua = req.headers["user-agent"] ?? "";
    const { browser, os, device } = parseUserAgent(ua);

    // drop self-referrals, internal nav shouldn't show up as a referrer
    let referrer = referrerHost(body.referrer);
    if (referrer && referrer === pageHost(req)) referrer = null;

    insertEvent({
      site_id: site,
      name: body.name?.trim() || "pageview",
      path: cleanPath(body.path),
      referrer,
      visitor_hash: visitorHash(site, clientIp(req), ua),
      browser,
      os,
      device,
      country: country(req),
      ts: Date.now(),
    });

    return reply.code(204).send(); // sendBeacon doesn't care about the response anyway
  });
}
