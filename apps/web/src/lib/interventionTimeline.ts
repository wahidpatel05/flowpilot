/**
 * The timeline: the causal chain of one facility's Interventions, in the order
 * it actually happened.
 *
 * This is the trust feature. It is what lets a Manager explain FlowPilot's
 * reasoning to somebody else, so every entry carries a real timestamp written
 * by Postgres — nothing here fabricates one, and nothing here invents an event
 * that was not recorded.
 *
 * ORDERING, AND THIS IS NOT THEORETICAL. `approve_recommendation()` writes
 * `recommendation_created` and `approved` in one call; `apply_intervention()`
 * writes `applied` and `eta_recalculated` in one call. Those functions already
 * stamp `clock_timestamp()` rather than `now()` precisely so the rows do not
 * share the transaction instant — but `clock_timestamp()` has microsecond
 * resolution and `Date.parse` truncates to the millisecond, so two events
 * appended microseconds apart still tie once they reach this code. Ordering on
 * the timestamp alone therefore renders `applied` before `approved` at random.
 *
 * So every event also carries its canonical lifecycle position in
 * `metadata.sequence` (spec sheet section 12), and this module orders by
 * timestamp AND sequence — exactly what 0002_apply_intervention.sql's own
 * "NOTE ON TIMELINE ORDERING" instructs a client to do.
 */

/** Structural mirror of `public.intervention_events` — append-only. */
export interface InterventionEventRow {
  id: string;
  intervention_id: string;
  event_type: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/**
 * The canonical lifecycle position of each event type, from spec sheet section
 * 12 and matching the `sequence` values the RPCs write. Used when a row's own
 * `metadata.sequence` is missing.
 */
export const CANONICAL_SEQUENCE: Readonly<Record<string, number>> = {
  forecast_triggered: 1,
  recommendation_created: 2,
  approved: 3,
  staff_notified: 4,
  staff_accepted: 5,
  applied: 6,
  eta_recalculated: 7,
  completed: 8,
  rejected: 9,
};

/**
 * Where an event type we have never heard of sorts. `intervention_events.event_type`
 * is deliberately left unconstrained in 0001_init.sql so the timeline can grow
 * without a migration, so an unknown type must land somewhere stable and late
 * rather than collapsing to 0 and jumping ahead of everything in its millisecond.
 */
const UNKNOWN_SEQUENCE = 99;

/** Short label for the event, for the entry's own chip. */
const EVENT_LABEL: Readonly<Record<string, string>> = {
  forecast_triggered: "Forecast",
  recommendation_created: "Recommended",
  approved: "Approved",
  staff_notified: "Notified",
  staff_accepted: "Accepted",
  applied: "Applied",
  eta_recalculated: "ETA recalculated",
  completed: "Completed",
  rejected: "Rejected",
};

export type TimelineTone = "neutral" | "accent" | "positive" | "critical";

const EVENT_TONE: Readonly<Record<string, TimelineTone>> = {
  forecast_triggered: "neutral",
  recommendation_created: "neutral",
  approved: "accent",
  staff_notified: "neutral",
  staff_accepted: "accent",
  applied: "positive",
  eta_recalculated: "positive",
  completed: "neutral",
  rejected: "critical",
};

/**
 * What each event means when the row carries no message of its own. Prose, in
 * FlowPilot's vocabulary, so a fallback entry still reads like a sentence a
 * human wrote.
 */
const EVENT_FALLBACK_MESSAGE: Readonly<Record<string, string>> = {
  forecast_triggered: "The forecast flagged pressure building at a Service.",
  recommendation_created: "FlowPilot proposed a capacity change.",
  approved: "The manager approved this Intervention.",
  staff_notified: "The staff member was asked to confirm the move.",
  staff_accepted: "The staff member accepted the move.",
  applied: "Capacity changed — the Assignment moved.",
  eta_recalculated: "Estimated waits were recalculated for the affected Services.",
  completed: "The temporary Assignment ended and capacity returned to normal.",
  rejected: "The manager rejected this Recommendation.",
};

const GENERIC_FALLBACK_MESSAGE = "FlowPilot recorded a step in this Intervention.";

/**
 * A raw uuid in a timeline entry is a bug, not a display choice: the whole
 * point of `fp_action_label` is that the database writes names. If one ever
 * reaches us anyway, the entry falls back to prose rather than reading an
 * identifier out to the Manager.
 */
const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export interface TimelineEntry {
  id: string;
  interventionId: string;
  eventType: string;
  /** Short chip label — "Approved", "Applied". */
  label: string;
  tone: TimelineTone;
  /** Prose, guaranteed free of raw identifiers. */
  message: string;
  /** The real insert instant, as Postgres wrote it. Never fabricated. */
  at: string;
  atMillis: number;
  /** Canonical lifecycle position, the timestamp's tiebreaker. */
  sequence: number;
}

function readSequence(row: InterventionEventRow): number {
  const raw = row.metadata?.["sequence"];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  // JSONB numerics arrive as strings through some clients; accept both.
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return CANONICAL_SEQUENCE[row.event_type] ?? UNKNOWN_SEQUENCE;
}

/** The entry's prose, never a raw identifier. */
export function timelineMessage(row: InterventionEventRow): string {
  const message = row.message?.trim() ?? "";
  if (message !== "" && !UUID_PATTERN.test(message)) return message;
  return EVENT_FALLBACK_MESSAGE[row.event_type] ?? GENERIC_FALLBACK_MESSAGE;
}

export function toTimelineEntry(row: InterventionEventRow): TimelineEntry {
  return {
    id: row.id,
    interventionId: row.intervention_id,
    eventType: row.event_type,
    label: EVENT_LABEL[row.event_type] ?? row.event_type.replace(/_/g, " "),
    tone: EVENT_TONE[row.event_type] ?? "neutral",
    message: timelineMessage(row),
    at: row.created_at,
    atMillis: Date.parse(row.created_at),
    sequence: readSequence(row),
  };
}

/**
 * Chronological, then by lifecycle position. `created_at` is compared as a
 * string after the sequence, not before it: that recovers the sub-millisecond
 * precision `Date.parse` discarded without letting it override the sequence,
 * so the order stays deterministic even for two events written inside one RPC
 * call on a coarse clock.
 */
export function compareTimelineEntries(a: TimelineEntry, b: TimelineEntry): number {
  const aMillis = Number.isFinite(a.atMillis) ? a.atMillis : Number.POSITIVE_INFINITY;
  const bMillis = Number.isFinite(b.atMillis) ? b.atMillis : Number.POSITIVE_INFINITY;
  if (aMillis !== bMillis) return aMillis - bMillis;
  if (a.sequence !== b.sequence) return a.sequence - b.sequence;
  if (a.at !== b.at) return a.at < b.at ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Oldest first — the order the facility lived through. */
export function buildTimeline(
  rows: readonly InterventionEventRow[],
): TimelineEntry[] {
  return rows.map(toTimelineEntry).sort(compareTimelineEntries);
}

/**
 * `HH:MM:SS` in the Manager's own timezone, built from Date fields rather than
 * `Intl` so the same string renders on the server and in the browser.
 */
export function formatTimelineClock(atMillis: number): string {
  if (!Number.isFinite(atMillis)) return "—";
  const at = new Date(atMillis);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`;
}
