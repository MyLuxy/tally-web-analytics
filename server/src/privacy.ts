import { createHash, randomBytes } from "node:crypto";
import { getSalt, putSalt } from "./db.js";

// The whole privacy story lives here. Two rules we never break:
//   1. we don't store IP addresses
//   2. the id we use to count unique visitors must not survive past today
//
// We get both by hashing (salt + site + ip + ua) where `salt` is a random
// value that rotates at midnight UTC. The hash is enough to dedupe a visitor
// within a day; tomorrow the salt is different so the same person hashes to
// something new and uncountable against today.

const utcDay = (at = new Date()) => at.toISOString().slice(0, 10); // YYYY-MM-DD

// tiny in-process cache so we're not hitting the db on every single event
let cached: { day: string; salt: Buffer } | null = null;

function saltForToday(): Buffer {
  const day = utcDay();
  if (cached?.day === day) return cached.salt;

  let salt = getSalt(day);
  if (!salt) {
    salt = randomBytes(16);
    putSalt(day, salt); // INSERT OR IGNORE -> safe if two requests race here
    salt = getSalt(day)!; // re-read so everyone agrees on the winner
  }
  cached = { day, salt };
  return salt;
}

export function visitorHash(site: string, ip: string, userAgent: string): string {
  const salt = saltForToday();
  return createHash("sha256")
    .update(salt)
    .update("|")
    .update(site)
    .update("|")
    .update(ip)
    .update("|")
    .update(userAgent)
    .digest("hex")
    .slice(0, 32); // half a sha256 is plenty to avoid collisions here
}

// Respect Do-Not-Track / Global Privacy Control. If a visitor opted out we
// just don't record them, full stop.
export function optedOut(headers: Record<string, unknown>): boolean {
  return headers["dnt"] === "1" || headers["sec-gpc"] === "1";
}

// Minimal UA parsing. A real project would reach for a library, but the big
// ones ship megabytes of regexes and we only want three buckets. This covers
// the common cases and degrades to "Other" gracefully.
export function parseUserAgent(ua = ""): {
  browser: string;
  os: string;
  device: string;
} {
  const browser = ua.includes("Edg")
    ? "Edge"
    : ua.includes("OPR") || ua.includes("Opera")
      ? "Opera"
      : ua.includes("Firefox")
        ? "Firefox"
        : // Chrome's UA contains "Safari", so check Chrome first
          ua.includes("Chrome")
          ? "Chrome"
          : ua.includes("Safari")
            ? "Safari"
            : "Other";

  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua) // Android also says "Linux", so check it first
      ? "Android"
      : /(iPhone|iPad|iPod)/.test(ua)
        ? "iOS"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "Other";

  const device = /Mobi|Android|iPhone|iPod/.test(ua)
    ? "mobile"
    : /iPad|Tablet/.test(ua)
      ? "tablet"
      : "desktop";

  return { browser, os, device };
}
