// Fills the database with believable demo traffic so the dashboard has
// something to show. Spreads events across the last 30 days (with extra weight
// on the last 24h) and reuses a pool of visitor hashes per day so the
// unique-visitor counts come out sensible instead of equal to pageviews.
//
//   npm run seed              -> seeds the default db for site "demo"
//   TALLY_DB=foo.sqlite npm run seed
import { randomBytes } from "node:crypto";
import { insertEvent } from "../src/db.js";

const SITE = process.argv[2] ?? "demo";

const PATHS = ["/", "/", "/pricing", "/blog/privacy-first-analytics", "/blog/hello-world", "/docs", "/about"];
const REFERRERS = [null, null, null, "google.com", "news.ycombinator.com", "twitter.com", "github.com", "reddit.com"];
const AGENTS = [
  { browser: "Chrome", os: "Windows", device: "desktop" },
  { browser: "Chrome", os: "Android", device: "mobile" },
  { browser: "Safari", os: "iOS", device: "mobile" },
  { browser: "Safari", os: "macOS", device: "desktop" },
  { browser: "Firefox", os: "Linux", device: "desktop" },
  { browser: "Edge", os: "Windows", device: "desktop" },
];

// weighted toward a couple of countries, with a long tail and the odd unknown
const COUNTRIES = ["US", "US", "US", "IT", "IT", "DE", "GB", "FR", "ES", "BR", "IN", "CA", "NL", null];

const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)]!;
const DAY = 24 * 60 * 60 * 1000;

let total = 0;
const now = Date.now();

for (let dayAgo = 29; dayAgo >= 0; dayAgo--) {
  // a fresh pool of "people" each day -- mirrors how the daily salt would make
  // visitor hashes rotate, and keeps visitors < pageviews
  const visitors = Array.from({ length: 8 + Math.floor(Math.random() * 22) }, () =>
    randomBytes(16).toString("hex"),
  );

  // busier today than a week ago, just so the trend line isn't flat
  const events = (dayAgo === 0 ? 60 : 25) + Math.floor(Math.random() * 40);

  for (let i = 0; i < events; i++) {
    const offset = Math.floor(Math.random() * DAY);
    const agent = pick(AGENTS);
    insertEvent({
      site_id: SITE,
      name: "pageview",
      path: pick(PATHS),
      referrer: pick(REFERRERS),
      visitor_hash: pick(visitors),
      browser: agent.browser,
      os: agent.os,
      device: agent.device,
      country: pick(COUNTRIES),
      ts: now - dayAgo * DAY - offset,
    });
    total++;
  }
}

console.log(`seeded ${total} events for "${SITE}"`);
