/**
 * DeQueue acceptance run — issue #14 (S3).
 *
 *   npm --prefix scripts run acceptance            # two passes, the default
 *   npm --prefix scripts run acceptance -- --passes 3
 *
 * The golden path proves the loop closes once. This proves the things a judge
 * will actually catch us on, which are different claims:
 *
 *   - it is REPEATABLE, not lucky — the chain runs twice from a clean reset and
 *     the two passes are compared against each other;
 *   - it SURVIVES A REFRESH — every number is re-derived through a brand-new
 *     client with no subscriptions and no warm state, which is what F5 does;
 *   - `approved` NEVER RENDERS AFTER `applied` — asserted through Control's own
 *     `buildTimeline`, including with every timestamp collapsed into one
 *     millisecond, which is the case that actually breaks naive ordering;
 *   - SIMULATED VISITORS STAY MARKED — every Token Simulate Rush injected is
 *     still flagged in the projection each surface renders from;
 *   - THE FORECAST APPEARS — Control's own view model predicts rather than echoing
 *     the present, and names the Service under pressure;
 *   - THE VISITOR HOP LANDS WITHOUT THE PHONE — the dead-phone rehearsal, at the
 *     data layer;
 *   - NO SURFACE SAYS THE BANNED WORD — ADR-0002, across all three surfaces.
 *
 * What this cannot do is look at a screen. Pixels, the mid-demo refresh in a real
 * browser, the phone-off rehearsal in a real browser, and who narrates which
 * moment live in `docs/acceptance/s3-acceptance-run.md`. Run this first: it fails
 * fast and cheaply, and it leaves the database at the seeded baseline, ready for
 * the human run-through.
 *
 * There is exactly one implementation of the chain — `closedLoop.ts`, shared with
 * the golden path. Two would eventually disagree about what the demo is.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildControlViewModel } from "../../apps/web/src/lib/controlViewModel.js";
import { buildInterventionLedger } from "../../apps/web/src/lib/interventionLedger.js";
import type { InterventionRow } from "../../apps/web/src/lib/interventionTarget.js";
import { buildTimeline } from "../../apps/web/src/lib/interventionTimeline.js";
import { generateTokenNumber } from "../../apps/web/src/lib/tokenNumber.js";
import {
  QUEUEING_TOKEN_STATUSES,
  findProjectedService,
  projectTokenEta,
} from "../../flowpilot-core/src/index.js";
import { createDeQueueClient, loadSupabaseConfig } from "./client.js";
import type { SupabaseConfig } from "./client.js";
import {
  CAUSAL_CHAIN,
  loadTimeline,
  project,
  restoreBaseline,
  runClosedLoopPass,
} from "./closedLoop.js";
import type { ClosedLoopPass } from "./closedLoop.js";
import { findBannedCopy } from "./copyGuard.js";
import { HarnessFailure, Report, minutes } from "./report.js";

/**
 * How far two passes may differ and still count as the same demo.
 *
 * Not zero: `projectFacility` blends completed service durations and derives
 * arrival rates against `now`, so the second pass runs a minute or two later
 * against a queue whose Tokens have aged. A tolerance says "the same demo";
 * strict equality would say "the same instant", which is not a property the
 * facility has.
 */
const ETA_TOLERANCE_MINUTES = 2;
const RETURNED_TOLERANCE_RATIO = 0.1;

/** Token numbers this check issues, so a crashed run can be tidied up. */
const PWA_TOKEN_PREFIX = "PWA-";

interface PassOutcome {
  index: number;
  pass: ClosedLoopPass;
}

/* ------------------------------------------------------------------ *
 * S3a — every surface survives a mid-demo refresh
 * ------------------------------------------------------------------ */

async function loadInterventionRows(client: SupabaseClient): Promise<InterventionRow[]> {
  const { data, error } = await client
    .from("interventions")
    .select(
      "id,status,action_type,action_payload,estimated_minutes_returned,created_at,approved_at,accepted_at,applied_at",
    );
  if (error !== null) {
    throw new Error(`Failed to read interventions: ${error.message}`);
  }
  return (data ?? []) as unknown as InterventionRow[];
}

/**
 * A refresh is not a subtle thing: the page loses every subscription, every
 * hook's state and every number it was holding, and rebuilds all of it from the
 * database. So this uses a BRAND-NEW client — not the one that just drove the
 * chain — and re-derives the demo's claims from a cold read. Anything that only
 * lived in React state disappears here, which is the point.
 */
