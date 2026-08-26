import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

// inject() against a throwaway in-memory db, exercises the real routing/parsing/hashing, not just the helpers
process.env.TALLY_DB = ":memory:";

import { buildApp } from "../index.js";
import { openDb, insertEvent } from "../db.js";

let app: Awaited<ReturnType<typeof buildApp>>;

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
    expect(stats.topPages).toContainEqual({ path: "/home", views: 1 }); // query string dropped
    expect(stats.topReferrers).toContainEqual({ source: "twitter.com", views: 1 }); // reduced to host
    expect(stats.browsers).toContainEqual({ name: "Chrome", views: 1 });
    expect(stats.systems).toContainEqual({ name: "Windows", views: 1 });
    expect(stats.devices).toContainEqual({ name: "desktop", views: 1 });
  });

  it("keeps custom events out of the traffic numbers and lists them on their own", async () => {
    await collect({ site: "s1", path: "/pricing" });
    await collect({ site: "s1", name: "signup", path: "/pricing" });

    const stats = (await app.inject({ url: "/api/stats?site=s1&range=7d" })).json();
    expect(stats.totals).toEqual({ pageviews: 1, visitors: 1 }); // custom event doesn't count as a view
    expect(stats.topPages).toContainEqual({ path: "/pricing", views: 1 });
    expect(stats.events).toContainEqual({ name: "signup", count: 1 });
    expect(stats.events).not.toContainEqual({ name: "pageview", count: expect.anything() });
  });

  it("drops self-referrals so your own domain isn't in the referrers", async () => {
    // referrer host == page's own host, same as the browser's Origin on internal nav
    await app.inject({
      method: "POST",
      url: "/api/collect",
      headers: { "user-agent": CHROME_UA, origin: "https://mysite.com" },
      payload: { site: "s1", path: "/b", referrer: "https://mysite.com/a" },
    });
    await collect({ site: "s1", path: "/c", referrer: "https://twitter.com/x" }, { origin: "https://mysite.com" });

    const stats = (await app.inject({ url: "/api/stats?site=s1&range=7d" })).json();
    expect(stats.topReferrers).toEqual([{ source: "twitter.com", views: 1 }]); // internal nav dropped
    expect(stats.totals.pageviews).toBe(2); // but both still counted as pageviews
  });

  it("rejects a payload with no site", async () => {
    const res = await collect({ path: "/x" });
    expect(res.statusCode).toBe(400);
  });

  it("accepts a sendBeacon body (JSON posted as text/plain)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/collect",
      headers: { "content-type": "text/plain", "user-agent": CHROME_UA },
      payload: JSON.stringify({ site: "beacon", path: "/" }),
    });
    expect(res.statusCode).toBe(204);

    const stats = (await app.inject({ url: "/api/stats?site=beacon&range=7d" })).json();
    expect(stats.totals.pageviews).toBe(1);
  });

  it("picks up the country from an edge header", async () => {
    await collect({ site: "s1", path: "/" }, { "cf-ipcountry": "it" });
    const stats = (await app.inject({ url: "/api/stats?site=s1&range=7d" })).json();
    expect(stats.countries).toContainEqual({ name: "IT", views: 1 });
  });

  it("leaves country out when the edge says it's unknown", async () => {
    await collect({ site: "s1", path: "/" }, { "cf-ipcountry": "XX" });
    const stats = (await app.inject({ url: "/api/stats?site=s1&range=7d" })).json();
    expect(stats.countries).toEqual([]);
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

  it("rate-limits an IP that floods the endpoint", async () => {
    // own app instance so we don't burn the shared one's rate-limit budget
    process.env.TALLY_RATE_MAX = "2";
    const limited = await buildApp();
    try {
      expect((await limited.inject({ method: "POST", url: "/api/collect", headers: { "user-agent": CHROME_UA }, payload: { site: "s1", path: "/" } })).statusCode).toBe(204);
      expect((await limited.inject({ method: "POST", url: "/api/collect", headers: { "user-agent": CHROME_UA }, payload: { site: "s1", path: "/" } })).statusCode).toBe(204);
      const over = await limited.inject({ method: "POST", url: "/api/collect", headers: { "user-agent": CHROME_UA }, payload: { site: "s1", path: "/" } }); // third hit, over the limit
      expect(over.statusCode).toBe(429);
    } finally {
      await limited.close();
      delete process.env.TALLY_RATE_MAX;
    }
  });

  it("counts repeat hits from the same visitor as one unique", async () => {
    // same IP+UA+day => same visitor_hash
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

  it("range=all reaches back to the very first event", async () => {
    // insertEvent backdates ts directly, past any fixed window -- collect route can't do that
    const old = Date.now() - 400 * 24 * 60 * 60 * 1000;
    insertEvent({
      site_id: "s1", name: "pageview", path: "/ancient", referrer: null,
      visitor_hash: "old-visitor", browser: "Chrome", os: "Windows", device: "desktop",
      country: null, ts: old,
    });
    await collect({ site: "s1", path: "/today" });

    const week = (await app.inject({ url: "/api/stats?site=s1&range=7d" })).json();
    expect(week.totals.pageviews).toBe(1);

    const all = (await app.inject({ url: "/api/stats?site=s1&range=all" })).json();
    expect(all.totals.pageviews).toBe(2);
    expect(all.since).toBeLessThanOrEqual(old);
    expect(all.series.length).toBeGreaterThan(1);
  });
});

describe("entryPages in GET /api/stats", () => {
  it("counts each visitor's first pageview, not every page they viewed", async () => {
    const now = Date.now();
    // strictly increasing ts so "first pageview" ordering can't come down to same-millisecond luck
    insertEvent({
      site_id: "s1", name: "pageview", path: "/a", referrer: null,
      visitor_hash: "visitor-1", browser: "Chrome", os: "Windows", device: "desktop",
      country: null, ts: now,
    });
    insertEvent({
      site_id: "s1", name: "pageview", path: "/b", referrer: null,
      visitor_hash: "visitor-1", browser: "Chrome", os: "Windows", device: "desktop",
      country: null, ts: now + 1000,
    });
    insertEvent({
      site_id: "s1", name: "pageview", path: "/b", referrer: null,
      visitor_hash: "visitor-2", browser: "Chrome", os: "Windows", device: "desktop",
      country: null, ts: now,
    });

    const stats = (await app.inject({ url: "/api/stats?site=s1&range=7d" })).json();

    // top pages: /b was viewed twice (visitor 1's second page + visitor 2's only page)
    const pageB = stats.topPages.find((p: { path: string }) => p.path === "/b");
    expect(pageB.views).toBe(2);

    // entry pages: /a and /b each brought in exactly one visitor
    const entryA = stats.entryPages.find((p: { path: string }) => p.path === "/a");
    const entryB = stats.entryPages.find((p: { path: string }) => p.path === "/b");
    expect(entryA.views).toBe(1);
    expect(entryB.views).toBe(1);
  });
});

describe("trafficSources in GET /api/stats", () => {
  it("splits pageviews into direct/search/social/referral", async () => {
    await collect({ site: "s1", path: "/", referrer: "https://www.google.com/search?q=x" });
    await collect({ site: "s1", path: "/", referrer: "https://t.co/abc" });
    await collect({ site: "s1", path: "/", referrer: "https://some-blog.example/post" });
    await collect({ site: "s1", path: "/" }); // no referrer -> direct

    const stats = (await app.inject({ url: "/api/stats?site=s1&range=7d" })).json();
    expect(stats.trafficSources).toEqual({ direct: 1, search: 1, social: 1, referral: 1 });
  });
});

describe("GET /api/live", () => {
  it("needs a site", async () => {
    expect((await app.inject({ url: "/api/live" })).statusCode).toBe(400);
  });

  it("counts distinct visitors from the last five minutes only", async () => {
    const stale = Date.now() - 10 * 60 * 1000;
    insertEvent({
      site_id: "s1", name: "pageview", path: "/old", referrer: null,
      visitor_hash: "stale-visitor", browser: "Chrome", os: "Windows", device: "desktop",
      country: null, ts: stale,
    });
    await collect({ site: "s1", path: "/now" });

    const { visitors } = (await app.inject({ url: "/api/live?site=s1" })).json();
    expect(visitors).toBe(1);
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
