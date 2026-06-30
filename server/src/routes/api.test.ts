import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Drive the whole app in-process with inject(), against a throwaway in-memory
// db. This exercises the real wiring -- routing, body parsing, the privacy
// hashing and UA parsing -- not just the helpers in isolation.
process.env.TALLY_DB = ":memory:";

import { buildApp } from "../index.js";
import { openDb } from "../db.js";

let app: Awaited<ReturnType<typeof buildApp>>;

// A Chrome-on-Windows desktop string, so we can assert the breakdowns too.
const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

function collect(payload: unknown, headers: Record<string, string> = {}) {
  return app.inject({
    method: "POST",
    url: "/api/collect",
    payload: payload as object,
    headers: { "user-agent": CHROME_UA, ...headers },
  });
}

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  // each test starts from an empty db
  openDb().exec("DELETE FROM events; DELETE FROM salts;");
});

describe("POST /api/collect", () => {
  it("records a pageview and surfaces it in the stats", async () => {
    const res = await collect({
      site: "s1",
      path: "/home?token=secret",
      referrer: "https://twitter.com/someone/status/1",
    });
    expect(res.statusCode).toBe(204);

    const stats = (await app.inject({ url: "/api/stats?site=s1&range=7d" })).json();
    expect(stats.totals).toEqual({ pageviews: 1, visitors: 1 });
    // query string dropped, only the path is kept
    expect(stats.topPages).toContainEqual({ path: "/home", views: 1 });
    // referrer reduced to its host
    expect(stats.topReferrers).toContainEqual({ source: "twitter.com", views: 1 });
    // UA parsed into the breakdowns
    expect(stats.browsers).toContainEqual({ name: "Chrome", views: 1 });
    expect(stats.systems).toContainEqual({ name: "Windows", views: 1 });
    expect(stats.devices).toContainEqual({ name: "desktop", views: 1 });
  });

  it("rejects a payload with no site", async () => {
    const res = await collect({ path: "/x" });
    expect(res.statusCode).toBe(400);
  });

  it("honours a Do-Not-Track opt-out without storing anything", async () => {
    const res = await collect({ site: "s1", path: "/x" }, { dnt: "1" });
    expect(res.statusCode).toBe(202); // not an error -- the tracker shouldn't look broken

    const stats = (await app.inject({ url: "/api/stats?site=s1&range=7d" })).json();
    expect(stats.totals.pageviews).toBe(0);
  });

  it("honours Global Privacy Control the same way", async () => {
    const res = await collect({ site: "s1", path: "/x" }, { "sec-gpc": "1" });
    expect(res.statusCode).toBe(202);
  });

  it("counts repeat hits from the same visitor as one unique", async () => {
    // same IP + UA + day => same visitor_hash, so pageviews climb but visitors don't
    await collect({ site: "s1", path: "/a" });
    await collect({ site: "s1", path: "/b" });

    const stats = (await app.inject({ url: "/api/stats?site=s1&range=7d" })).json();
    expect(stats.totals.pageviews).toBe(2);
    expect(stats.totals.visitors).toBe(1);
  });
});

describe("GET /api/stats", () => {
  it("needs a site", async () => {
    expect((await app.inject({ url: "/api/stats" })).statusCode).toBe(400);
  });

  it("rejects an unknown range", async () => {
    expect((await app.inject({ url: "/api/stats?site=s1&range=99y" })).statusCode).toBe(400);
  });
});

describe("GET /api/sites", () => {
  it("lists the sites that have events, with their counts", async () => {
    await collect({ site: "alpha", path: "/" });
    await collect({ site: "beta", path: "/" });
    await collect({ site: "beta", path: "/" });

    const { sites } = (await app.inject({ url: "/api/sites" })).json();
    const names = sites.map((s: { site: string }) => s.site);
    expect(names).toContain("alpha");
    expect(names).toContain("beta");
    expect(sites.find((s: { site: string }) => s.site === "beta").events).toBe(2);
  });
});

describe("bearer auth on the read API", () => {
  // bearerGuard reads TALLY_TOKEN per request, so we can toggle it here
  afterEach(() => {
    delete process.env.TALLY_TOKEN;
  });

  it("is open when no token is configured", async () => {
    expect((await app.inject({ url: "/api/sites" })).statusCode).toBe(200);
  });

  it("rejects the read API without the right token", async () => {
    process.env.TALLY_TOKEN = "s3cret";
    expect((await app.inject({ url: "/api/sites" })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/stats?site=s1&range=7d" })).statusCode).toBe(401);
    const wrong = await app.inject({
      url: "/api/sites",
      headers: { authorization: "Bearer nope" },
    });
    expect(wrong.statusCode).toBe(401);
  });

  it("allows the read API with the right token", async () => {
    process.env.TALLY_TOKEN = "s3cret";
    const res = await app.inject({
      url: "/api/sites",
      headers: { authorization: "Bearer s3cret" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("never guards collect, even with a token set", async () => {
    process.env.TALLY_TOKEN = "s3cret";
    const res = await collect({ site: "s1", path: "/" });
    expect(res.statusCode).toBe(204);
  });
});
