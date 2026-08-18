/**
 * DeQueue golden path — proves the closed loop closes, against the real
 * Supabase project, with no UI involved.
 *
 *   npm --prefix scripts run golden-path
 *
 * The demo is one causal chain, and until something drives the whole chain end
 * to end, "the Visitor's ETA drops" is a claim rather than a fact. This script
 * drives every hop through the database RPCs and asserts the one number that
 * matters: the Visitor's recomputed ETA is STRICTLY LOWER after the Intervention
 * than before it. Everything else the chain does is setup for that assertion.
 *
 * It is also the Android team's unblocker. Android's signature moment is the ETA
 * dropping on the phone, which requires a real Intervention to be applied.
 * Running this fires one, so the phone can be built and verified before a single
 * line of Control exists.
 *
 * The chain itself lives in `closedLoop.ts` — this file is the one-pass CLI over
 * it. For the acceptance run (two passes from a clean reset, plus the checks
 * issue #14 asks for) use `npm --prefix scripts run acceptance`.
 *
 * The database is reset to the seeded baseline at the start AND after the run,
 * so a failed run leaves nothing behind.
 */
import { createDeQueueClient, loadSupabaseConfig } from "./client.js";
import { restoreBaseline, runClosedLoopPass } from "./closedLoop.js";
import { Report } from "./report.js";

async function main(): Promise<void> {
  const config = loadSupabaseConfig();
  process.stdout.write(
    [
      "=".repeat(78),
      "DeQueue golden path — driving the closed loop against the live project",
      "=".repeat(78),
      `Project: ${config.url}`,
      "Reads and writes only through the publishable key and the demo RPCs.",
    ].join("\n") + "\n",
  );

  const client = createDeQueueClient(config);
  const report = new Report();
  let headline: string[] = [];
  let failure: Error | undefined;

  try {
    headline = (await runClosedLoopPass(report, client)).headline;
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error));
  }

  try {
    await restoreBaseline(report, client);
  } catch (error) {
    const cleanupError = error instanceof Error ? error : new Error(String(error));
    report.note(`Baseline restore reported: ${cleanupError.message}`);
    failure = failure ?? cleanupError;
  }

  report.print(headline, failure);
  process.exit(failure === undefined ? 0 : 1);
}

await main();
