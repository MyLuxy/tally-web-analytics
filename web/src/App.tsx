import { useEffect, useState } from "react";
import type { Range, Site, Stats } from "./api.js";
import { fetchSites, fetchStats } from "./api.js";
import { TallyMarks } from "./components/TallyMarks.js";
import { Chart } from "./components/Chart.js";
import { StatList } from "./components/StatList.js";

const RANGES: Range[] = ["24h", "7d", "30d"];

export function App() {
  const [sites, setSites] = useState<Site[]>([]);
  const [site, setSite] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("7d");
  const [data, setData] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Pull the list of sites once, then default to the most active one.
  useEffect(() => {
    fetchSites()
      .then((list) => {
        setSites(list);
        setSite((current) => current ?? list[0]?.site ?? null);
        if (list.length === 0) setLoading(false); // nothing to fetch stats for
      })
      .catch(() => {
        /* the stats fetch below surfaces the error; nothing to add here */
      });
  }, []);

  useEffect(() => {
    if (!site) return;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchStats(site, range)
      .then((s) => setData(s))
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "something went wrong");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [site, range]);

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

      {error && (
        <div className="notice notice-error">
          <strong>Couldn't load stats.</strong> {error}
          <div className="ink-soft">Is the server running on :3000?</div>
        </div>
      )}

      {!error && !hasData && !loading && (
        <div className="empty">
          <TallyMarks count={4} className="empty-mark" />
          <h2>No counts yet</h2>
          <p className="ink-soft">
            Embed the tracker on your site, open a page, then reload. Events for{" "}
            <span className="num">{site}</span> in the last {range} will show up here.
          </p>
        </div>
      )}

      {!error && (hasData || loading) && (
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

          <div className="grid-three">
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
          </div>
        </main>
      )}
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
