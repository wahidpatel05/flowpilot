const WIDTH = 220;
const HEIGHT = 64;
const PADDING = 6;

/** A session trend line for the facility's average wait — "Queue Trend". */
export function QueueTrendSparkline({ points }: { points: readonly number[] }) {
  if (points.length < 2) {
    return <p className="fp-sparkline-empty">Trend appears after a couple of updates.</p>;
  }

  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;

  const coords = points.map((value, index) => {
    const x = PADDING + (index / (points.length - 1)) * (WIDTH - PADDING * 2);
    const y = HEIGHT - PADDING - ((value - min) / range) * (HEIGHT - PADDING * 2);
    return [x, y] as const;
  });

  const linePath = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${coords[coords.length - 1]![0].toFixed(1)},${HEIGHT} L${coords[0]![0].toFixed(1)},${HEIGHT} Z`;
  const last = coords[coords.length - 1]!;

  return (
    <svg
      className="fp-sparkline"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="Average wait trend this session"
    >
      <path d={areaPath} className="fp-sparkline-area" />
      <path d={linePath} className="fp-sparkline-line" />
      <circle cx={last[0]} cy={last[1]} r="3.2" className="fp-sparkline-dot" />
    </svg>
  );
}
