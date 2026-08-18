"use client";

import { ESTIMATED_TIME_RETURNED_LABEL, formatMinutesReturned } from "../lib/core";

/**
 * The cumulative Estimated Time Returned — the figure that counts up as
 * Interventions are applied, and the one the Manager is here to watch.
 *
 * ESTIMATED, NEVER MEASURED (ADR-0002). The caveat states the provenance out
 * loud, because nobody observes the facility that didn't happen — but it states
 * it WITHOUT the word "measured". A judge reads the screen, not the sentence
 * structure, and the one word we must never be seen claiming should not appear
 * beside the figure even inside a denial of it. The acceptance run enforces
 * that: the word may live in a comment like this one and nowhere a Visitor or a
 * Manager can read it.
 *
 * The formatting is the engine's own `formatMinutesReturned`: minutes under an
 * hour, hours and minutes above.
 */
export function TimeReturnedCard({
  minutes,
  realisedCount,
  pulse,
}: {
  minutes: number;
  realisedCount: number;
  /** TRUE just after an apply, so the figure visibly counts up. */
  pulse: boolean;
}) {
  return (
    <section className="fp-time-returned" aria-label={ESTIMATED_TIME_RETURNED_LABEL}>
      <div className="fp-time-returned-main">
        <span className="fp-metric-label">{ESTIMATED_TIME_RETURNED_LABEL}</span>
        {/* Keyed on the value so a new total replays the count-up animation. */}
        <p className="fp-time-returned-value" key={minutes} data-pulse={pulse ? "true" : undefined}>
          {formatMinutesReturned(minutes)}
        </p>
        <span className="fp-time-returned-note">
          {realisedCount === 0
            ? "Nothing applied yet this session."
            : `across ${realisedCount} applied Intervention${realisedCount === 1 ? "" : "s"}`}
        </span>
      </div>
      <p className="fp-time-returned-caveat">
        Estimated from the simulator&rsquo;s counterfactual — the waiting that
        didn&rsquo;t happen, which nobody could observe.
      </p>
    </section>
  );
}
