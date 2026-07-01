import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// One event = one row. We keep the schema deliberately flat: analytics queries
// are mostly "group by something, count rows in a time window", and a single
// wide table is the easiest thing to make fast with a couple of indexes.
//
// Everything here goes through this module so the rest of the app never touches
// SQL directly -- the day we outgrow SQLite, only this file changes.

export type EventRow = {
  site_id: string;
  name: string;
  path: string;
  referrer: string | null;
  visitor_hash: string;
  browser: string | null;
  os: string | null;
  device: string | null;
  country: string | null; // 2-letter code from an edge header, never the IP
  ts: number; // unix millis
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id           INTEGER PRIMARY KEY,
  site_id      TEXT    NOT NULL,
  name         TEXT    NOT NULL DEFAULT 'pageview',
  path         TEXT    NOT NULL,
  referrer     TEXT,
  visitor_hash TEXT    NOT NULL,
  browser      TEXT,
  os           TEXT,
  device       TEXT,
  country      TEXT,
  ts           INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_site_ts ON events (site_id, ts);

-- daily salts used to derive visitor hashes; rotating these is what keeps
-- visitors from being trackable across days. See privacy.ts.
CREATE TABLE IF NOT EXISTS salts (
  day  TEXT PRIMARY KEY,   -- YYYY-MM-DD (UTC)
  salt BLOB NOT NULL
);
`;

let db: Database.Database;

export function openDb(file = process.env.TALLY_DB ?? "tally.sqlite") {
  if (db) return db;

  mkdirSync(dirname(file) || ".", { recursive: true });
  db = new Database(file);
  db.pragma("journal_mode = WAL"); // many small writes, the odd read
  db.pragma("synchronous = NORMAL");
  // Keep a chunk of the db resident so the dashboard isn't slow on the first
  // open (the tell: sluggish first load, snappy after a reload -- cold disk
  // cache). This page cache lives in the process for the server's whole life,
  // so idle time on the box can't evict it the way the OS file cache would.
  db.pragma("cache_size = -20000"); // ~20 MB page cache (negative = KiB)
  db.pragma("mmap_size = 268435456"); // 256 MB memory-mapped reads
  db.pragma("temp_store = MEMORY");
  db.exec(SCHEMA);
  migrate(db);
  warmUp(db);
  return db;
}

// Pull the events table into the cache at startup, so the first stats query a
// visitor triggers is already warm instead of hitting cold disk. One-off and
// cheap for the sizes a self-hosted analytics db reaches.
function warmUp(db: Database.Database) {
  try {
    db.prepare("SELECT COUNT(*) FROM events").get();
  } catch {
    // brand-new db, nothing to warm yet
  }
}

// Tiny forward-only migration: add columns we introduced after the first
// release so an existing tally.sqlite keeps working instead of erroring on
// insert. SQLite only allows adding columns, which is all we need so far.
function migrate(db: Database.Database) {
  const cols = db.prepare("PRAGMA table_info(events)").all() as { name: string }[];
  const has = (name: string) => cols.some((c) => c.name === name);
  if (!has("country")) db.exec("ALTER TABLE events ADD COLUMN country TEXT");
}

const insertStmt = () =>
  openDb().prepare<EventRow>(`
    INSERT INTO events (site_id, name, path, referrer, visitor_hash, browser, os, device, country, ts)
    VALUES (@site_id, @name, @path, @referrer, @visitor_hash, @browser, @os, @device, @country, @ts)
  `);

export function insertEvent(row: EventRow) {
  insertStmt().run(row);
}

// salt storage -- the actual rotation logic lives in privacy.ts, this is just
// read/write so we survive a restart within the same day.
export function getSalt(day: string): Buffer | undefined {
  const row = openDb()
    .prepare<[string]>("SELECT salt FROM salts WHERE day = ?")
    .get(day) as { salt: Buffer } | undefined;
  return row?.salt;
}

export function putSalt(day: string, salt: Buffer) {
  openDb()
    .prepare("INSERT OR IGNORE INTO salts (day, salt) VALUES (?, ?)")
    .run(day, salt);
}
