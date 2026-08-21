import { describe, expect, it } from "vitest";
import { categorizeReferrer } from "./referrerCategory.js";

describe("categorizeReferrer", () => {
  it("recognises search engines, including subdomains", () => {
    expect(categorizeReferrer("www.google.com")).toBe("search");
    expect(categorizeReferrer("google.co.uk")).toBe("search");
    expect(categorizeReferrer("duckduckgo.com")).toBe("search");
    expect(categorizeReferrer("bing.com")).toBe("search");
  });

  it("recognises social/community platforms", () => {
    expect(categorizeReferrer("t.co")).toBe("social");
    expect(categorizeReferrer("old.reddit.com")).toBe("social");
    expect(categorizeReferrer("news.ycombinator.com")).toBe("social");
  });

  it("falls back to referral for anything unrecognised", () => {
    expect(categorizeReferrer("some-random-blog.example")).toBe("referral");
  });

  it("is case-insensitive", () => {
    expect(categorizeReferrer("WWW.GOOGLE.COM")).toBe("search");
  });
});
