"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  buildInterventionLedger,
  type InterventionLedger,
} from "../lib/interventionLedger";
import {
  buildTimeline,
  type InterventionEventRow,
  type TimelineEntry,
} from "../lib/interventionTimeline";
import type { InterventionRow } from "../lib/interventionTarget";
import type { ToastsController } from "./useToasts";
import { useTransientFlag } from "./useTransientFlag";

const INTERVENTION_COLUMNS =
  "id,status,action_type,action_payload,estimated_minutes_returned,created_at,approved_at,accepted_at,applied_at";

const EVENT_COLUMNS = "id,intervention_id,event_type,message,metadata,created_at";

/**
 * How many timeline events to hold. The timeline is read, not scrolled
 * forever, and a demo produces a few dozen rows; the cap keeps a long
 * rehearsal session from growing the page without bound.
 */
const EVENT_LIMIT = 200;

/** Safety-net poll interval, for a Realtime channel that quietly degrades. */
const POLL_INTERVAL_MS = 10_000;

const EMPTY_LEDGER: InterventionLedger = {
  cumulativeMinutesReturned: 0,
  realisedCount: 0,
  awaitingApply: null,
};

export interface InterventionsController {
  ledger: InterventionLedger;
  /** Oldest first — the order the facility lived through. */
  timeline: readonly TimelineEntry[];
  /** TRUE while the apply RPC is in flight. */
  applying: boolean;
  /**
   * The RPC's own message on a failed apply — never swallowed. `apply_intervention()`
   * raises `P0001` with a human-readable message on invalid state, including on
   * a second apply, and that sentence is the whole point.
   */
  applyError: string | null;
  /** A read failure, kept apart from an apply failure. */
  readError: string | null;
  /** TRUE for a few seconds after a successful apply — an animation beat, not state. */
  justApplied: boolean;
  apply: (id: string) => void;
}

/**
 * Control's side of the closed loop after approval: the running Estimated Time
 * Returned, the Intervention still awaiting Apply, and the timeline explaining
 * the causal chain.
 *
 * Everything is read from the database on mount and kept live by Realtime, so
 * the whole sequence survives a page refresh mid-flow — an approved Intervention
 * is still there to apply, and the timeline still explains how it got there.
 * No state that matters lives only in this hook.
 *
 * Apply calls `apply_intervention()` and nothing else. That RPC is the keystone
 * hop and the only place capacity changes (INTEGRATION.md); this hook never
 * writes `counter_assignments`, or any other row, itself.
 */
export function useInterventions(
  notify: ToastsController,
  /** Called after a successful apply, to pull the Digital Twin forward at once. */
  onApplied: () => void,
): InterventionsController {
  const [ledger, setLedger] = useState<InterventionLedger>(EMPTY_LEDGER);
  const [timeline, setTimeline] = useState<readonly TimelineEntry[]>([]);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [justApplied, triggerJustApplied] = useTransientFlag(4000);

  /**
   * The double-click guard. A ref, not the `applying` state: two clicks in the
   * same React batch would both read the pre-update state and both fire the
   * RPC. The disabled button is the visible half of this; the ref is the half
   * that actually holds.
   */
  const applyingRef = useRef(false);

  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const onAppliedRef = useRef(onApplied);
  onAppliedRef.current = onApplied;

  const latestRequestId = useRef(0);
  const isMounted = useRef(true);

  const load = useCallback(async () => {
    const requestId = ++latestRequestId.current;
    const [interventionsRes, eventsRes] = await Promise.all([
      supabase
        .from("interventions")
        .select(INTERVENTION_COLUMNS)
        .order("created_at", { ascending: false }),
      supabase
        .from("intervention_events")
        .select(EVENT_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(EVENT_LIMIT),
    ]);

    // Realtime can fire several callbacks for one transaction, so more than one
    // read can be in flight; only the newest is ever applied.
    if (!isMounted.current || requestId !== latestRequestId.current) return;

    const failure = interventionsRes.error ?? eventsRes.error;
    if (failure !== null) {
      setReadError(`FlowPilot: failed to read the Interventions — ${failure.message}`);
      return;
    }

    setReadError(null);
    setLedger(
      buildInterventionLedger((interventionsRes.data ?? []) as unknown as InterventionRow[]),
    );
    setTimeline(
      buildTimeline((eventsRes.data ?? []) as unknown as InterventionEventRow[]),
    );
  }, []);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    isMounted.current = true;
    void loadRef.current();

    const channel = supabase.channel("control-interventions");
    for (const table of ["interventions", "intervention_events"] as const) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          void loadRef.current();
        },
      );
    }
    channel.subscribe();

    const pollId = setInterval(() => {
      void loadRef.current();
    }, POLL_INTERVAL_MS);

    return () => {
      isMounted.current = false;
      clearInterval(pollId);
      void supabase.removeChannel(channel);
    };
  }, []);

  const apply = useCallback(
    (id: string) => {
      if (applyingRef.current) return;
      applyingRef.current = true;
      setApplying(true);
      setApplyError(null);

      void (async () => {
        const { error } = await supabase.rpc("apply_intervention", {
          p_intervention_id: id,
        });

        if (error !== null) {
          // Surfaced verbatim: on a double-apply this is Postgres telling the
          // Manager the capacity was NOT changed a second time.
          setApplyError(error.message);
          notifyRef.current.push("error", "Apply failed", error.message);
        } else {
          notifyRef.current.push(
            "success",
            "Intervention applied",
            "Capacity has changed — the Digital Twin is catching up.",
          );
          triggerJustApplied();
          onAppliedRef.current();
        }

        // Re-read either way: a refusal usually means the row already moved on,
        // and the timeline should show why.
        await loadRef.current();
        applyingRef.current = false;
        if (isMounted.current) setApplying(false);
      })();
    },
    [triggerJustApplied],
  );

  return { ledger, timeline, applying, applyError, readError, justApplied, apply };
}
