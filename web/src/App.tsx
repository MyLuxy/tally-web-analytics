import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Range, Site, Stats } from "./api.js";
import { fetchSites, fetchStats, getToken, setToken, Unauthorized } from "./api.js";
import { TallyMarks } from "./components/TallyMarks.js";
import { Chart } from "./components/Chart.js";
import { StatList } from "./components/StatList.js";

const RANGES: Range[] = ["24h", "7d", "30d", "all"];

// The numeric ranges read fine as-is; "all" gets a proper word on the tab.
const RANGE_LABELS: Record<Range, string> = { "24h": "24h", "7d": "7d", "30d": "30d", all: "All" };

// "last 7d" reads well for the fixed windows, but "last all" doesn't -- so the
// all-time view says "all time" instead.
const rangeEyebrow = (r: Range) => (r === "all" ? "all time" : `last ${r}`);

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(
    () => (localStorage.getItem("tally_theme") === "dark" ? "dark" : "light"),
  );
  // 12-hour (American, the default) vs 24-hour clock in the chart labels
  const [hour12, setHour12] = useState(
    () => localStorage.getItem("tally_hour12") !== "false",
  );

  // reflect the theme on <html> so the CSS variables flip, and remember it. On a
  // real toggle (not the first mount) we briefly flag the document so the whole
  // UI cross-fades between the two palettes instead of snapping.
  const themeMounted = useRef(false);
  useEffect(() => {
    const html = document.documentElement;
    html.dataset.theme = theme;
    localStorage.setItem("tally_theme", theme);
    if (!themeMounted.current) {
      themeMounted.current = true;
      return;
    }
    html.classList.add("theme-anim");
    const t = window.setTimeout(() => html.classList.remove("theme-anim"), 450);
    return () => window.clearTimeout(t);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("tally_hour12", String(hour12));
  }, [hour12]);

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
        // a slower earlier request can resolve after this effect was torn down
        // (we switched site/range) -- drop it so it can't clobber fresher data
        if (ctrl.signal.aborted) return;
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

          {/* on phones the clock toggle rides up here, since the range tabs move
              under the chart down there */}
          <ClockToggle hour12={hour12} setHour12={setHour12} className="clock-header" />

          <button
            className="theme-toggle"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            aria-haspopup="dialog"
            title="Settings"
          >
            <GearIcon />
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
            <span className="num">{site}</span>{" "}
            {range === "all" ? "over all time" : `in the last ${range}`} will show up here.
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
              <span className="eyebrow">{rangeEyebrow(range)}</span>
            </div>
            <div className="chart-wrap">
              {data && <Chart series={data.series} range={range} hour12={hour12} />}
              {/* spinner sits over the chart the moment a range is clicked, so the
                  switch never feels like a dead pause while stats are refetched */}
              {loading && (
                <div className="chart-loading" role="status" aria-label="Loading">
                  <span className="spinner" />
                </div>
              )}
            </div>
            {/* on phones the range tabs live here, under the chart */}
            <RangeTabs range={range} setRange={setRange} className="range-chart" />
            {/* ...and on desktop the clock toggle sits under the chart instead */}
            <ClockToggle hour12={hour12} setHour12={setHour12} className="clock-below" />
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
              info="Where your visitors came from: the external site or search engine that linked them to you."
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

      {settingsOpen && (
        <Modal title="Settings" onClose={() => setSettingsOpen(false)}>
          <div className="setting">
            <div className="setting-text">
              <span className="setting-name">Theme</span>
              <span className="setting-hint">Light or dark appearance</span>
            </div>
            <div className="theme-seg" data-active={theme} role="group" aria-label="Theme">
              <button
                type="button"
                className="theme-opt"
                aria-pressed={theme === "light"}
                onClick={() => setTheme("light")}
              >
                <SunIcon /> Light
              </button>
              <button
                type="button"
                className="theme-opt"
                aria-pressed={theme === "dark"}
                onClick={() => setTheme("dark")}
              >
                <MoonIcon /> Dark
              </button>
            </div>
          </div>

          <button
            type="button"
            className="setting setting-action"
            onClick={() => {
              setSettingsOpen(false);
              setEventsOpen(true);
            }}
          >
            <span className="setting-text">
              <span className="setting-name">Custom events</span>
              <span className="setting-hint">Conversions tracked with tally('name')</span>
            </span>
            <span className="setting-chevron">
              <ChevronRightIcon />
            </span>
          </button>
        </Modal>
      )}

      {eventsOpen && (
        <Modal title="Events" onClose={() => setEventsOpen(false)}>
          <EventsList events={data?.events ?? []} range={range} />
        </Modal>
      )}
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
          {RANGE_LABELS[r]}
        </button>
      ))}
    </div>
  );
}

// 12h/24h clock switch for the chart labels. Rendered twice, like the range
// tabs but mirrored: under the chart on desktop, up in the header on phones.
function ClockToggle({
  hour12,
  setHour12,
  className,
}: {
  hour12: boolean;
  setHour12: (v: boolean) => void;
  className: string;
}) {
  const other = hour12 ? "24" : "12";
  return (
    <button
      type="button"
      className={`clock-toggle ${className}`}
      onClick={() => setHour12(!hour12)}
      title={`Switch to ${other}-hour time`}
      aria-label={`Switch to ${other}-hour time`}
    >
      <ClockIcon />
      <span className="num">{hour12 ? "12h" : "24h"}</span>
    </button>
  );
}

function ClockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
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
  const full = value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  // seven-figure counts get compact notation (1.24M) so the tile can't spill
  // over; the exact figure stays a hover away.
  const big = value >= 1_000_000;
  const shown = big
    ? value.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 })
    : full;
  return (
    <div className="metric">
      <div className="metric-value num" title={big ? full : undefined}>{shown}</div>
      <div className="metric-label eyebrow">{label}</div>
    </div>
  );
}

// A centered dialog over a dimmed backdrop. Closes on the backdrop, on the X, or
// on Escape, and freezes the page scroll while it's up.
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      {/* stop clicks inside the dialog from bubbling up and closing it */}
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 className="modal-title">{title}</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// The custom-events list shown inside its modal. Same bar rows as the breakdown
// panels, minus the panel chrome (the modal is the frame here).
function EventsList({ events, range }: { events: Stats["events"]; range: Range }) {
  if (events.length === 0) {
    return (
      <div className="modal-empty">
        <TallyMarks count={3} className="panel-empty-mark" />
        <p className="ink-soft">
          No custom events {range === "all" ? "yet" : `in the last ${range}`}. Fire one from your
          site with <code className="num">tally('signup')</code> and it shows up here.
        </p>
      </div>
    );
  }
  const max = Math.max(1, ...events.map((e) => e.count));
  return (
    <ul className="rows">
      {events.map((e) => (
        <li className="row" key={e.name}>
          <span className="row-bar" style={{ width: `${(e.count / max) * 100}%` }} />
          <span className="row-label">{e.name}</span>
          <span className="row-value num">{e.count.toLocaleString("en-US")}</span>
        </li>
      ))}
    </ul>
  );
}

function GearIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
