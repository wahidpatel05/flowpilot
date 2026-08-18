/**
 * FlowPilot golden path — proves the closed loop closes, against the real
 * Supabase project, with no UI involved.
 *
 *   npm --prefix scripts run golden-path
 *
 * The demo is one causal chain, and until something drives the whole chain end
 * to end, "the Visitor's ETA drops" is a claim rather than a fact. This script
 * drives every hop through the database RPCs and asserts the one number that
 * matters: the Visitor's recomputed ETA is STRICTLY LOWER after the Intervention
 * than before it. Everything else in here is setup for that assertion.
 *
 * It is also the Android team's unblocker. Android's signature moment is the ETA
 * dropping on the phone, which requires a real Intervention to be applied.
 * Running this fires one, so the phone can be built and verified before a single
 * line of Control exists.
 *
 * ETA maths is never reimplemented here: rows become domain state through
 * `projectFacility` and the ETA comes from `projectTokenEta`, both from
 * flowpilot-core. Capacity is never written by hand: only `apply_intervention()`
 * touches `counter_assignments`.
 *
 * The database is reset to the seeded baseline at the start AND in a `finally`
 * at the end, so a failed run leaves nothing behind.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findProjectedService,
  findQueueSnapshot,
  projectFacility,
  projectTokenEta,
  recommendIntervention,
} from "../../flowpilot-core/src/index.js";
import type {
  FacilityProjection,
  ProjectedTokenEta,
  Recommendation,
} from "../../flowpilot-core/src/index.js";
import {
  createFlowPilotClient,
  fetchFacilityRows,
  loadSupabaseConfig,
  rpc,
  rpcExpectingFailure,
} from "./client.js";
import { GoldenPathFailure, Report, minutes } from "./report.js";

/** The Service the demo is about. */
const EXAMINATION_SLUG = "examination";
/** Simulate Rush injects this many Tokens into Examination Cell. */
const RUSH_TOKENS_FOR_EXAMINATION = 12;
/** Horizon for the counterfactual, matching Control's default. */
const HORIZON_MINUTES = 60;
/** Temporary Assignment duration written into the action payload. */
const DURATION_MINUTES = 30;
/**
 * The Visitor joins five minutes before the rush arrives.
 *
 * `simulate_rush()` back-dates its Tokens by up to four minutes
 * (`joined_at = now() - (n - i) * 20 seconds`). A Visitor inserted with the
 * default `now()` would therefore sort BEHIND twelve Tokens that "arrived"
 * before them, which is not the story the demo tells: the Visitor was already in
 * line when the rush hit. Back-dating the join by five minutes puts the Visitor
 * ahead of the whole injected rush, which is also what makes the ETA drop
 * attributable to capacity rather than to queue churn.
 */
const VISITOR_JOINED_MINUTES_AGO = 5;
/** Token numbers this script issues, so a crashed run can be tidied up. */
const VISITOR_TOKEN_PREFIX = "E-GP";

const report = new Report();

interface ServiceRecord {
  id: string;
  name: string;
  slug: string;
}

/* ------------------------------------------------------------------ *
 * Small typed reads. Everything else goes through flowpilot-core.
 * ------------------------------------------------------------------ */

async function loadServices(client: SupabaseClient): Promise<ServiceRecord[]> {
  const { data, error } = await client.from("services").select("id,name,slug");
  if (error !== null) throw new Error(`Failed to read services: ${error.message}`);
  return (data ?? []) as ServiceRecord[];
}

async function countRows(
  client: SupabaseClient,
  table: string,
  filters: Record<string, string | number | boolean> = {},
): Promise<number> {
  let query = client.from(table).select("*", { count: "exact", head: true });
  for (const [column, value] of Object.entries(filters)) {
    query = query.eq(column, value);
  }
  const { count, error } = await query;
  if (error !== null) throw new Error(`Failed to count ${table}: ${error.message}`);
  return count ?? 0;
}

async function project(client: SupabaseClient): Promise<FacilityProjection> {
  const rows = await fetchFacilityRows(client);
  return projectFacility(rows, { now: Date.now() });
}

function requireEta(
  projection: FacilityProjection,
  tokenId: string,
): ProjectedTokenEta {
  const eta = projectTokenEta(projection, tokenId);
  if (eta === null) {
    throw new GoldenPathFailure(
      `The Visitor's Token ${tokenId} is no longer in any queue, so it has no ETA.`,
    );
  }
  return eta;
}

