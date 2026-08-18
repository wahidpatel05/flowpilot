"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  findIncomingAssignment,
  INCOMING_STATUSES,
  type InterventionRow,
} from "../lib/interventionTarget";

/**
 * Safety-net poll interval. Realtime should make this unnecessary in the
 * common case, but this hook has no connection-state tracking of its own
 * (unlike `useLiveFacility`), so a dropped channel would otherwise leave the
 * incoming-Assignment card stale with no visible sign anything is wrong.
 */
const POLL_INTERVAL_MS = 10_000;

/**
 * The temporary Assignment DeQueue wants to move onto this Counter, if any —
 * the consent step CONTEXT.md requires before it can touch a real Counter.
 *
 * `interventions.action_payload` is JSONB, so `postgres_changes` cannot filter
 * server-side on the counter it targets; this subscribes to the whole table
 * (a handful of rows at hackathon scale, per INTEGRATION.md's "subscribe
 * narrowly" note) and applies the real filter — `findIncomingAssignment` —
 * client-side.
 */
export function useIncomingAssignment(counterId: string | null): {
  assignment: InterventionRow | null;
  error: string | null;
  refetch: () => void;
} {
  const [assignment, setAssignment] = useState<InterventionRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latestRequestId = useRef(0);
  const loadRef = useRef<() => void>(() => {});

  const refetch = useCallback(() => {
    loadRef.current();
  }, []);

  useEffect(() => {
    if (counterId === null) {
      setAssignment(null);
      setError(null);
      loadRef.current = () => {};
      return;
    }

    let isMounted = true;
    const currentCounterId = counterId;

    async function load() {
      const requestId = ++latestRequestId.current;
      const { data, error: fetchError } = await supabase
        .from("interventions")
        .select("id,status,action_type,action_payload,estimated_minutes_returned,created_at")
        .in("status", INCOMING_STATUSES);

      if (!isMounted || requestId !== latestRequestId.current) return;

      if (fetchError !== null) {
        setError(`DeQueue: failed to read incoming assignments — ${fetchError.message}`);
        return;
      }

      setError(null);
      setAssignment(
        findIncomingAssignment((data ?? []) as unknown as InterventionRow[], currentCounterId),
      );
    }

    loadRef.current = () => {
      void load();
    };
    void load();

    const channel = supabase
      .channel(`desk-incoming-${counterId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "interventions" },
        () => {
          void load();
        },
      )
      .subscribe();

    const pollId = setInterval(() => {
      void load();
    }, POLL_INTERVAL_MS);

    return () => {
      isMounted = false;
      loadRef.current = () => {};
      clearInterval(pollId);
      void supabase.removeChannel(channel);
    };
  }, [counterId]);

  return { assignment, error, refetch };
}
