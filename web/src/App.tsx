import { useEffect, useRef, useState } from "react";
import type { Range, Site, Stats } from "./api.js";
import { fetchSites, fetchStats, getToken, setToken, Unauthorized } from "./api.js";
import { TallyMarks } from "./components/TallyMarks.js";
import { Chart } from "./components/Chart.js";
import { StatList } from "./components/StatList.js";

const RANGES: Range[] = ["24h", "7d", "30d"];

// Country name from a 2-letter code, via Intl so we don't ship a lookup table.
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
function countryName(code: string): string {
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code; // not a real region code -- just show what we got
  }
}

// Flag emoji don't render everywhere (Windows and many Samsung phones show the
// bare letters instead), so use small flag images keyed by the country code.
function CountryLabel({ code }: { code: string }) {
  const cc = code.toLowerCase();
  return (
    <span className="country">
      <img
        className="flag"
        src={`https://flagcdn.com/24x18/${cc}.png`}
        srcSet={`https://flagcdn.com/48x36/${cc}.png 2x`}
        width={24}
        height={18}
        alt=""
        loading="lazy"
      />
      {countryName(code)}
    </span>
  );
}

export function App() {
  const [sites, setSites] = useState<Site[]>([]);
  const [site, setSite] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("7d");
  const [data, setData] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false); // server wants a token
  const [reload, setReload] = useState(0); // bumped to retry after unlocking
  const [theme, setTheme] = useState<"light" | "dark">(
    () => (localStorage.getItem("tally_theme") === "dark" ? "dark" : "light"),
  );

  // reflect the theme on <html> so the CSS variables flip, and remember it
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("tally_theme", theme);
  }, [theme]);

  // Pull the list of sites once, then default to the most active one.
  useEffect(() => {
    fetchSites()
      .then((list) => {
        setLocked(false);
        setSites(list);
        setSite((current) => current ?? list[0]?.site ?? null);
        if (list.length === 0) setLoading(false); // nothing to fetch stats for
      })
      .catch((e: unknown) => {
        if (e instanceof Unauthorized) {
          setLocked(true);
          setLoading(false);
        }
        // other errors surface through the stats fetch below
      });
  }, [reload]);

  useEffect(() => {
    if (!site) return;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchStats(site, range)
      .then((s) => {
        setLocked(false);
        setData(s);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        if (e instanceof Unauthorized) {
          setLocked(true);
          return;
        }
        setError(e instanceof Error ? e.message : "something went wrong");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [site, range, reload]);

  function unlock(token: string) {
    setToken(token);
    setLocked(false);
    setLoading(true);
    setReload((n) => n + 1);
  }

  const totals = data?.totals;
  const hasData = !!totals && totals.pageviews > 0;
  const perVisitor = totals && totals.visitors > 0 ? totals.pageviews / totals.visitors : 0;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <img src="/brand.png" className="brand-logo" alt="Tally" />
          <div>
            <div className="brand-name">Tally</div>
            <div className="brand-sub">self-hosted analytics</div>
          </div>
        </div>

        <div className="controls">
          {sites.length > 1 ? (
            <SitePicker sites={sites} site={site ?? ""} onChange={setSite} />
          ) : (
            <span className="site-pill">
              <span className="eyebrow">site</span>
              {site ? (
                <a className="site-name" href={siteUrl(site)} target="_blank" rel="noreferrer">
                  {site}
                </a>
              ) : (
                <span className="site-name">—</span>
              )}
            </span>
          )}

          <RangeTabs range={range} setRange={setRange} className="range-header" />

          <button
            className="theme-toggle"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle dark mode"
            title="Toggle theme"
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </header>

      {locked && <TokenGate onSubmit={unlock} />}

      {!locked && error && (
        <div className="notice notice-error">
          <strong>Couldn't load stats.</strong> {error}
          <div className="ink-soft">Is the server running on :3000?</div>
        </div>
      )}

      {!locked && !error && !hasData && !loading && (
        <div className="empty">
          <TallyMarks count={4} className="empty-mark" />
          <h2>No counts yet</h2>
          <p className="ink-soft">
            Embed the tracker on your site, open a page, then reload. Events for{" "}
            <span className="num">{site}</span> in the last {range} will show up here.
          </p>
        </div>
      )}

      {!locked && !error && (hasData || loading) && (
        <main className={`content ${data ? "fade-in" : ""}`} aria-busy={loading}>
          <section className="ledger">
            <Metric label="Pageviews" value={totals?.pageviews ?? 0} />
            <Metric label="Unique visitors" value={totals?.visitors ?? 0} />
            <Metric label="Views / visitor" value={perVisitor} decimals={1} />
          </section>

          <section className="panel chart-panel">
            <div className="panel-head">
              <h2 className="panel-title">Traffic</h2>
              <span className="eyebrow">last {range}</span>
            </div>
            {data && <Chart series={data.series} range={range} />}
            {/* on phones the range tabs live here, under the chart */}
            <RangeTabs range={range} setRange={setRange} className="range-chart" />
          </section>

          <div className="grid-two">
            <StatList
              title="Top pages"
              unit="views"
              info="Your most-visited pages in the selected time range, ranked by pageviews."
              empty="No pages recorded."
              rows={(data?.topPages ?? []).map((p) => ({ label: p.path, value: p.views }))}
            />
            <StatList
              title="Referrers"
              unit="views"
              info="Where your visitors came from — the external site or search engine that linked them to you."
              empty="All traffic came in direct."
              rows={(data?.topReferrers ?? []).map((r) => ({ label: r.source, value: r.views }))}
            />
          </div>

          <div className="breakdowns">
            <StatList
              title="Browsers"
              unit="views"
              empty="No browser data."
              rows={(data?.browsers ?? []).map((b) => ({ label: b.name, value: b.views }))}
            />
            <StatList
              title="Operating systems"
              unit="views"
              empty="No OS data."
              rows={(data?.systems ?? []).map((s) => ({ label: s.name, value: s.views }))}
            />
            <StatList
              title="Devices"
              unit="views"
              empty="No device data."
              rows={(data?.devices ?? []).map((d) => ({ label: d.name, value: d.views }))}
            />
            <StatList
              title="Countries"
              unit="views"
              empty="No country data."
              rows={(data?.countries ?? []).map((c) => ({
                label: <CountryLabel code={c.name} />,
                title: countryName(c.name),
                value: c.views,
              }))}
            />
          </div>
        </main>
      )}

      <footer className="footer">
        <GithubIcon />
        <span>
          Made by{" "}
          <a href="https://github.com/MyLuxy" target="_blank" rel="noreferrer">MyLuxy</a>
          {" — "}
          <a href="https://github.com/MyLuxy/tally-web-analytics" target="_blank" rel="noreferrer">
            tally-web-analytics
          </a>
        </span>
      </footer>
    </div>
  );
}

function GithubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function TokenGate({ onSubmit }: { onSubmit: (token: string) => void }) {
  const [value, setValue] = useState(getToken());
  return (
    <div className="empty">
      <TallyMarks count={4} className="empty-mark" />
      <h2>This dashboard is locked</h2>
      <p className="ink-soft">
        The server is running with an access token. Enter it to view stats.
      </p>
      <form
        className="token-form"
        onSubmit={(e) => {
          e.preventDefault();
          const t = value.trim();
          if (t) onSubmit(t);
        }}
      >
        <input
          className="token-input num"
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="access token"
          aria-label="Access token"
          autoComplete="off"
          autoFocus
        />
        <button className="token-submit" type="submit">
          Unlock
        </button>
      </form>
    </div>
  );
}

// The 24h/7d/30d switch. Rendered twice -- in the header on desktop, under the
// chart on phones -- with CSS deciding which copy shows.
function RangeTabs({
  range,
  setRange,
  className,
}: {
  range: Range;
  setRange: (r: Range) => void;
  className: string;
}) {
  return (
    <div className={`segmented ${className}`} role="group" aria-label="Time range">
      {RANGES.map((r) => (
        <button
          key={r}
          className="segment num"
          aria-pressed={r === range}
          onClick={() => setRange(r)}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

// Custom site dropdown -- a native <select> can't be styled to match the dark
// theme, so we roll our own. Closes on outside-click or Escape.
function SitePicker({
  sites,
  site,
  onChange,
}: {
  sites: Site[];
  site: string;
  onChange: (s: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="site-picker" ref={ref}>
      <span className="site-pill">
        <span className="eyebrow">site</span>
        <a className="site-name" href={siteUrl(site)} target="_blank" rel="noreferrer">
          {site}
        </a>
        <button
          type="button"
          className="site-chevron"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="Switch site"
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronIcon />
        </button>
      </span>

      {open && (
        <ul className="site-picker-menu" role="listbox">
          {sites.map((s) => (
            <li key={s.site}>
              <button
                type="button"
                role="option"
                aria-selected={s.site === site}
                className={`site-picker-option${s.site === site ? " is-active" : ""}`}
                onClick={() => {
                  onChange(s.site);
                  setOpen(false);
                }}
              >
                {s.site}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Build a URL to open the tracked site in a new tab. data-site is usually a
// domain (e.g. "example.com"); add https:// if there's no scheme already.
function siteUrl(site: string): string {
  return /^https?:\/\//i.test(site) ? site : `https://${site}`;
}

function ChevronIcon() {
  return (
    <svg
      className="chevron"
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function Metric({ label, value, decimals = 0 }: { label: string; value: number; decimals?: number }) {
  const shown = value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return (
    <div className="metric">
      <div className="metric-value num">{shown}</div>
      <div className="metric-label eyebrow">{label}</div>
    </div>
  );
}
