import type { Stats } from "../api.js";

// A bare preview of a traffic trend -- no axis, grid, legend or tooltip
// (that's what the full <Chart> is for). A real (non-stretched) aspect
// ratio this time -- CSS just scales it down to fit, it doesn't distort it
// into a flat smear the way preserveAspectRatio="none" used to.
export function Sparkline({ series }: { series: Stats["series"] }) {
  const W = 320;
  const H = 150;
  const n = series.length;
  const maxY = Math.max(1, ...series.map((p) => p.pageviews));
  const xFor = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
  const yFor = (v: number) => H - (v / maxY) * H;

  const linePath = series.map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(p.pageviews)}`).join(" ");
  const areaPath =
    n > 0
      ? `M ${xFor(0)} ${H} ` +
        series.map((p, i) => `L ${xFor(i)} ${yFor(p.pageviews)}`).join(" ") +
        ` L ${xFor(n - 1)} ${H} Z`
      : "";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sparkline" aria-hidden="true">
      <path d={areaPath} className="sparkline-area" />
      {n > 1 && <path d={linePath} className="sparkline-line" />}
    </svg>
  );
}
