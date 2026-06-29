# Tally

Privacy-first, self-hosted web analytics. No cookies, no personal data, one
small script tag.

Tally is a lightweight alternative to Google Analytics that you run yourself.
The tracking script is tiny, visitors aren't followed across sites, and no
IP addresses or persistent identifiers ever hit the database.

> Status: work in progress. The ingestion backend and a basic stats API are
> working; the dashboard is next.

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
- **Dashboard** — React + Vite *(coming next)*

## Quick start

```bash
cd server
npm install
npm run dev
```

Then open http://localhost:3000/demo.html and click around — you'll see events
land via `GET /api/stats?site=demo`.

## Layout

```
server/         ingest + stats API, serves the tracker script
  src/
    routes/     collect (write) and stats (read)
    db.ts       schema + connection
    privacy.ts  visitor hashing, daily salt, UA parsing, DNT
  public/       tracker.js + a demo page
web/            dashboard (todo)
```

## License

MIT
