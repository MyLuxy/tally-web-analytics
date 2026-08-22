import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { CSSProperties, ReactNode } from "react";
import type { BreakdownMetric, Range, Site, Stats } from "./api.js";
import { fetchBreakdown, fetchSites, fetchStats, getToken, setToken, Unauthorized } from "./api.js";
import { TallyMarks } from "./components/TallyMarks.js";
import { Chart } from "./components/Chart.js";
import { Sparkline } from "./components/Sparkline.js";
import { BarChart } from "./components/BarChart.js";
import { ExportCsvButton, Rows, StatList } from "./components/StatList.js";
import { BreakdownCard, BreakdownChart } from "./components/BreakdownCard.js";
import type { BreakdownTab } from "./components/BreakdownCard.js";
import { RankedBoard, TrafficSourcesCard, TrafficSourcesContent } from "./components/TrafficSources.js";
import { ClickableCard } from "./components/ClickableCard.js";
import { Modal } from "./components/Modal.js";
import { browserIcon, deviceIcon, osIcon } from "./components/DeviceIcons.js";
import type { Row } from "./components/StatList.js";

// A card that expands into a full-screen sheet -- the breakdown panels
// (pages, referrers, ...) plus the two hand-built ones, traffic and traffic
// sources, that don't come from a single fetchBreakdown call.
type ExpandTarget = BreakdownMetric | "traffic" | "trafficSources" | "activity" | "site";

// The BreakdownCard's four tabs -- its own donut+icon chart, shared between
// the compact card and (bigger, with its own tab switcher) the expanded sheet.
type PlatformKey = "browsers" | "systems" | "devices" | "countries";

// Runs `fn` inside the View Transitions API when the browser has it (every
// Chromium browser, Safari 18+; not yet Firefox) so the clicked card visibly
// grows into the full-screen sheet instead of just swapping. Where it's
// unsupported, `fn` still runs -- the sheet just relies on its own CSS
// fade/scale-in instead (see ExpandSheet's fallbackAnim). `after` (if given)
// runs once the transition's animation has actually finished.
function withViewTransition(fn: () => void, after?: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
  if (typeof doc.startViewTransition === "function") {
    // React batches state updates, so without flushSync the DOM wouldn't
    // actually reflect the change yet by the time the browser grabs its
    // "after" snapshot -- the transition would silently no-op.
    const transition = doc.startViewTransition(() => flushSync(fn));
    if (after) transition.finished.then(after);
  } else {
    fn();
    after?.();
  }
}

// Set at build time (e.g. `VITE_BACK_LINK_URL=/admin npm run build`) when
// Tally is embedded inside another app's admin panel, so a "Back to CMS"
// link can point back there. Undefined for a standalone deployment -- Tally
// stays a generic tool with no hardcoded knowledge of any particular site.
const BACK_LINK_URL = import.meta.env.VITE_BACK_LINK_URL as string | undefined;
const BACK_LINK_LABEL = (import.meta.env.VITE_BACK_LINK_LABEL as string | undefined) ?? "Back to CMS";

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
// bare letters instead), so use small flag icons keyed by the country code --
// self-hosted circular SVGs (see scripts/sync-flags.mjs), not an external CDN.
function CountryLabel({ code }: { code: string }) {
  const cc = code.toLowerCase();
  return (
    <span className="country">
      <img
        className="flag"
        src={`${import.meta.env.BASE_URL}flags/${cc}.svg`}
        width={20}
        height={20}
        alt=""
        loading="lazy"
      />
      {countryName(code)}
    </span>
  );
}

// Same flag icon, standalone -- for the breakdown donut's legend, which
// already shows the country name as text next to it.
function countryIcon(_name: string, code?: string) {
  if (!code) return null;
  return <img className="flag" src={`${import.meta.env.BASE_URL}flags/${code.toLowerCase()}.svg`} width={16} height={16} alt="" />;
}

// RankedBoard icon resolvers (see TrafficSources.tsx) -- a flag for the
// "More countries" list, a favicon for "All referrers".
function countryFlagRowIcon(row: Row) {
  return countryIcon("", row.code);
}

