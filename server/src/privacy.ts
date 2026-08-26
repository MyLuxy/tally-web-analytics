import { createHash, randomBytes } from "node:crypto";
import { getSalt, putSalt } from "./db.js";

// hash ip+ua+salt instead of storing ip raw, salt rotates daily so nobody's
// trackable past 24h

const utcDay = (at = new Date()) => at.toISOString().slice(0, 10);

let cached: { day: string; salt: Buffer } | null = null;

function saltForToday(): Buffer {
  const day = utcDay();
  if (cached?.day === day) return cached.salt;

  let salt = getSalt(day);
  if (!salt) {
    salt = randomBytes(16);
    putSalt(day, salt); // INSERT OR IGNORE, so races are fine
    salt = getSalt(day)!; // re-read in case we lost the race
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
    .slice(0, 32);
}

export function optedOut(headers: Record<string, unknown>): boolean {
  return headers["dnt"] === "1" || headers["sec-gpc"] === "1";
}

// quick and dirty UA sniffing, not pulling in a whole library for 3 buckets
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
