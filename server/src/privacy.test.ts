import { describe, expect, it } from "vitest";
import { optedOut, parseUserAgent } from "./privacy.js";

describe("parseUserAgent", () => {
  it("picks Chrome over the Safari token in its UA", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
    expect(parseUserAgent(ua)).toEqual({
      browser: "Chrome",
      os: "Windows",
      device: "desktop",
    });
  });

  it("detects iOS Safari on mobile", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";
    const { os, device } = parseUserAgent(ua);
    expect(os).toBe("iOS");
    expect(device).toBe("mobile");
  });

  it("treats Android as Android, not Linux", () => {
    const ua = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile";
    expect(parseUserAgent(ua).os).toBe("Android");
  });

  it("falls back to Other for junk", () => {
    expect(parseUserAgent("")).toEqual({
      browser: "Other",
      os: "Other",
      device: "desktop",
    });
  });
});

describe("optedOut", () => {
  it("respects DNT and GPC", () => {
    expect(optedOut({ dnt: "1" })).toBe(true);
    expect(optedOut({ "sec-gpc": "1" })).toBe(true);
    expect(optedOut({})).toBe(false);
  });
});