async function assertSurvivesRefresh(
  report: Report,
  config: SupabaseConfig,
  pass: ClosedLoopPass,
): Promise<void> {
  report.begin("S3a", "Every surface survives a mid-demo refresh (cold re-derivation)");

  const freshClient = createDeQueueClient(config);
  const refreshed = await project(freshClient);
  const service = findProjectedService(refreshed, pass.serviceId);

  report.assert(
    "The capacity change is still there after a cold read",
    service?.activeCounters === pass.activeCountersAfter,
    `${String(service?.activeCounters)} active Counter(s), the ${pass.activeCountersAfter} the apply left behind`,
  );

  const eta = projectTokenEta(refreshed, pass.visitorTokenId);
  report.assert(
    "The Visitor's ETA re-derives, and is still lower than before the Intervention",
    eta !== null &&
      Number.isFinite(eta.predictedWaitMinutes) &&
      eta.predictedWaitMinutes < pass.etaBeforeMinutes,
    eta === null
      ? "the Token no longer projects to an ETA at all"
      : `${minutes(pass.etaBeforeMinutes)} before, ${minutes(eta.predictedWaitMinutes)} after the refresh`,
  );

  // The figure the Manager is watching, rebuilt by Control's own reducer rather
  // than by a second implementation of the sum.
  const ledger = buildInterventionLedger(await loadInterventionRows(freshClient));
  const drift = Math.abs(ledger.cumulativeMinutesReturned - pass.estimatedMinutesReturned);
  report.assert(
    "Estimated Time Returned survives the refresh (Control's own ledger, re-read)",
    ledger.realisedCount === 1 && drift < 0.05,
    `${ledger.cumulativeMinutesReturned.toFixed(1)} person-minutes across ` +
      `${ledger.realisedCount} realised Intervention(s), against the pass's ` +
      `${pass.estimatedMinutesReturned.toFixed(1)}`,
  );

  const timeline = await loadTimeline(report, freshClient, pass.interventionId);
  report.assert(
    "The timeline still holds the whole causal chain after the refresh",
    timeline.map((event) => event.event_type).join(" -> ") === CAUSAL_CHAIN.join(" -> "),
    timeline.map((event) => event.event_type).join(" -> "),
  );
}

/* ------------------------------------------------------------------ *
 * S3g — the forecast hop
 * ------------------------------------------------------------------ */

/**
 * "Simulate Rush, Examination Cell becomes critical, forecast appears" — the
 * forecast is a hop in the chain the judge watches, so it gets an assertion
 * rather than a hope.
 *
 * Built with `buildControlViewModel`, which is what Control renders from and
 * which calls `simulateFacility` itself: this asserts the Manager's own forecast
 * exists, points at the Service under demonstration, and is a projection into
 * the future rather than a copy of the present. Whether the *screen* labels it as
 * a prediction (issue #1, story 36) is a thing only eyes can check — the runbook
 * owns that.
 *
 * Called with the projection taken after the apply, so it also proves the
 * forecast still derives once capacity has changed.
 */
function assertForecastAppears(report: Report, pass: ClosedLoopPass): void {
  report.begin("S3g", "The forecast appears, and names the Service under pressure");

  const viewModel = buildControlViewModel({ projection: pass.appliedProjection });
  const service = viewModel.services.find((node) => node.serviceId === pass.serviceId);

  report.assert(
    "Control's forecast covers every Service, over a real horizon",
    viewModel.services.length === pass.appliedProjection.serviceDetails.length &&
      viewModel.horizonMinutes > 0,
    `${viewModel.services.length} Service(s) forecast over ${viewModel.horizonMinutes} min`,
  );

  report.assert(
    "The forecast is a prediction, not a copy of the present",
    service !== undefined &&
      (service.forecast.queueLength !== service.now.queueLength ||
        service.forecast.waitMinutes !== service.now.waitMinutes),
    service === undefined
      ? "the Service under demonstration is missing from the forecast"
        // The forecast queue is a modelled rate, so it is fractional. Round it for
        // reading; the assertion above compares the raw values.
      : `now: queue ${service.now.queueLength} at ${minutes(service.now.waitMinutes)} (${service.now.health}) -> ` +
        `forecast: queue ${service.forecast.queueLength.toFixed(1)} at ` +
        `${minutes(service.forecast.waitMinutes)} (${service.forecast.health})`,
  );

  report.assert(
    "It calls out a Service under pressure by name",
    viewModel.criticalNow !== null || viewModel.criticalForecast !== null,
    `critical now: ${viewModel.criticalNow ?? "none"}, critical at the horizon: ` +
      `${viewModel.criticalForecast ?? "none"}`,
  );
}

