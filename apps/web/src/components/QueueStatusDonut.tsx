import type { HealthBreakdown } from "../lib/controlViewModel";

const RADIUS = 34;
const STROKE = 10;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const SEGMENTS: { key: keyof HealthBreakdown; className: string }[] = [
  { key: "healthy", className: "fp-donut-healthy" },
  { key: "busy", className: "fp-donut-busy" },
  { key: "critical", className: "fp-donut-critical" },
];

/** "Queue Status Distribution" — how many Services sit in each Health band right now. */
export function QueueStatusDonut({ breakdown }: { breakdown: HealthBreakdown }) {
  const total = breakdown.healthy + breakdown.busy + breakdown.critical;
  let offset = 0;

  return (
    <div className="fp-donut-wrap">
      <svg viewBox="0 0 84 84" className="fp-donut" role="img" aria-label={`${total} Services total`}>
        <circle cx="42" cy="42" r={RADIUS} className="fp-donut-track" strokeWidth={STROKE} fill="none" />
        {total > 0
          ? SEGMENTS.map(({ key, className }) => {
              const value = breakdown[key];
              if (value === 0) return null;
              const length = (value / total) * CIRCUMFERENCE;
              const dasharray = `${length} ${CIRCUMFERENCE - length}`;
              const el = (
                <circle
                  key={key}
                  cx="42"
                  cy="42"
                  r={RADIUS}
                  className={className}
                  strokeWidth={STROKE}
                  fill="none"
                  strokeDasharray={dasharray}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 42 42)"
                />
              );
              offset += length;
              return el;
            })
          : null}
        <text x="42" y="39" textAnchor="middle" className="fp-donut-total">
          {total}
        </text>
        <text x="42" y="53" textAnchor="middle" className="fp-donut-total-label">
          Total
        </text>
      </svg>
      <ul className="fp-donut-legend">
        <li data-tone="healthy">Healthy {breakdown.healthy}</li>
        <li data-tone="busy">Busy {breakdown.busy}</li>
        <li data-tone="critical">Critical {breakdown.critical}</li>
      </ul>
    </div>
  );
}