/** Non-finite values cannot survive JSON, and `numeric` takes null happily. */
function finiteOrNull(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) ? value : null;
}

interface InterventionEventRow {
  event_type: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/**
 * The timeline, ordered the way INTEGRATION.md requires: by `created_at` AND by
 * `metadata->>'sequence'`. Events written by one RPC call can share a
 * transaction timestamp, so `created_at` alone is not a total order.
 */
async function loadTimeline(
  client: SupabaseClient,
  interventionId: string,
): Promise<InterventionEventRow[]> {
  const columns = "event_type,message,metadata,created_at";
  let rows: InterventionEventRow[] = [];

  const ordered = await client
    .from("intervention_events")
    .select(columns)
    .eq("intervention_id", interventionId)
    .order("created_at", { ascending: true })
    .order("metadata->>sequence", { ascending: true });

  if (ordered.error === null) {
    rows = (ordered.data ?? []) as unknown as InterventionEventRow[];
  } else {
    report.note(
      `PostgREST refused to order by metadata->>sequence (${ordered.error.message}); ordered client-side instead.`,
    );
    const fallback = await client
      .from("intervention_events")
      .select(columns)
      .eq("intervention_id", interventionId)
      .order("created_at", { ascending: true });
    if (fallback.error !== null) {
      throw new Error(`Failed to read the timeline: ${fallback.error.message}`);
    }
    rows = (fallback.data ?? []) as unknown as InterventionEventRow[];
  }

  // `metadata->>'sequence'` sorts as text in Postgres, so settle the tie here.
  const sequenceOf = (row: InterventionEventRow): number =>
    Number(row.metadata?.["sequence"] ?? Number.MAX_SAFE_INTEGER);

  return [...rows].sort((a, b) => {
    const byTime = Date.parse(a.created_at) - Date.parse(b.created_at);
    if (byTime !== 0) return byTime;
    return sequenceOf(a) - sequenceOf(b);
  });
}

/* ------------------------------------------------------------------ *
 * Reset to the seeded baseline
 * ------------------------------------------------------------------ */

/** The seeded live queue: documents 5, fees 3, examination 6, one Counter each. */
const SEEDED_QUEUE_LENGTHS: Record<string, number> = {
  documents: 5,
  fees: 3,
  examination: 6,
};

/** Asserts the projection matches the seeded baseline exactly. */
function assertSeededBaseline(
  projection: FacilityProjection,
  label: string,
): void {
  const actual = projection.serviceDetails
    .map(
      (service) =>
        `${service.slug ?? service.serviceId}: queue ${service.queueLength}, ${service.activeCounters} Counter(s)`,
    )
    .join(" | ");
  const matches =
    projection.serviceDetails.length === Object.keys(SEEDED_QUEUE_LENGTHS).length &&
    projection.serviceDetails.every(
      (service) =>
        service.queueLength === SEEDED_QUEUE_LENGTHS[service.slug ?? ""] &&
        service.activeCounters === 1 &&
        service.simulatedQueueLength === 0,
    );
  report.assert(label, matches, actual);
}

/** Every write here carries a filter — see the note in `resetToBaseline`. */
async function clearTable(
  client: SupabaseClient,
  table: string,
  apply: (query: ReturnType<ReturnType<SupabaseClient["from"]>["delete"]>) => unknown,
): Promise<void> {
  const query = client.from(table).delete();
  const { error } = (await apply(query)) as { error: { message: string } | null };
  if (error !== null) {
    throw new Error(`Failed to clear public.${table}: ${error.message}`);
  }
}

/**
 * The same baseline `reset_demo()` defines, restored through filtered writes.
 *
 * This is a fallback, not a second definition of the demo: it removes what this
 * script (and Simulate Rush) wrote and reconciles Counter and Staff status
 * against the surviving Assignments. The seeded waiting queue is never deleted,
 * so it never has to be recreated.
 */
async function teardownWithFilteredWrites(client: SupabaseClient): Promise<void> {
  for (const table of [
    "intervention_events",
    "interventions",
    "recommendations",
    "journey_steps",
    "journeys",
    "crowd_samples",
  ]) {
    await clearTable(client, table, (query) => query.not("id", "is", null));
  }
  // Simulate Rush's Tokens, then any Token this script issued.
  await clearTable(client, "tokens", (query) => query.eq("is_simulated", true));
  await clearTable(client, "tokens", (query) =>
    query.like("token_number", `${VISITOR_TOKEN_PREFIX}%`),
  );
  await clearTable(client, "queue_events", (query) => query.is("token_id", null));
  await clearTable(client, "counter_assignments", (query) =>
    query.eq("assignment_type", "temporary"),
  );

  const revived = await client
    .from("counter_assignments")
    .update({ status: "active", ends_at: null })
    .eq("status", "ended");
  if (revived.error !== null) {
    throw new Error(`Failed to revive Assignments: ${revived.error.message}`);
  }

  // Counters and Staff follow the Assignments, never the other way round.
  const rows = await fetchFacilityRows(client);
  const active = (rows.counterAssignments ?? []).filter(
    (assignment) => assignment.status === "active",
  );
  const boundCounters = new Set(active.map((assignment) => assignment.counter_id));
  const boundStaff = new Set(
    active
      .map((assignment) => assignment.staff_id)
      .filter((id): id is string => id !== null && id !== undefined),
  );

  for (const counter of rows.counters ?? []) {
    const expected = boundCounters.has(counter.id) ? "active" : "inactive";
    if (counter.status === expected) continue;
    const { error } = await client
      .from("counters")
      .update({ status: expected })
      .eq("id", counter.id);
    if (error !== null) {
      throw new Error(`Failed to reset ${counter.name ?? counter.id}: ${error.message}`);
    }
  }

  for (const member of rows.staff ?? []) {
    const expected = boundStaff.has(member.id) ? "active" : "idle";
    if (member.status === expected) continue;
    const { error } = await client
      .from("staff")
      .update({ status: expected })
      .eq("id", member.id);
    if (error !== null) {
      throw new Error(`Failed to reset ${member.name ?? member.id}: ${error.message}`);
    }
  }
}

/**
 * Restores the seeded baseline, preferring the RPC the whole team is told to
 * rehearse with.
 *
 * On the live project `reset_demo()` raises 21000 "DELETE requires a WHERE
 * clause": it is SECURITY INVOKER, so its unqualified DELETE and UPDATE
 * statements execute inside a pg_safeupdate-armed API session, where they are
 * illegal. `supabase/migrations/0003_reset_demo_api_safe.sql` repairs it. Until
 * that is applied, fall back rather than fail — but say so, loudly, every run.
 */
async function resetToBaseline(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.rpc("reset_demo");
  if (error === null) {
    const result = (data ?? {}) as Record<string, unknown>;
    return (
      `reset_demo(): ${String(result["waiting_tokens"])} waiting, ` +
      `${String(result["serving_tokens"])} serving, ` +
      `${String(result["completed_history_preserved"])} completed Tokens of history preserved`
    );
  }

  if (!/WHERE clause/i.test(error.message)) {
    throw new Error(`reset_demo() failed: ${error.message}`);
  }

  report.note(
    `reset_demo() is BROKEN on the live project: ${error.code ?? "?"} "${error.message}". ` +
      "It is SECURITY INVOKER, so its unqualified DELETE/UPDATE statements run inside a " +
      "pg_safeupdate-armed Supabase API session and are rejected. Control's Reset Demo button " +
      "has the same fault. Apply supabase/migrations/0003_reset_demo_api_safe.sql to repair it. " +
      "This run used a filtered teardown instead.",
  );
  await teardownWithFilteredWrites(client);
  return "filtered teardown (reset_demo() is broken on the live project — see the note)";
}

/* ------------------------------------------------------------------ *
 * The run
 * ------------------------------------------------------------------ */

async function run(client: SupabaseClient): Promise<string[]> {
  // ---- 0. Preflight -------------------------------------------------------
  report.begin("0", "Preflight: is the schema seeded?");
  const services = await loadServices(client);
  report.assert(
    "The Service catalogue is seeded",
    services.length >= 3,
    `${services.length} Services: ${services.map((service) => service.slug).join(", ")}`,
  );
  const examination = services.find((service) => service.slug === EXAMINATION_SLUG);
  if (examination === undefined) {
    throw new GoldenPathFailure(
      "No Service with slug 'examination'. Run supabase/BOOTSTRAP.sql first.",
    );
  }
  report.info(`Examination Cell = ${examination.id}`);

  // ---- 1. Reset to the seeded baseline ------------------------------------
  report.begin("1", "Reset to the seeded baseline");
  report.info(await resetToBaseline(client));

  const baseline = await project(client);
  assertSeededBaseline(baseline, "The seeded baseline is in place, so the run is repeatable");
  const baselineExamination = findProjectedService(baseline, examination.id);
  report.assert(
    "Examination Cell starts with exactly one active Counter",
    baselineExamination?.activeCounters === 1,
    `activeCounters=${String(baselineExamination?.activeCounters)} from ` +
      `${String(baselineExamination?.activeAssignmentCount)} active Assignment(s)`,
  );
  report.info(
    `Baseline queue ${String(baselineExamination?.queueLength)}, average service ` +
      `${baselineExamination?.averageServiceMinutes.toFixed(2)} min ` +
      `(${String(baselineExamination?.completedDurationSampleCount)} measured durations)`,
  );

  // ---- 2. A Visitor joins Examination Cell --------------------------------
  report.begin("2", "A Visitor joins Examination Cell");
  const joinedAt = new Date(
    Date.now() - VISITOR_JOINED_MINUTES_AGO * 60_000,
  ).toISOString();
  const tokenNumber = `${VISITOR_TOKEN_PREFIX}${String(Math.floor(Math.random() * 900) + 100)}`;
  const insertion = await client
    .from("tokens")
    .insert({
      service_id: examination.id,
      token_number: tokenNumber,
      status: "waiting",
      joined_at: joinedAt,
      is_simulated: false,
    })
    .select("id,token_number,status,service_id,is_simulated,joined_at")
    .single();

  if (insertion.error !== null) {
    throw new Error(`The Visitor could not join: ${insertion.error.message}`);
  }
  const visitorTokenId = insertion.data.id as string;

  const persisted = await client
    .from("tokens")
    .select("id,token_number,status,service_id,is_simulated")
    .eq("id", visitorTokenId)
    .single();
  report.assert(
    "The Visitor's Token persisted",
    persisted.error === null &&
      persisted.data.status === "waiting" &&
      persisted.data.service_id === examination.id &&
      persisted.data.is_simulated === false,
    `Token ${String(persisted.data?.token_number)} (${visitorTokenId}) is waiting for Examination Cell, is_simulated=false`,
  );
  report.info(
    `Joined ${VISITOR_JOINED_MINUTES_AGO} min ago, so the Visitor is already in line when the rush lands.`,
  );

  // ---- 3. Capture the Visitor's ETA before any Intervention ---------------
  report.begin("3", "Capture the Visitor's ETA before any Intervention");
  const beforeProjection = await project(client);
  const etaBefore = requireEta(beforeProjection, visitorTokenId);
  report.assert(
    "The Visitor has a finite ETA to beat",
    Number.isFinite(etaBefore.predictedWaitMinutes) &&
      etaBefore.predictedWaitMinutes > 0,
    `${minutes(etaBefore.predictedWaitMinutes)} with ${etaBefore.customersAhead} people ahead, Health ${etaBefore.health}`,
  );
  const snapshotBefore = findQueueSnapshot(beforeProjection, examination.id);
  report.info(
    `Examination Cell: queue ${String(snapshotBefore?.queueLength)}, ` +
      `${String(snapshotBefore?.activeCounters)} active Counter(s), ` +
      `predicted wait ${minutes(snapshotBefore?.predictedWaitMinutes)}, Health ${String(snapshotBefore?.health)}`,
  );

  // ---- 4. Simulate Rush ---------------------------------------------------
  report.begin("4", "Simulate Rush (simulate_rush)");
  const rushResult = await rpc<Record<string, unknown>>(client, "simulate_rush");
  report.assert(
    "simulate_rush() injected demand",
    rushResult["rush"] === true,
    `${String(rushResult["tokens_added"])} simulated Tokens added ` +
      `(documents ${String(rushResult["documents"])}, fees ${String(rushResult["fees"])}, examination ${String(rushResult["examination"])})`,
  );

  const rushProjection = await project(client);
  const rushExamination = findProjectedService(rushProjection, examination.id);
  const rushSnapshot = findQueueSnapshot(rushProjection, examination.id);
  report.assert(
    "Examination Cell's Health is critical",
    rushSnapshot?.health === "critical",
    `queue ${String(rushSnapshot?.queueLength)} against ${String(rushSnapshot?.activeCounters)} Counter(s) ` +
      `= ${minutes(rushSnapshot?.predictedWaitMinutes)}, Health ${String(rushSnapshot?.health)}`,
  );
  report.assert(
    "The rush is counted in the queue but stays identifiable",
    rushExamination?.simulatedQueueLength === RUSH_TOKENS_FOR_EXAMINATION &&
      (rushExamination?.realQueueLength ?? 0) ===
        (baselineExamination?.queueLength ?? 0) + 1,
    `${String(rushExamination?.simulatedQueueLength)} simulated + ` +
      `${String(rushExamination?.realQueueLength)} real = ${String(rushExamination?.queueLength)}`,
  );
  if (snapshotBefore?.health === "critical") {
    report.note(
      "Examination Cell is ALREADY critical at the seeded baseline (6 waiting x ~6 min on 1 Counter " +
        "= ~36 min, over its 30 min critical threshold). Simulate Rush deepens an existing crisis " +
        "rather than creating one, so 'Health becomes critical' is true but was not a transition.",
    );
  }
  const etaAfterRush = requireEta(rushProjection, visitorTokenId);
  report.info(
    `The Visitor is still ${etaAfterRush.customersAhead} from the front (the rush landed behind them): ` +
      `${minutes(etaAfterRush.predictedWaitMinutes)}`,
  );

  // ---- 5. Project the facility and ask the engine -------------------------
  report.begin("5", "Project facility state and ask the recommendation engine");
  const recommendation: Recommendation | null = recommendIntervention({
    ...rushProjection,
    horizonMinutes: HORIZON_MINUTES,
    durationMinutes: DURATION_MINUTES,
  });
  report.assert(
    "The engine returned a Recommendation",
    recommendation !== null,
    recommendation === null
      ? "null"
      : `${recommendation.actionType} for ${recommendation.serviceId}, ` +
        `estimated time returned ${recommendation.estimatedMinutesReturned.toFixed(1)} person-minutes, ` +
        `confidence ${String(recommendation.confidence)}`,
  );
  if (recommendation === null) throw new GoldenPathFailure("unreachable");
  report.assert(
    "It targets Examination Cell, the most pressured Service",
    recommendation.serviceId === examination.id,
    `serviceId=${recommendation.serviceId}`,
  );
  report.info(
    `Payload: ${JSON.stringify(recommendation.actionPayload)} — baseline wait ` +
      `${minutes(recommendation.baselineWaitMinutes)} vs optimized ${minutes(recommendation.optimizedWaitMinutes)}`,
  );

  // ---- 6. Persist it, then approve, accept, apply --------------------------
  report.begin("6", "Persist the Recommendation, then approve, accept and apply");
  const inserted = await client
    .from("recommendations")
    .insert({
      service_id: recommendation.serviceId,
      action_type: recommendation.actionType,
      action_payload: recommendation.actionPayload,
      baseline_wait: finiteOrNull(recommendation.baselineWaitMinutes),
      predicted_wait: finiteOrNull(recommendation.optimizedWaitMinutes),
      baseline_person_minutes: finiteOrNull(recommendation.baselinePersonMinutes),
      predicted_person_minutes: finiteOrNull(recommendation.optimizedPersonMinutes),
      estimated_minutes_returned: finiteOrNull(
        recommendation.estimatedMinutesReturned,
      ),
      confidence: recommendation.confidence ?? null,
      status: "recommended",
    })
    .select("id,status,action_type,action_payload,estimated_minutes_returned")
    .single();
  if (inserted.error !== null) {
    throw new Error(`Could not persist the Recommendation: ${inserted.error.message}`);
  }
  const recommendationId = inserted.data.id as string;
  report.assert(
    "The Recommendation persisted as 'recommended'",
    inserted.data.status === "recommended" &&
      (inserted.data.action_payload as Record<string, unknown>)["counterId"] !==
        undefined,
    `recommendation ${recommendationId}, camelCase payload keys preserved`,
  );

  const approved = await rpc<Record<string, unknown>>(
    client,
    "approve_recommendation",
    { p_recommendation_id: recommendationId },
  );
  const interventionId = String(approved["intervention_id"]);
  report.assert(
    "approve_recommendation() created an Intervention",
    approved["status"] === "approved" && interventionId !== "undefined",
    `intervention ${interventionId} — a Recommendation and an Intervention are never the same record`,
  );

  const accepted = await rpc<Record<string, unknown>>(
    client,
    "accept_intervention",
    { p_intervention_id: interventionId },
  );
  report.assert(
    "accept_intervention() moved it to 'accepted'",
    accepted["status"] === "accepted",
    "the Desk acknowledged; capacity has NOT changed yet",
  );

  const applied = await rpc<Record<string, unknown>>(client, "apply_intervention", {
    p_intervention_id: interventionId,
  });
  report.assert(
    "apply_intervention() applied it — the keystone hop",
    applied["status"] === "applied",
    `${String(applied["counter_name"])} opened for Examination Cell, assignment ${String(applied["assignment_id"])}`,
  );

  // ---- 7. Capacity actually changed ---------------------------------------
  report.begin("7", "Assert Examination Cell's active Counter count increased");
  const countersBefore = applied["active_counters_before"] as Record<string, number>;
  const countersAfter = applied["active_counters_after"] as Record<string, number>;
  report.assert(
    "The RPC reports the capacity change",
    (countersAfter[examination.id] ?? 0) > (countersBefore[examination.id] ?? 0),
    `${String(countersBefore[examination.id])} -> ${String(countersAfter[examination.id])} active Counters`,
  );

  const appliedProjection = await project(client);
  const appliedExamination = findProjectedService(appliedProjection, examination.id);
  report.assert(
    "The projection agrees: active Counters rose",
    (appliedExamination?.activeCounters ?? 0) >
      (rushExamination?.activeCounters ?? 0),
    `${String(rushExamination?.activeCounters)} -> ${String(appliedExamination?.activeCounters)} ` +
      `(Counters ${appliedExamination?.activeCounterIds.join(", ") ?? ""})`,
  );
  const temporaryAssignments = await countRows(client, "counter_assignments", {
    service_id: examination.id,
    assignment_type: "temporary",
    status: "active",
  });
  report.assert(
    "Exactly one temporary Assignment exists",
    temporaryAssignments === 1,
    `${temporaryAssignments} active temporary Assignment(s) for Examination Cell`,
  );

  // ---- 8. THE POINT: the Visitor's ETA dropped ----------------------------
  report.begin("8", "THE POINT: the Visitor's recomputed ETA is strictly lower");
  const etaAfter = requireEta(appliedProjection, visitorTokenId);
  report.assert(
    "The Visitor's ETA is STRICTLY LOWER than the captured value",
    etaAfter.predictedWaitMinutes < etaBefore.predictedWaitMinutes,
    `${minutes(etaBefore.predictedWaitMinutes)} -> ${minutes(etaAfter.predictedWaitMinutes)} ` +
      `(down ${(etaBefore.predictedWaitMinutes - etaAfter.predictedWaitMinutes).toFixed(1)} min)`,
  );
  report.assert(
    "It is also lower than it was at the peak of the rush",
    etaAfter.predictedWaitMinutes < etaAfterRush.predictedWaitMinutes,
    `${minutes(etaAfterRush.predictedWaitMinutes)} -> ${minutes(etaAfter.predictedWaitMinutes)}`,
  );
  report.assert(
    "The drop came from capacity, not from the queue moving",
    etaAfter.customersAhead === etaBefore.customersAhead,
    `${etaBefore.customersAhead} people ahead throughout; Counters ` +
      `${String(rushExamination?.activeCounters)} -> ${String(appliedExamination?.activeCounters)}`,
  );

  // ---- 9. The causal chain is on the timeline ------------------------------
  report.begin("9", "Assert the Intervention timeline holds the causal chain");
  const timeline = await loadTimeline(client, interventionId);
  const expectedChain = [
    "recommendation_created",
    "approved",
    "staff_accepted",
    "applied",
    "eta_recalculated",
  ];
  const actualChain = timeline.map((event) => event.event_type);
  report.assert(
    "The events are in causal order",
    actualChain.join(" -> ") === expectedChain.join(" -> "),
    actualChain.join(" -> "),
  );
  const sequences = timeline.map((event) => Number(event.metadata?.["sequence"]));
  report.assert(
    "Their metadata.sequence values are strictly increasing",
    sequences.every(
      (value, index) => index === 0 || value > (sequences[index - 1] ?? -1),
    ),
    `sequence ${sequences.join(", ")}`,
  );
  for (const event of timeline) {
    report.info(`${event.event_type}: ${event.message ?? ""}`);
  }

  // ---- 10. A second apply raises rather than double-applying ---------------
  report.begin("10", "Assert a second apply raises rather than double-applying");
  const secondApply = await rpcExpectingFailure(client, "apply_intervention", {
    p_intervention_id: interventionId,
  });
  report.assert(
    "The second apply_intervention() raised",
    secondApply !== null && /already applied/i.test(secondApply.message),
    secondApply === null ? "it silently succeeded" : secondApply.message,
  );
  const countersAfterSecond = await countRows(client, "counter_assignments", {
    service_id: examination.id,
    status: "active",
  });
  report.assert(
    "Capacity was not changed a second time",
    countersAfterSecond === (appliedExamination?.activeCounters ?? 0),
    `${countersAfterSecond} active Assignments for Examination Cell, unchanged`,
  );

  const headline = [
    `Visitor Token       : ${tokenNumber} (${visitorTokenId})`,
    `People ahead        : ${etaBefore.customersAhead}`,
    `Active Counters     : ${String(rushExamination?.activeCounters)} -> ${String(appliedExamination?.activeCounters)}`,
    `ETA before          : ${minutes(etaBefore.predictedWaitMinutes)}  (Health ${etaBefore.health})`,
    `ETA at rush peak    : ${minutes(etaAfterRush.predictedWaitMinutes)}  (Health ${etaAfterRush.health})`,
    `ETA after Intervention: ${minutes(etaAfter.predictedWaitMinutes)}  (Health ${etaAfter.health})`,
    `ETA DROP            : ${(etaBefore.predictedWaitMinutes - etaAfter.predictedWaitMinutes).toFixed(1)} min`,
    `Estimated time returned: ${recommendation.estimatedMinutesReturned.toFixed(1)} person-minutes (estimated, never measured)`,
  ];
  return headline;
}

/** Restores the seeded baseline and proves it, whatever happened above. */
async function restoreBaseline(client: SupabaseClient): Promise<void> {
  report.begin("11", "Leave the database at the seeded baseline");
  report.info(await resetToBaseline(client));

  const projection = await project(client);
  assertSeededBaseline(projection, "The baseline queue and capacity are back");

  const [recommendations, interventions, events, temporary] = await Promise.all([
    countRows(client, "recommendations"),
    countRows(client, "interventions"),
    countRows(client, "intervention_events"),
    countRows(client, "counter_assignments", { assignment_type: "temporary" }),
  ]);
  report.assert(
    "No Recommendations, Interventions, timeline events or temporary Assignments remain",
    recommendations === 0 &&
      interventions === 0 &&
      events === 0 &&
      temporary === 0,
    `recommendations ${recommendations}, interventions ${interventions}, events ${events}, temporary Assignments ${temporary}`,
  );

  const inactiveSpares = projection.counters.filter(
    (counter) => counter.status === "inactive",
  ).length;
  report.assert(
    "The two spare Counters are inactive again",
    inactiveSpares === 2,
    `${inactiveSpares} inactive Counters`,
  );
}

async function main(): Promise<void> {
  const config = loadSupabaseConfig();
  process.stdout.write(
    [
      "=".repeat(78),
      "FlowPilot golden path — driving the closed loop against the live project",
      "=".repeat(78),
      `Project: ${config.url}`,
      "Reads and writes only through the publishable key and the demo RPCs.",
    ].join("\n") + "\n",
  );

  const client = createFlowPilotClient(config);
  let headline: string[] = [];
  let failure: Error | undefined;

  try {
    headline = await run(client);
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error));
  }

  try {
    await restoreBaseline(client);
  } catch (error) {
    const cleanupError = error instanceof Error ? error : new Error(String(error));
    report.note(`Baseline restore reported: ${cleanupError.message}`);
    failure = failure ?? cleanupError;
  }

  report.print(headline, failure);
  process.exit(failure === undefined ? 0 : 1);
}

await main();
