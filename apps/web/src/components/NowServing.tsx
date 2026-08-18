"use client";

import { useEffect, useState } from "react";
import type { ActiveToken } from "../hooks/useActiveCounterTokens";
import { formatElapsedMinutes } from "../lib/elapsed";

/** Ticks once a second so the elapsed clock moves without a refetch. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function NowServing({
  servingToken,
  calledToken,
}: {
  servingToken: ActiveToken | null;
  calledToken: ActiveToken | null;
}) {
  const now = useNow();

  if (servingToken !== null) {
    return (
      <div className="fp-card fp-desk-now-serving">
        <span className="fp-metric-label">Now Serving</span>
        {/* Keyed on the Token so the flip replays each time the number changes. */}
        <span className="fp-desk-token-number" key={servingToken.tokenNumber}>
          {servingToken.tokenNumber}
        </span>
        <span className="fp-metric-value" data-emphasis="wait">
          {formatElapsedMinutes(servingToken.startedAtMillis, now)}
          <span className="fp-metric-unit">elapsed</span>
        </span>
      </div>
    );
  }

  if (calledToken !== null) {
    return (
      <div className="fp-card fp-desk-now-serving">
        <span className="fp-metric-label">Called — waiting to start</span>
        <span className="fp-desk-token-number" key={calledToken.tokenNumber}>
          {calledToken.tokenNumber}
        </span>
      </div>
    );
  }

  return (
    <div className="fp-card fp-desk-now-serving">
      <span className="fp-metric-label">Now Serving</span>
      <span className="fp-empty">Nobody at this Counter yet.</span>
    </div>
  );
}
