/**
 * The one label that says a Token came from Simulate Rush.
 *
 * CONTEXT.md: "Tokens it creates are marked simulated and must be visibly
 * labelled." The acceptance run asserts that no simulated Token reaches a
 * surface unmarked (`npm --prefix scripts run acceptance`, step S3b), and that
 * guarantee is only worth something if every surface says the same word. Four
 * private spellings of it across Control, the Desk and the Visitor PWA is how a
 * judge ends up asking which of them means something different.
 *
 * The caller supplies the class, because the chip on Control's queue detail and
 * the quiet note under the Desk's Now Serving are the same claim in two
 * different visual registers.
 */

/** The word, so no surface has to spell it for itself. */
export const SIMULATED_LABEL = "Simulated";

export function SimulatedTag({
  className = "fp-cold-start",
  /** Appended after the label — "Visitor", "demo token", the rush's name. */
  detail,
}: {
  className?: string;
  detail?: string;
}) {
  return (
    <span className={className}>
      {SIMULATED_LABEL}
      {detail === undefined ? null : ` ${detail}`}
    </span>
  );
}
