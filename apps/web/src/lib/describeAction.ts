/**
 * One sentence describing a capacity move, in prose that names the actual
 * Staff member, Counter and Services — never a raw identifier.
 *
 * The wording deliberately mirrors `fp_action_label`'s phrasing in
 * `supabase/migrations/0002_apply_intervention.sql`, so the Recommendation
 * card, the Apply card and the timeline the database writes never disagree on
 * how to describe the same move.
 */
import { recommendationParties, type ActionShape } from "./recommendationRow";
import { describeParty, type NameLookup } from "./names";

export interface PartyNames {
  staffNames: NameLookup;
  counterNames: NameLookup;
  serviceNames: NameLookup;
}

interface NamedParties {
  staffName: string;
  counterName: string;
  fromServiceName: string;
  toServiceName: string;
  durationMinutes: number;
}

/** The same fallbacks `fp_action_label` uses, so an unnamed party still reads. */
function nameParties(row: ActionShape, names: PartyNames): NamedParties {
  const parties = recommendationParties(row);
  return {
    staffName: describeParty(names.staffNames, parties.staffId, "the staff member"),
    counterName: describeParty(names.counterNames, parties.counterId, "the counter"),
    fromServiceName: describeParty(
      names.serviceNames,
      parties.fromServiceId,
      "their current service",
    ),
    toServiceName: describeParty(names.serviceNames, parties.toServiceId, "the service"),
    durationMinutes: parties.durationMinutes,
  };
}

/** Imperative — what DeQueue is asking the Manager to authorise. */
export function describeMove(row: ActionShape, names: PartyNames): string {
  const p = nameParties(row, names);
  if (row.action_type === "activate_counter") {
    return `Open ${p.counterName} with ${p.staffName} for ${p.toServiceName}.`;
  }
  return `Move ${p.staffName} from ${p.fromServiceName} to ${p.toServiceName}, at ${p.counterName}.`;
}

/**
 * Past tense — what the facility did. Used by the Apply card's confirmation
 * and as the timeline's fallback when an `applied` event carries no message of
 * its own.
 */
export function describeAppliedMove(row: ActionShape, names: PartyNames): string {
  const p = nameParties(row, names);
  if (row.action_type === "activate_counter") {
    return `${p.counterName} opened for ${p.toServiceName}. ${p.staffName} is serving there for the next ${p.durationMinutes} minutes.`;
  }
  return `${p.staffName} moved from ${p.fromServiceName} to ${p.toServiceName} at ${p.counterName} for the next ${p.durationMinutes} minutes.`;
}
