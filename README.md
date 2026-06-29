# Tally

[![CI](https://github.com/MyLuxy/tally-web-analytics/actions/workflows/ci.yml/badge.svg)](https://github.com/MyLuxy/tally-web-analytics/actions/workflows/ci.yml)

Privacy-first, self-hosted web analytics. No cookies, no personal data, one
small script tag.

Tally is a lightweight alternative to Google Analytics that you run yourself.
The tracking script is tiny, visitors aren't followed across sites, and no
IP addresses or persistent identifiers ever hit the database.

> Status: work in progress. The tracker, ingestion backend, stats API and the
> dashboard are all working, and a production build serves everything from a
> single port. Next up: multi-site auth.

## Why another analytics tool?

Most analytics either bloat your page with a 40kb script that follows people
around the web, or they're so stripped down you can't answer basic questions.
Tally tries to sit in the middle: enough to actually be useful (top pages,
referrers, unique visitors over time), nothing that needs a cookie banner.

How "unique visitors" works without cookies: we hash
`daily_salt + site + ip + user_agent` into a `visitor_hash`. The salt rotates
every night and is never stored in a way that lets you reverse it, so the same
person looks like a new visitor tomorrow. Good enough for counting, useless for
tracking. (Same trick Plausible and Fathom use.)

## Stack

- **Backend** — Node + TypeScript + Fastify
- **Storage** — SQLite (via `better-sqlite3`), kept behind a thin module so it
  can move to Postgres/Timescale later without touching the routes
- **Tracker** — ~1kb of vanilla JS, no dependencies
- **Dashboard** — React + Vite, with a hand-rolled SVG chart (no charting lib)
  and self-hosted fonts so it makes no third-party requests

## Quick start

Two processes: the API server and the dashboard.

```bash
# 1. API server (port 3000)
cd server
npm install
npm run seed     # optional: fill the db with demo traffic
npm run dev

# 2. dashboard (port 5173), in a second terminal
cd web
npm install
npm run dev
```

Open http://localhost:5173 for the dashboard, or
http://localhost:3000/demo.html to generate live events with the tracker.

## Production

In production there's just one process. Vite builds the dashboard into
`server/web-dist` and Fastify serves it from the same port as the API, with a
SPA fallback so client-side routes resolve.

```bash
cd server
npm run build:web   # builds the dashboard into server/web-dist
npm run build       # compile the server
npm start           # serves API + dashboard on port 3000
```

## Layout

```
server/         ingest + stats API, serves the tracker script
  src/
    routes/     collect (write) and stats (read)
    db.ts       schema + connection
    privacy.ts  visitor hashing, daily salt, UA parsing, DNT
  public/       tracker.js + a demo page
  scripts/      seed.ts — demo data generator
web/            React dashboard (Vite)
  src/
    api.ts      typed client for /api/stats
    components/ Chart, StatList, TallyMarks
```

## License

MIT