function referrerFaviconIcon(row: Row) {
  const domain = typeof row.label === "string" ? row.label : (row.title ?? "");
  return (
    <img
      className="referrer-favicon"
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`}
      alt=""
      loading="lazy"
      draggable={false}
      onError={(e) => {
        e.currentTarget.style.visibility = "hidden";
      }}
    />
  );
}

// One entry per panel that has a "View all" button. Maps the flat
// {key, value} rows from /api/stats/breakdown back to each panel's own
// title/empty copy and row rendering (e.g. countries get a flag).
const VIEW_ALL_CONFIG: Record<
  BreakdownMetric,
  { title: string; empty: string; toRow: (row: { key: string; value: number }) => Row }
> = {
  pages: { title: "Top pages", empty: "No pages recorded.", toRow: (r) => ({ label: r.key, value: r.value }) },
  entryPages: {
    title: "Entry pages",
    empty: "No entry pages recorded.",
    toRow: (r) => ({ label: r.key, value: r.value }),
  },
  referrers: {
    title: "Referrers",
    empty: "All traffic came in direct.",
    toRow: (r) => ({ label: r.key, value: r.value }),
  },
  browsers: { title: "Browsers", empty: "No browser data.", toRow: (r) => ({ label: r.key, value: r.value }) },
  systems: { title: "Operating systems", empty: "No OS data.", toRow: (r) => ({ label: r.key, value: r.value }) },
  devices: { title: "Devices", empty: "No device data.", toRow: (r) => ({ label: r.key, value: r.value }) },
  countries: {
    title: "Countries",
    empty: "No country data.",
    toRow: (r) => ({ label: countryName(r.key), title: countryName(r.key), value: r.value, code: r.key }),
  },
  events: {
    title: "Events",
    empty: "No custom events recorded. Fire one from your site with tally('name') and it shows up here.",
    toRow: (r) => ({ label: r.key, value: r.value }),
  },
};

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
  // the Activity card is always the last 24h, independent of whatever range
  // is selected for the main chart -- its own small fetch, not derived from `data`
  const [activityData, setActivityData] = useState<Stats | null>(null);
  const [expanded, setExpanded] = useState<ExpandTarget | null>(null);
  // Which single card, if any, should currently wear the shared view-transition
  // name -- kept separate from `expanded` because the name has to move onto
  // the card a beat *before* `expanded` changes (opening) or linger on it a
  // beat *after* (closing). Every other card carries no name at all, ever --
  // giving every idle card a permanent name was what made them all flash to
  // the front and overlap the one actually animating. See ClickableCard.
  const [transitioningKey, setTransitioningKey] = useState<ExpandTarget | null>(null);
  const [breakdownRows, setBreakdownRows] = useState<Row[] | null>(null);
  const [breakdownError, setBreakdownError] = useState<string | null>(null);
  // which of the BreakdownCard's 4 tabs is showing -- shared between the
  // compact card and the sheet's own tab switcher, so closing the sheet on
  // whichever tab you last looked at morphs back into the matching card.
  const [breakdownTab, setBreakdownTab] = useState<PlatformKey>("browsers");
  // the expanded traffic-sources sheet shows the full, uncapped referrer
  // list underneath the same donut -- data the compact card never fetches
  const [sourceRows, setSourceRows] = useState<Row[] | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  // Mirrors the inline script in index.html, which already set this on <html>
  // before React mounted (so there's no flash of the wrong palette) -- this
  // just brings React's own state in sync with what's already on screen.
  const [theme, setTheme] = useState<"light" | "dark">(
    () => (localStorage.getItem("tally_theme") === "light" ? "light" : "dark"),
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

  // Activity card: always the last 24h, on its own schedule -- unaffected by
  // the range picker on the main Statistics chart.
  useEffect(() => {
    if (!site) return;
    const ctrl = new AbortController();
    fetchStats(site, "24h")
      .then((s) => {
        if (!ctrl.signal.aborted) setActivityData(s);
      })
      .catch(() => {
        // the main fetch above already surfaces a real error notice; this
        // card just stays empty rather than showing a second one
      });
    return () => ctrl.abort();
  }, [site, reload]);

  // Fetches the full (uncapped) list for whichever card expanded -- closing a
  // sheet (expanded -> null) needs no fetch, and neither does trafficSources
  // (see the next effect, which fetches its own bonus "all referrers" list).
  useEffect(() => {
    if (
      !site ||
      expanded === null ||
      expanded === "traffic" ||
      expanded === "trafficSources" ||
      expanded === "activity" ||
      expanded === "site"
    )
      return;
    const metric = expanded;
    const ctrl = new AbortController();
    setBreakdownRows(null);
    setBreakdownError(null);
    fetchBreakdown(site, range, metric)
      .then((rows) => {
        if (ctrl.signal.aborted) return;
        setBreakdownRows(rows.map(VIEW_ALL_CONFIG[metric].toRow));
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setBreakdownError(e instanceof Error ? e.message : "something went wrong");
      });
    return () => ctrl.abort();
  }, [expanded, site, range]);

  // The traffic-sources sheet's bonus "all referrers" list, uncapped --
  // separate from the 4-way category split, which the compact card already has.
  useEffect(() => {
    if (expanded !== "trafficSources" || !site) return;
    const ctrl = new AbortController();
    setSourceRows(null);
    setSourceError(null);
    // a beat after the sheet's own open animation (see .sheet-in, 220ms) --
    // firing immediately meant this list's rows (each fetching a favicon
    // from Google) landed and started decoding mid-transition, which is
    // what showed up as the sheet's open feeling laggy
    const timer = setTimeout(() => {
      fetchBreakdown(site, range, "referrers")
        .then((rows) => {
          if (ctrl.signal.aborted) return;
          setSourceRows(rows.map((r) => ({ label: r.key, value: r.value })));
        })
        .catch((e: unknown) => {
          if (ctrl.signal.aborted) return;
          setSourceError(e instanceof Error ? e.message : "something went wrong");
        });
    }, 260);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [expanded, site, range]);

  function openCard(target: ExpandTarget) {
    // committed synchronously, *before* the transition starts, so the card
    // already wears the name at the moment the "before" snapshot is taken
    flushSync(() => setTransitioningKey(target));
    withViewTransition(() => {
      setExpanded(target);
      setTransitioningKey(null); // the sheet takes the name from here
    });
  }

  function closeCard() {
    const target = expanded;
    withViewTransition(
      () => {
        setExpanded(null);
        setTransitioningKey(target); // hand the name back to the card closing into
      },
      () => setTransitioningKey(null), // and let go of it once the animation's done
    );
  }

  function unlock(token: string) {
    setToken(token);
    setLocked(false);
    setLoading(true);
    setReload((n) => n + 1);
  }

  const totals = data?.totals;
  const hasData = !!totals && totals.pageviews > 0;
  const perVisitor = totals && totals.visitors > 0 ? totals.pageviews / totals.visitors : 0;

  const prev = data?.previousTotals;
  const prevPerVisitor = prev && prev.visitors > 0 ? prev.pageviews / prev.visitors : 0;

  const currentSiteInfo = sites.find((s) => s.site === site);

  // Shared between the compact BreakdownCard and the expanded sheet's own
  // tab switcher (see PlatformKey/breakdownTab above) -- one definition, so
  // the two never drift apart.
  const platformTabs: BreakdownTab[] = [
    {
      key: "browsers",
      label: "Browsers",
      empty: "No browser data.",
      rows: (data?.browsers ?? []).map((b) => ({ label: b.name, value: b.views })),
      chart: (data?.browsers ?? []).map((b) => ({ name: b.name, value: b.views })),
      icon: browserIcon,
    },
    {
      key: "systems",
      label: "OS",
      empty: "No OS data.",
      rows: (data?.systems ?? []).map((s) => ({ label: s.name, value: s.views })),
      chart: (data?.systems ?? []).map((s) => ({ name: s.name, value: s.views })),
      icon: osIcon,
    },
    {
      key: "devices",
      label: "Devices",
      empty: "No device data.",
      rows: (data?.devices ?? []).map((d) => ({ label: d.name, value: d.views })),
      chart: (data?.devices ?? []).map((d) => ({ name: d.name, value: d.views })),
      icon: deviceIcon,
    },
    {
      key: "countries",
      label: "Countries",
      empty: "No country data.",
      rows: (data?.countries ?? []).map((c) => ({
        label: <CountryLabel code={c.name} />,
        title: countryName(c.name),
        value: c.views,
      })),
      chart: (data?.countries ?? []).map((c) => ({ name: countryName(c.name), value: c.views, code: c.name })),
      icon: countryIcon,
    },
  ];
  const activePlatformTab = platformTabs.find((t) => t.key === breakdownTab)!;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}brand.png`} className="brand-logo" alt="Tally" />
          <div>
            <div className="brand-name" translate="no">Tally</div>
            <div className="brand-sub">self-hosted analytics</div>
          </div>
        </div>

        <div className="controls">
          {BACK_LINK_URL && (
            <a className="back-link" href={BACK_LINK_URL}>
              <BackIcon />
              {BACK_LINK_LABEL}
            </a>
          )}

          <a
            className="icon-btn"
            href="https://github.com/MyLuxy/tally-web-analytics"
            target="_blank"
            rel="noreferrer"
            title="GitHub"
            aria-label="GitHub"
          >
            <GithubIcon />
          </a>

          <button
            type="button"
            className="icon-btn settings-btn"
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
          <section className="kpi-grid">
            <KpiCard
              icon={<EyeIcon />}
              iconVar="--accent"
              label="Pageviews"
              value={totals?.pageviews ?? 0}
              delta={prev && deltaOf(totals?.pageviews ?? 0, prev.pageviews)}
            />
            <KpiCard
              icon={<UsersIcon />}
              iconVar="--accent-2"
              label="Unique visitors"
              value={totals?.visitors ?? 0}
              delta={prev && deltaOf(totals?.visitors ?? 0, prev.visitors)}
            />
            <KpiCard
              icon={<RatioIcon />}
              iconVar="--accent-3"
              label="Views / visitor"
              value={perVisitor}
              decimals={1}
              delta={prev && deltaOf(perVisitor, prevPerVisitor)}
            />
          </section>

          {/* Statistics (wide) + Traffic sources (narrow) -- the range picker
              lives inside the Statistics card itself now, not the top bar,
              since it's the one thing that actually controls this chart. */}
          <div className="chart-row">
            <ClickableCard
              cardKey="traffic"
              expanded={expanded === "traffic"}
              transitioning={transitioningKey === "traffic"}
              onExpand={() => openCard("traffic")}
              ariaLabel="Traffic: view full chart"
            >
              <div className="panel-head">
                <h2 className="panel-title">Statistics</h2>
                <div className="panel-head-actions">
                  <RangeTabs range={range} setRange={setRange} className="range-header" />
                </div>
              </div>
              <div className="chart-wrap card-content">
                {data && <Chart series={data.series} range={range} hour12={hour12} />}
                {loading && (
                  <div className="chart-loading" role="status" aria-label="Loading">
                    <span className="spinner" />
                  </div>
                )}
              </div>
            </ClickableCard>

            {data && (
              <TrafficSourcesCard
                sources={data.trafficSources}
                expanded={expanded === "trafficSources"}
                transitioning={transitioningKey === "trafficSources"}
                onExpand={() => openCard("trafficSources")}
              />
            )}
          </div>

          {/* Activity (always the last 24h) + Events */}
          <div className="chart-row">
            <ClickableCard
              cardKey="activity"
              expanded={expanded === "activity"}
              transitioning={transitioningKey === "activity"}
              onExpand={() => openCard("activity")}
              ariaLabel="Activity: view details"
            >
              <div className="panel-head">
                <h2 className="panel-title">Activity</h2>
                <span className="eyebrow">last 24h</span>
              </div>
              {/* a plain preview, not the full Statistics chart -- clicking
                  the card is what gets the grid/axis/tooltip version */}
              <div className="card-content">
                {activityData && <Sparkline series={activityData.series} hour12={hour12} />}
                <div className="activity-stats">
                  <div>
                    <span className="activity-stat-value num">
                      {(activityData?.totals.pageviews ?? 0).toLocaleString("en-US")}
                    </span>
                    <span className="activity-stat-label eyebrow">Pageviews</span>
                  </div>
                  <div>
                    <span className="activity-stat-value num">
                      {(activityData?.totals.visitors ?? 0).toLocaleString("en-US")}
                    </span>
                    <span className="activity-stat-label eyebrow">Visitors</span>
                  </div>
                </div>
              </div>
            </ClickableCard>

            <ClickableCard
              cardKey="events"
              expanded={expanded === "events"}
              transitioning={transitioningKey === "events"}
              onExpand={() => openCard("events")}
              ariaLabel="Events: view all"
            >
              <div className="panel-head">
                <h2 className="panel-title">Events</h2>
                <span className="eyebrow">{rangeEyebrow(range)}</span>
              </div>
              {data && data.events.length > 0 ? (
                <div className="card-content">
                  <BarChart bars={data.events.map((e) => ({ label: e.name, value: e.count }))} />
                </div>
              ) : (
                <div className="panel-empty">
                  <TallyMarks count={3} className="panel-empty-mark" />
                  <p className="ink-soft">No custom events recorded.</p>
                </div>
              )}
            </ClickableCard>
          </div>

          {/* every card below is compact and clickable -- one dense grid so
              the breakdowns fit together as a single bento of tiles */}
          <div className="card-grid">
            <StatList
              cardKey="pages"
              expanded={expanded === "pages"}
              transitioning={transitioningKey === "pages"}
              title="Top pages"
              info="Your most-visited pages in the selected time range, ranked by pageviews."
              empty="No pages recorded."
              rows={(data?.topPages ?? []).map((p) => ({ label: p.path, value: p.views }))}
              onExpand={() => openCard("pages")}
              className="card-span-2"
            />
            <StatList
              cardKey="entryPages"
              expanded={expanded === "entryPages"}
              transitioning={transitioningKey === "entryPages"}
              title="Entry pages"
              info="The first page each visitor landed on, where your traffic actually enters the site, as opposed to every page it later views."
              empty="No entry pages recorded."
              rows={(data?.entryPages ?? []).map((p) => ({ label: p.path, value: p.views }))}
              onExpand={() => openCard("entryPages")}
            />
            <StatList
              cardKey="referrers"
              expanded={expanded === "referrers"}
              transitioning={transitioningKey === "referrers"}
              title="Referrers"
              info="Where your visitors came from: the external site or search engine that linked them to you."
              empty="All traffic came in direct."
              rows={(data?.topReferrers ?? []).map((r) => ({ label: r.source, value: r.views }))}
              onExpand={() => openCard("referrers")}
              className="card-span-2"
              icon={referrerFaviconIcon}
            />
            <BreakdownCard
              tabs={platformTabs}
              activeKey={breakdownTab}
              onTabChange={(key) => setBreakdownTab(key as PlatformKey)}
              expandedKey={expanded}
              transitioningKey={transitioningKey}
              onExpand={(key) => openCard(key as ExpandTarget)}
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

          <div className="setting">
            <div className="setting-text">
              <span className="setting-name">Clock</span>
              <span className="setting-hint">12-hour or 24-hour time in charts</span>
            </div>
            <div className="theme-seg" data-active={hour12 ? "12h" : "24h"} role="group" aria-label="Clock format">
              <button
                type="button"
                className="theme-opt"
                aria-pressed={hour12}
                onClick={() => setHour12(true)}
              >
                12h
              </button>
              <button
                type="button"
                className="theme-opt"
                aria-pressed={!hour12}
                onClick={() => setHour12(false)}
              >
                24h
              </button>
            </div>
          </div>

          <button
            type="button"
            className="setting setting-action"
            onClick={() => {
              setSettingsOpen(false);
              openCard("site");
            }}
          >
            <span className="setting-text">
              <span className="setting-name">Site</span>
              <span className="setting-hint">{site ?? "—"}</span>
            </span>
            <span className="setting-chevron">
              <ChevronRightIcon />
            </span>
          </button>

        </Modal>
      )}

      {expanded && (
        <ExpandSheet
          cardKey={expanded}
          title={
            expanded === "traffic"
              ? "Traffic"
              : expanded === "trafficSources"
                ? "Traffic sources"
                : expanded === "activity"
                  ? "Activity"
                  : expanded === "site"
                    ? "Site"
                    : VIEW_ALL_CONFIG[expanded].title
          }
          eyebrow={
            expanded === "traffic" || expanded === "trafficSources"
              ? rangeEyebrow(range)
              : expanded === "activity"
                ? "last 24h"
                : undefined
          }
          onClose={closeCard}
          actions={
            expanded === "traffic" || expanded === "activity" || expanded === "site" ? undefined : expanded === "trafficSources" ? (
              sourceRows && sourceRows.length > 0 ? <ExportCsvButton title="Traffic sources" rows={sourceRows} /> : undefined
            ) : breakdownRows && breakdownRows.length > 0 ? (
              <ExportCsvButton title={VIEW_ALL_CONFIG[expanded].title} rows={breakdownRows} />
            ) : undefined
          }
        >
          {expanded === "site" ? (
            <div className="sheet-site">
              {sites.length > 1 && (
                <ul className="site-picker-list">
                  {sites.map((s) => (
                    <li key={s.site}>
                      <button
                        type="button"
                        className={`site-picker-option${s.site === site ? " is-active" : ""}`}
                        onClick={() => setSite(s.site)}
                      >
                        {s.site}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {site && (
                <a className="site-visit-link" href={siteUrl(site)} target="_blank" rel="noreferrer">
                  <span className="site-visit-domain">{site}</span>
                  <span className="site-visit-cta">Visit site <ExternalLinkIcon /></span>
                </a>
              )}
              {currentSiteInfo && (
                <dl className="site-stats">
                  <div>
                    <dt className="eyebrow">Events tracked</dt>
                    <dd className="num">{currentSiteInfo.events.toLocaleString("en-US")}</dd>
                  </div>
                  <div>
                    <dt className="eyebrow">Last seen</dt>
                    <dd className="num">{new Date(currentSiteInfo.lastSeen).toLocaleString("en-US")}</dd>
                  </div>
                </dl>
              )}
            </div>
          ) : expanded === "traffic" ? (
            <div className="sheet-traffic">
              <div className="chart-wrap sheet-content">
                {data && <Chart series={data.series} range={range} hour12={hour12} />}
                {loading && (
                  <div className="chart-loading" role="status" aria-label="Loading">
                    <span className="spinner" />
                  </div>
                )}
              </div>
              <RangeTabs range={range} setRange={setRange} className="range-sheet" />
            </div>
          ) : expanded === "activity" ? (
            <div className="sheet-traffic sheet-activity">
              <div className="sheet-content">
                <section className="kpi-grid">
                  <KpiCard
                    icon={<EyeIcon />}
                    iconVar="--accent-5"
                    label="Pageviews"
                    value={activityData?.totals.pageviews ?? 0}
                    delta={activityData?.previousTotals && deltaOf(activityData.totals.pageviews, activityData.previousTotals.pageviews)}
                  />
                  <KpiCard
                    icon={<UsersIcon />}
                    iconVar="--accent-3"
                    label="Unique visitors"
                    value={activityData?.totals.visitors ?? 0}
                    delta={activityData?.previousTotals && deltaOf(activityData.totals.visitors, activityData.previousTotals.visitors)}
                  />
                </section>
                <div className="chart-wrap activity-chart-accent">
                  {activityData && <Chart series={activityData.series} range="24h" hour12={hour12} />}
                </div>
              </div>
            </div>
          ) : expanded === "trafficSources" ? (
            <div className="sheet-traffic-sources">
              <div className="sheet-content">
                {data && <TrafficSourcesContent sources={data.trafficSources} radarSize={460} layout="column" />}
              </div>
              <h3 className="sheet-subhead">All referrers</h3>
              {sourceError ? (
                <div className="notice notice-error">
                  <strong>Couldn't load referrers.</strong> {sourceError}
                </div>
              ) : sourceRows === null ? (
                <div className="modal-loading" role="status" aria-label="Loading">
                  <span className="spinner" />
                </div>
              ) : (
                <RankedBoard rows={sourceRows} icon={referrerFaviconIcon} empty="All traffic came in direct." />
              )}
            </div>
          ) : expanded === "events" ? (
            <div className="sheet-events">
              {data && data.events.length > 0 ? (
                <div className="sheet-content">
                  <BarChart bars={data.events.map((e) => ({ label: e.name, value: e.count }))} />
                </div>
              ) : (
                <div className="panel-empty">
                  <TallyMarks count={3} className="panel-empty-mark" />
                  <p className="ink-soft">No custom events recorded.</p>
                </div>
              )}
              {/* the chart above is only the top 10 (same as the compact card,
                  just with a readable grid) -- whatever's left of the full,
                  higher-capped breakdown list shows underneath, same pattern
                  as trafficSources' "All referrers" */}
              {breakdownRows && breakdownRows.length > 10 && (
                <>
                  <h3 className="sheet-subhead">More events</h3>
                  <Rows rows={breakdownRows.slice(10)} empty="" />
                </>
              )}
            </div>
          ) : expanded === "browsers" || expanded === "systems" || expanded === "devices" || expanded === "countries" ? (
            <div className="sheet-breakdown">
              <div className="breakdown-tabs sheet-breakdown-tabs" role="tablist" aria-label="Breakdown by">
                {platformTabs.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={t.key === breakdownTab}
                    className="segment"
                    onClick={() => {
                      // just swaps what this already-open sheet shows -- no
                      // view transition, that's only for opening/closing.
                      // breakdownRows is cleared in the same batch: the
                      // effect that refetches it for the new tab doesn't run
                      // until after this paints, so without this the "More
                      // X" section below briefly rendered the *previous*
                      // tab's rows (stale data, but already sized/labelled
                      // against the new tab) -- a one-frame flash of the
                      // plain row list where the donut should be.
                      setBreakdownTab(t.key as PlatformKey);
                      setExpanded(t.key as ExpandTarget);
                      setBreakdownRows(null);
                      setBreakdownError(null);
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="sheet-content sheet-breakdown-chart">
                <BreakdownChart
                  data={activePlatformTab.chart ?? []}
                  icon={activePlatformTab.icon}
                  empty={activePlatformTab.empty}
                  size={380}
                  thickness={48}
                  lift3d
                />
              </div>
              {/* the chart above is only the top 10 (same as the compact card) --
                  rarely more than that for browsers/OS/devices, but countries
                  routinely has far more, so whatever's left of the full,
                  higher-capped breakdown list shows underneath. Countries gets
                  the same ranked-grid-with-flags treatment as "All referrers"
                  (see RankedBoard) since it's the one that can genuinely run
                  long; the others keep the plain list, they rarely need it. */}
              {breakdownRows && breakdownRows.length > (activePlatformTab.chart?.length ?? 0) && (
                <>
                  <h3 className="sheet-subhead">More {activePlatformTab.label.toLowerCase()}</h3>
                  {breakdownTab === "countries" ? (
                    <RankedBoard
                      rows={breakdownRows.slice(activePlatformTab.chart?.length ?? 0)}
                      icon={countryFlagRowIcon}
                      empty=""
                    />
                  ) : (
                    <Rows rows={breakdownRows.slice(activePlatformTab.chart?.length ?? 0)} empty="" />
                  )}
                </>
              )}
            </div>
          ) : breakdownError ? (
            <div className="notice notice-error">
              <strong>Couldn't load the full list.</strong> {breakdownError}
            </div>
          ) : breakdownRows === null ? (
            <div className="modal-loading" role="status" aria-label="Loading">
              <span className="spinner" />
            </div>
          ) : (
            <div className="sheet-content">
              <Rows
                rows={breakdownRows}
                empty={VIEW_ALL_CONFIG[expanded].empty}
                icon={expanded === "referrers" ? referrerFaviconIcon : undefined}
              />
            </div>
          )}
        </ExpandSheet>
      )}
    </div>
  );
}

function BackIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
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
    // stopPropagation: this can sit inside a whole-card click target (the
    // Statistics chart card) and shouldn't also trigger it
    <div
      className={`segmented ${className}`}
      role="group"
      aria-label="Time range"
      onClick={(e) => e.stopPropagation()}
    >
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


// Build a URL to open the tracked site in a new tab. data-site is usually a
// domain (e.g. "example.com"); add https:// if there's no scheme already.
function siteUrl(site: string): string {
  return /^https?:\/\//i.test(site) ? site : `https://${site}`;
}

function ExternalLinkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6M10 14 21 3" />
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

// Percentage change vs. the previous equal-length period. `previous === 0` is
// left as a special "new" case -- there's no sane percentage to show when the
// baseline is nothing (division by zero), but appearing from zero is itself
// worth flagging.
type Delta = { pct: number; kind: "up" | "down" | "flat" | "new" };

function deltaOf(current: number, previous: number): Delta | null {
  if (current === 0 && previous === 0) return null; // nothing to compare
  if (previous === 0) return { pct: 0, kind: "new" };
  const pct = ((current - previous) / previous) * 100;
  // a fraction of a percent either way reads as noise on a rounded chip
  if (Math.abs(pct) < 0.5) return { pct: 0, kind: "flat" };
  return { pct, kind: pct > 0 ? "up" : "down" };
}

function DeltaChip({ delta }: { delta: Delta }) {
  const label =
    delta.kind === "new"
      ? "new"
      : delta.kind === "flat"
        ? "flat"
        : `${delta.pct > 0 ? "+" : ""}${Math.round(delta.pct)}%`;
  return (
    <span className={`kpi-delta kpi-delta-${delta.kind} num`} title="vs. previous period">
      {delta.kind === "up" && <DeltaUpIcon />}
      {delta.kind === "down" && <DeltaDownIcon />}
      {label}
    </span>
  );
}

// Solid filled triangles, not thin arrow strokes -- reads as a clean up/down
// mark at this size instead of a fuzzy little hook.
function DeltaUpIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3 22 20H2Z" />
    </svg>
  );
}

function DeltaDownIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 21 2 4h20Z" />
    </svg>
  );
}

function KpiCard({
  icon,
  iconVar,
  label,
  value,
  decimals = 0,
  delta,
}: {
  icon: ReactNode;
  iconVar: string; // a CSS custom property name, e.g. "--accent" -- the icon circle's colour
  label: string;
  value: number;
  decimals?: number;
  delta?: Delta | null;
}) {
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
  const iconStyle = { "--kpi-icon": `var(${iconVar})` } as CSSProperties;
  return (
    <div className="kpi-card">
      <div className="kpi-card-head">
        <div className="kpi-label eyebrow">{label}</div>
        <span className="kpi-icon" style={iconStyle}>{icon}</span>
      </div>
      <div className="kpi-value-row">
        <div className="kpi-value num" title={big ? full : undefined}>{shown}</div>
        {delta && <DeltaChip delta={delta} />}
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7-10.5-7-10.5-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function RatioIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 19V10M12 19V5M20 19v-6" />
    </svg>
  );
}

// A centered dialog over a dimmed backdrop. Closes on the backdrop, on the X, or
// on Escape, and freezes the page scroll while it's up.
// A full-screen sheet, not a small centered dialog -- what a compact card
// (see ClickableCard) expands into. Wears the same view-transition-name the
// card just gave up (see cardKey/App's openCard), so where the browser
// supports it, this visibly grows out of the card's exact on-screen rect
// instead of just appearing. Closes on the backdrop, the X, or Escape.
function ExpandSheet({
  cardKey,
  title,
  eyebrow,
  onClose,
  actions,
  children,
}: {
  cardKey: string;
  title: string;
  eyebrow?: string;
  onClose: () => void;
  actions?: ReactNode;
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

  // Browsers without the View Transitions API (Firefox, at the time of writing)
  // still get a proper opening animation -- just a plain fade/scale-in rather
  // than one that visibly grows out of the card's exact position.
  const fallbackAnim =
    typeof (document as Document & { startViewTransition?: unknown }).startViewTransition !== "function";
  const style: CSSProperties = { viewTransitionName: `card-${cardKey}` } as CSSProperties;

  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <div
        className={`sheet${fallbackAnim ? " sheet-fallback-anim" : ""}`}
        style={style}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <div>
            <h2 className="sheet-title">{title}</h2>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          </div>
          <div className="modal-head-actions">
            {actions}
            <button type="button" className="modal-close" onClick={onClose} aria-label="Close" title="Close">
              <CloseIcon />
            </button>
          </div>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
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