/* ------------------------------------------------------------------ *
 * S3b — simulated Visitors are visibly marked throughout
 * ------------------------------------------------------------------ */

/**
 * Every surface renders Tokens out of the projection, so "visibly marked"
 * reduces to one checkable claim: no Token Simulate Rush created ever reaches a
 * surface without `isSimulated` set. Checked against the database's own
 * `is_simulated` column rather than against the list the pass collected, so a
 * flag dropped between the two is caught rather than confirmed.
 */
async function assertSimulatedVisitorsMarked(
  report: Report,
  client: SupabaseClient,
  pass: ClosedLoopPass,
): Promise<void> {
  report.begin("S3b", "Simulated Visitors are visibly marked throughout");

  // `waiting` and `called` only, matching QUEUEING_TOKEN_STATUSES: a `serving`
  // Token has left the queue and `projectFacility` deliberately drops it from
  // `ProjectedService.queue`. Asking for it back would fail the moment the Desk
  // starts serving a rush Token, which is exactly what the human half of the
  // acceptance run does.
  const { data, error } = await client
    .from("tokens")
    .select("id,token_number,status,is_simulated")
    .eq("is_simulated", true)
    .in("status", QUEUEING_TOKEN_STATUSES as readonly string[]);
  if (error !== null) {
    throw new Error(`Failed to read the simulated Tokens: ${error.message}`);
  }
  const simulatedInDatabase = new Set((data ?? []).map((row) => row.id as string));

  const projection = await project(client);
  const flagged = new Set<string>();
  const unflagged: string[] = [];
  for (const service of projection.serviceDetails) {
    for (const entry of service.queue) {
      if (entry.isSimulated) {
        flagged.add(entry.tokenId);
      } else if (simulatedInDatabase.has(entry.tokenId)) {
        unflagged.push(entry.tokenNumber);
      }
    }
  }

  report.assert(
    "No simulated Token reaches a surface unmarked",
    unflagged.length === 0,
    unflagged.length === 0
      ? `${flagged.size} simulated Token(s) in the queues, every one flagged`
      : `unmarked: ${unflagged.join(", ")}`,
  );

  const missing = [...simulatedInDatabase].filter((id) => !flagged.has(id));
  report.assert(
    "Every simulated Token the database holds reaches the projection",
    missing.length === 0,
    `${simulatedInDatabase.size} simulated Token(s) queued, ${flagged.size} projected`,
  );

  const service = findProjectedService(projection, pass.serviceId);
  report.assert(
    "The Service under demonstration separates its real Visitors from the rush",
    (service?.simulatedQueueLength ?? 0) === pass.simulatedTokenIds.length &&
      (service?.realQueueLength ?? 0) > 0,
    `${String(service?.simulatedQueueLength)} simulated + ${String(service?.realQueueLength)} real ` +
      `= ${String(service?.queueLength)} waiting`,
  );
}

/* ------------------------------------------------------------------ *
 * S3c — approved never renders after applied
 * ------------------------------------------------------------------ */

