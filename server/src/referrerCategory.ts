const SEARCH_HOSTS = [
  "google.",
  "bing.com",
  "duckduckgo.com",
  "yahoo.",
  "baidu.com",
  "yandex.",
  "ecosia.org",
  "startpage.com",
  "search.brave.com",
  "www.qwant.com",
  "www.ask.com",
];

const SOCIAL_HOSTS = [
  "facebook.com",
  "m.facebook.com",
  "l.facebook.com",
  "twitter.com",
  "x.com",
  "t.co",
  "instagram.com",
  "linkedin.com",
  "lnkd.in",
  "reddit.com",
  "old.reddit.com",
  "pinterest.",
  "tiktok.com",
  "threads.net",
  "youtube.com",
  "youtu.be",
  "discord.com",
  "discordapp.com",
  "telegram.org",
  "t.me",
  "web.whatsapp.com",
  "mastodon.social",
  "bsky.app",
  "hn.algolia.com",
  "news.ycombinator.com",
  "lemmy.",
];

export type ReferrerCategory = "search" | "social" | "referral";

function hostMatches(host: string, patterns: string[]): boolean {
  return patterns.some((p) => (p.endsWith(".") ? host.includes(p) : host === p || host.endsWith(`.${p}`)));
}

export function categorizeReferrer(host: string): ReferrerCategory {
  const h = host.toLowerCase();
  if (hostMatches(h, SEARCH_HOSTS)) return "search";
  if (hostMatches(h, SOCIAL_HOSTS)) return "social";
  return "referral";
}
