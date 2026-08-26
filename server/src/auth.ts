import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

// set TALLY_TOKEN to lock down /api/stats and /api/sites, unset = open (fine for local)
// collect is never guarded, tracker needs to post from anywhere

// constant time compare to avoid timing attacks on the token
export function tokenMatches(authHeader: string | undefined, expected: string): boolean {
  if (!authHeader) return false;
  const got = Buffer.from(authHeader);
  const want = Buffer.from(`Bearer ${expected}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function bearerGuard(req: FastifyRequest, reply: FastifyReply) {
  const expected = process.env.TALLY_TOKEN;
  if (!expected) return; // auth disabled
  if (!tokenMatches(req.headers.authorization, expected)) {
    return reply.code(401).send({ error: "unauthorized" });
  }
}
