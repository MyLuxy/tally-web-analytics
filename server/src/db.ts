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
  db.exec(SCHEMA);
  return db;
}

const insertStmt = () =>
  openDb().prepare<EventRow>(`
    INSERT INTO events (site_id, name, path, referrer, visitor_hash, browser, os, device, ts)
    VALUES (@site_id, @name, @path, @referrer, @visitor_hash, @browser, @os, @device, @ts)
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
