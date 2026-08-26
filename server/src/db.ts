import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// flat table, one row per event. all SQL lives here, nowhere else touches it directly

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

-- daily salts, see privacy.ts
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
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  // keeps a chunk of the db in memory so the first query isn't slow
  db.pragma("cache_size = -20000"); // ~20MB
  db.pragma("mmap_size = 268435456"); // 256MB
  db.pragma("temp_store = MEMORY");
  db.exec(SCHEMA);
  migrate(db);
  warmUp(db);
  return db;
}

function warmUp(db: Database.Database) {
  try {
    db.prepare("SELECT COUNT(*) FROM events").get();
  } catch {
    // fresh db, nothing to warm
  }
}

// adds columns to old dbs that predate them, sqlite can only add columns not much else
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
