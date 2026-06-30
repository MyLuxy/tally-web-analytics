import { useEffect, useState } from "react";
import type { Range, Site, Stats } from "./api.js";
import { fetchSites, fetchStats, getToken, setToken, Unauthorized } from "./api.js";
import { TallyMarks } from "./components/TallyMarks.js";
import { Chart } from "./components/Chart.js";
import { StatList } from "./components/StatList.js";

const RANGES: Range[] = ["24h", "7d", "30d"];

// Turn a 2-letter country code into "🇮🇹 Italy". The flag is just the two
// regional-indicator codepoints; the name comes from Intl so we don't ship a
// country table. Falls back to the raw code if anything's off.
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
function countryLabel(code: string): string {
  const flag = [...code].map((ch) => String.fromCodePoint(0x1f1a5 + ch.charCodeAt(0))).join("");
  let name = code;
  try {
    name = regionNames.of(code) ?? code;
  } catch {
    /* invalid code -- just show what we got */
  }
  return `${flag} ${name}`;
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
          <TallyMarks count={5} className="brand-mark" />
          <div>
            <div className="brand-name">Tally</div>
            <div className="brand-sub">self-hosted analytics</div>
          </div>
        </div>

        <div className="controls">
          <span className="site-pill">
            <span className="eyebrow">site</span>
            {sites.length > 1 ? (
              <select
                className="site-select num"
                value={site ?? ""}
                onChange={(e) => setSite(e.target.value)}
                aria-label="Site"
              >
                {sites.map((s) => (
                  <option key={s.site} value={s.site}>
                    {s.site}
                  </option>
                ))}
              </select>
            ) : (
              <span className="num">{site ?? "—"}</span>
            )}
          </span>

          <div className="segmented" role="group" aria-label="Time range">
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
          </section>

          <div className="grid-two">
            <StatList
              title="Top pages"
              unit="views"
              empty="No pages recorded."
              rows={(data?.topPages ?? []).map((p) => ({ label: p.path, value: p.views }))}
            />
            <StatList
              title="Referrers"
              unit="views"
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
              rows={(data?.countries ?? []).map((c) => ({ label: countryLabel(c.name), value: c.views }))}
            />
          </div>
        </main>
      )}
    </div>
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
