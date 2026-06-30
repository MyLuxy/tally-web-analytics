import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

// Optional bearer-token protection for the read API. Set TALLY_TOKEN to lock
// down /api/stats and /api/sites; leave it unset and everything stays open,
// which is what you want for a local demo. The collect endpoint is never
// guarded -- the tracker has to be able to post from anywhere.

// Compare in constant time so a wrong token can't be narrowed down by timing
// how long the check takes. Bail on a length mismatch first, since
// timingSafeEqual throws on differing lengths.
export function tokenMatches(authHeader: string | undefined, expected: string): boolean {
  if (!authHeader) return false;
  const got = Buffer.from(authHeader);
  const want = Buffer.from(`Bearer ${expected}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

// onRequest hook. Reads the env on each request on purpose -- keeps it trivial
// to flip auth on and off in tests without rebuilding the app.
export async function bearerGuard(req: FastifyRequest, reply: FastifyReply) {
  const expected = process.env.TALLY_TOKEN;
  if (!expected) return; // auth disabled
  if (!tokenMatches(req.headers.authorization, expected)) {
    return reply.code(401).send({ error: "unauthorized" });
  }
}