interface RenderableEvent {
  id: string;
  intervention_id: string;
  event_type: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

function renderable(
  pass: ClosedLoopPass,
  suffix: string,
  createdAt?: string,
): RenderableEvent[] {
  return pass.timeline.map((event, index) => ({
    id: `${pass.interventionId}-${suffix}-${index}`,
    intervention_id: pass.interventionId,
    event_type: event.event_type,
    message: event.message,
    metadata: event.metadata,
    created_at: createdAt ?? event.created_at,
  }));
}

/**
 * Asserted through the module Control renders with, not through a copy of its
 * rules — and then again with every timestamp collapsed into ONE millisecond.
 *
 * That second case is the real one. `approve_recommendation()` writes
 * `recommendation_created` and `approved` in a single call and
 * `apply_intervention()` writes `applied` and `eta_recalculated` in another;
 * both stamp `clock_timestamp()`, but that has microsecond resolution and
 * `Date.parse` truncates to the millisecond. On a coarser clock — a different
 * host, a busier database — those pairs tie, and anything ordering on the
 * timestamp alone renders `applied` above `approved` at random. A demo that
 * shows the approval after the change it authorised is a demo about a system
 * nobody should approve anything in.
 */
function assertTimelineOrdering(report: Report, pass: ClosedLoopPass): void {
  report.begin("S3c", "approved never renders after applied (Control's own ordering)");

  const asWritten = buildTimeline(renderable(pass, "live")).map((entry) => entry.eventType);
  report.assert(
    "Control renders the timeline in causal order",
    asWritten.join(" -> ") === CAUSAL_CHAIN.join(" -> "),
    asWritten.join(" -> "),
  );

  // One instant for all five events: the worst case a coarse clock can produce.
  const ONE_INSTANT = "2026-08-18T09:00:00.000Z";
  const tied = buildTimeline(renderable(pass, "tied", ONE_INSTANT)).map(
    (entry) => entry.eventType,
  );
  report.assert(
    "It still does when every event lands in the same millisecond",
    tied.indexOf("approved") < tied.indexOf("applied") &&
      tied.join(" -> ") === CAUSAL_CHAIN.join(" -> "),
    tied.join(" -> "),
  );

  const reversedRows = renderable(pass, "reversed", ONE_INSTANT).reverse();
  const reversed = buildTimeline(reversedRows).map((entry) => entry.eventType);
  report.assert(
    "And when the database hands the rows back in reverse",
    reversed.join(" -> ") === CAUSAL_CHAIN.join(" -> "),
    reversed.join(" -> "),
  );
}

/* ------------------------------------------------------------------ *
 * S3d — the failure rehearsal, at the data layer
 * ------------------------------------------------------------------ */

/**
 * The dead-phone rehearsal without the browser: a Visitor joins the way the PWA
 * route joins, into the facility as the demo leaves it, and gets a real position
 * and a real ETA.
 *
 * The Token number comes from the web app's own `generateTokenNumber`, so the
 * numbering rule is not restated here. The insert itself is: `joinQueue()` binds
 * the browser's Supabase singleton at module scope and cannot be handed another
 * client, so the four columns are written directly. If that insert shape ever
 * changes, this is the assertion to change with it.
 *
 * This does not replace the browser rehearsal in the runbook — the acceptance
 * criterion asks for the PWA in a browser and means it. It proves the hop the
 * PWA depends on is open before anyone opens a browser to find out.
 */
async function assertVisitorHopLandsWithoutThePhone(
  report: Report,
  client: SupabaseClient,
  pass: ClosedLoopPass,
): Promise<void> {
  report.begin("S3d", "Failure rehearsal: the Visitor hop lands with no phone involved");

  const tokenNumber = `${PWA_TOKEN_PREFIX}${generateTokenNumber("examination")}`;
  const insertion = await client
    .from("tokens")
    .insert({
      service_id: pass.serviceId,
      token_number: tokenNumber,
      status: "waiting",
      is_simulated: false,
    })
    .select("id,token_number,status,is_simulated")
    .single();
  if (insertion.error !== null) {
    throw new HarnessFailure(
      `The PWA's Join Queue hop is closed: ${insertion.error.message}`,
    );
  }
  const tokenId = insertion.data.id as string;

  try {
    report.assert(
      "A Visitor joins through the PWA's own path, with no phone",
      insertion.data.status === "waiting" && insertion.data.is_simulated === false,
      `Token ${String(insertion.data.token_number)} is waiting, and is not marked simulated`,
    );

    const projection = await project(client);
    const eta = projectTokenEta(projection, tokenId);
    report.assert(
      "That Visitor gets a real position and a finite ETA",
      eta !== null &&
        Number.isFinite(eta.predictedWaitMinutes) &&
        eta.predictedWaitMinutes > 0 &&
        eta.customersAhead > 0,
      eta === null
        ? "no ETA at all"
        : `${minutes(eta.predictedWaitMinutes)} with ${eta.customersAhead} people ahead, Health ${eta.health}`,
    );
  } finally {
    // Clean up what this check created, whatever it concluded. The baseline
    // restore would also remove it, but only while `reset_demo()` is healthy.
    const { error } = await client.from("tokens").delete().eq("id", tokenId);
    if (error !== null) {
      report.note(
        `Could not remove the rehearsal Token ${tokenNumber}: ${error.message}. ` +
          "Delete it by hand before the demo.",
      );
    }
  }
}

/* ------------------------------------------------------------------ *
 * S3e — no surface says the banned word
 * ------------------------------------------------------------------ */

function assertNoSurfaceOverclaims(report: Report): void {
  report.begin("S3e", "No surface displays the banned wording for Estimated Time Returned");

  const { violations, filesScanned } = findBannedCopy();
  for (const violation of violations) {
    report.info(`${violation.file}:${violation.line} — ${violation.text}`);
  }
  report.assert(
    "Control, Desk, the Visitor PWA and the Android app all avoid it (ADR-0002)",
    violations.length === 0,
    violations.length === 0
      ? `${filesScanned} source files scanned, comments excluded, 0 violations`
      : `${violations.length} violation(s) across ${filesScanned} files — listed above`,
  );
}

/* ------------------------------------------------------------------ *
 * Repeatability — the passes describe the same demo
 * ------------------------------------------------------------------ */

function assertPassesAgree(report: Report, outcomes: readonly PassOutcome[]): void {
  report.begin("S3f", "The passes agree, so the chain is repeatable rather than lucky");

  const first = outcomes[0];
  if (first === undefined) throw new HarnessFailure("No pass completed.");
  report.assert(
    "At least two passes ran from a clean reset",
    outcomes.length >= 2,
    `${outcomes.length} pass(es) completed`,
  );

  for (const outcome of outcomes.slice(1)) {
    const label = `pass ${outcome.index} against pass ${first.index}`;

    report.assert(
      `Every pass drops the Visitor's ETA (${label})`,
      outcome.pass.etaAfterMinutes < outcome.pass.etaBeforeMinutes,
      `${minutes(outcome.pass.etaBeforeMinutes)} -> ${minutes(outcome.pass.etaAfterMinutes)}`,
    );

    const beforeDrift = Math.abs(outcome.pass.etaBeforeMinutes - first.pass.etaBeforeMinutes);
    const afterDrift = Math.abs(outcome.pass.etaAfterMinutes - first.pass.etaAfterMinutes);
    report.assert(
      `The same starting and finishing ETA, within ${ETA_TOLERANCE_MINUTES} min (${label})`,
      beforeDrift <= ETA_TOLERANCE_MINUTES && afterDrift <= ETA_TOLERANCE_MINUTES,
      `before ${minutes(first.pass.etaBeforeMinutes)} vs ${minutes(outcome.pass.etaBeforeMinutes)}, ` +
        `after ${minutes(first.pass.etaAfterMinutes)} vs ${minutes(outcome.pass.etaAfterMinutes)}`,
    );

    report.assert(
      `The same capacity change (${label})`,
      outcome.pass.activeCountersBefore === first.pass.activeCountersBefore &&
        outcome.pass.activeCountersAfter === first.pass.activeCountersAfter,
      `${outcome.pass.activeCountersBefore} -> ${outcome.pass.activeCountersAfter} Counters both times`,
    );

    const returnedDrift = Math.abs(
      outcome.pass.estimatedMinutesReturned - first.pass.estimatedMinutesReturned,
    );
    const allowed = Math.max(1, first.pass.estimatedMinutesReturned * RETURNED_TOLERANCE_RATIO);
    report.assert(
      `The same Estimated Time Returned, within ${Math.round(RETURNED_TOLERANCE_RATIO * 100)}% (${label})`,
      returnedDrift <= allowed,
      `${first.pass.estimatedMinutesReturned.toFixed(1)} vs ` +
        `${outcome.pass.estimatedMinutesReturned.toFixed(1)} person-minutes`,
    );

    report.assert(
      `A fresh Visitor Token each time, never a reused one (${label})`,
      outcome.pass.visitorTokenId !== first.pass.visitorTokenId,
      `${first.pass.visitorTokenNumber} then ${outcome.pass.visitorTokenNumber}`,
    );
  }
}

/* ------------------------------------------------------------------ *
 * The run
 * ------------------------------------------------------------------ */

/**
 * `--passes N`, defaulting to the two the acceptance criteria ask for.
 *
 * One pass is refused rather than accepted and then failed: "the chain is run at
 * least twice from a clean reset" is the criterion, so a single-pass acceptance
 * run is a contradiction. The golden path is the one-pass tool.
 */
export const MINIMUM_PASSES = 2;

export function readPassCount(argv: readonly string[]): number {
  const flag = argv.indexOf("--passes");
  if (flag === -1) return MINIMUM_PASSES;
  const value = Number(argv[flag + 1]);
  if (!Number.isInteger(value) || value < MINIMUM_PASSES) {
    throw new Error(
      `--passes takes a whole number of at least ${MINIMUM_PASSES}: the acceptance ` +
        "criteria ask for the chain to run at least twice from a clean reset. For a " +
        "single pass, run `npm --prefix scripts run golden-path` instead.",
    );
  }
  return value;
}

async function main(): Promise<void> {
  let passCount: number;
  try {
    passCount = readPassCount(process.argv.slice(2));
  } catch (error) {
    // A mistyped flag is an operator error, not a crash. Say so in one line.
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}
`);
    process.exit(1);
    return;
  }
  const config = loadSupabaseConfig();
  const rule = "=".repeat(78);

  process.stdout.write(
    [
      rule,
      "DeQueue acceptance run — the proof before judging",
      rule,
      `Project : ${config.url}`,
      `Passes  : ${passCount}, each from a clean reset`,
      "Leaves the database at the seeded baseline, ready for the human run-through.",
    ].join("\n") + "\n",
  );

  const client = createDeQueueClient(config);
  const outcomes: PassOutcome[] = [];
  let failure: Error | undefined;

  for (let index = 1; index <= passCount && failure === undefined; index += 1) {
    const report = new Report(`Acceptance pass ${index} of ${passCount}`);
    process.stdout.write(
      `\n${"-".repeat(78)}\nPASS ${index} OF ${passCount}\n${"-".repeat(78)}\n`,
    );

    let headline: string[] = [];
    let passFailure: Error | undefined;

    try {
      const pass = await runClosedLoopPass(report, client);
      headline = pass.headline;
      await assertSurvivesRefresh(report, config, pass);
      assertForecastAppears(report, pass);
      await assertSimulatedVisitorsMarked(report, client, pass);
      assertTimelineOrdering(report, pass);
      await assertVisitorHopLandsWithoutThePhone(report, client, pass);
      outcomes.push({ index, pass });
    } catch (error) {
      passFailure = error instanceof Error ? error : new Error(String(error));
    }

    // Always hand the next pass a clean facility, even after a failure.
    try {
      await restoreBaseline(report, client);
    } catch (error) {
      const cleanupError = error instanceof Error ? error : new Error(String(error));
      report.note(`Baseline restore reported: ${cleanupError.message}`);
      passFailure = passFailure ?? cleanupError;
    }

    report.print(headline, passFailure);
    failure = failure ?? passFailure;
  }

  // The cross-cutting checks: one facility-independent, one across the passes.
  const closing = new Report("Acceptance run");
  process.stdout.write(`\n${"-".repeat(78)}\nACROSS THE PASSES\n${"-".repeat(78)}\n`);
  try {
    assertNoSurfaceOverclaims(closing);
    if (failure === undefined) assertPassesAgree(closing, outcomes);
  } catch (error) {
    failure = failure ?? (error instanceof Error ? error : new Error(String(error)));
  }

  const summary =
    outcomes.length === 0
      ? []
      : [
          `Passes completed      : ${outcomes.length} of ${passCount}`,
          ...outcomes.map(
            (outcome) =>
              `Pass ${outcome.index}: ETA ${minutes(outcome.pass.etaBeforeMinutes)} -> ` +
              `${minutes(outcome.pass.etaAfterMinutes)}, Counters ` +
              `${outcome.pass.activeCountersBefore} -> ${outcome.pass.activeCountersAfter}, ` +
              `${outcome.pass.estimatedMinutesReturned.toFixed(1)} person-minutes returned (estimated)`,
          ),
          "",
          "Still to do by hand — docs/acceptance/s3-acceptance-run.md:",
          "  - the run-through on the real devices, refreshing each surface mid-demo",
          "  - the phone-off rehearsal with the Visitor PWA in a browser",
          "  - the narration assignments, read out once before judging",
        ];

  closing.print(summary, failure);
  process.exit(failure === undefined ? 0 : 1);
}

await main();
