import { useState } from "react";
import { TallyMarks } from "./components/TallyMarks.js";

const RANGES = ["24h", "7d", "30d"] as const;
type Range = (typeof RANGES)[number];

export function App() {
  // site is hard-coded for now; once the server grows multi-site auth this
  // becomes a real picker fed by the API.
  const [site] = useState("demo");
  const [range, setRange] = useState<Range>("7d");

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
            <span className="num">{site}</span>
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

      <main className="content">
        <p className="eyebrow">range · {range}</p>
        <p className="ink-soft">Dashboard panels land in the next commit.</p>
      </main>
    </div>
  );
}
