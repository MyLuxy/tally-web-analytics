// The signature mark. Draws `count` strokes the way you'd actually tally on
// paper: four uprights and a diagonal slash through them for every fifth.
// Used in the wordmark and in empty states, where a hand-counted glyph says
// "counting" far better than an icon from a set would.

type Props = {
  count?: number;
  className?: string;
};

const GROUP_W = 34; // width of one full five-bar gate
const H = 26;

function Group({ n, x }: { n: number; x: number }) {
  const bars = Math.min(n, 4);
  return (
    <g transform={`translate(${x} 0)`} stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
      {Array.from({ length: bars }, (_, i) => (
        <line key={i} x1={4 + i * 6} y1={3} x2={4 + i * 6} y2={H - 3} />
      ))}
      {n >= 5 && <line x1={1} y1={H - 2} x2={27} y2={2} />}
    </g>
  );
}

export function TallyMarks({ count = 5, className }: Props) {
  const groups = Math.ceil(count / 5) || 1;
  const width = groups * GROUP_W;

  return (
    <svg
      className={className}
      width={width}
      height={H}
      viewBox={`0 0 ${width} ${H}`}
      role="img"
      aria-label={`${count}`}
    >
      {Array.from({ length: groups }, (_, g) => (
        <Group key={g} n={count - g * 5} x={g * GROUP_W} />
      ))}
    </svg>
  );
}
