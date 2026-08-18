"use client";

import { useEffect, useRef, useState } from "react";
import {
  selectActiveTokens,
  type ActiveToken,
  type ActiveTokenRow,
} from "../lib/activeCounterTokens";
import { supabase } from "../lib/supabaseClient";

export type { ActiveToken } from "../lib/activeCounterTokens";

export interface ActiveCounterTokens {
  calledToken: ActiveToken | null;
  servingToken: ActiveToken | null;
  error: string | null;
}

/**
 * Safety-net poll interval. Realtime should make this unnecessary in the
 * common case, but this hook has no connection-state tracking of its own
 * (unlike `useLiveFacility`), so a dropped channel would otherwise leave Now
 * Serving stale with no visible sign anything is wrong.
 */
const POLL_INTERVAL_MS = 10_000;

/**
 * The Token this Counter has called (not yet started) and the one it is
 * presently serving, read straight off `tokens` rather than the projection —
 * `selectActiveTokens` explains why, and makes the choice itself.
 *
 * `is_simulated` is selected as well as the clocks: the Desk calls rush Tokens
 * during the demo, and every surface showing a simulated Visitor has to say so.
 *
 * The first read happens on mount, so this surface comes back from a refresh
 * without waiting for a Realtime event.
 */
export function useActiveCounterTokens(serviceId: string | null): ActiveCounterTokens {
  const [calledToken, setCalledToken] = useState<ActiveToken | null>(null);
  const [servingToken, setServingToken] = useState<ActiveToken | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latestRequestId = useRef(0);

  useEffect(() => {
    if (serviceId === null) {
      setCalledToken(null);
      setServingToken(null);
      setError(null);
      return;
    }

    let isMounted = true;
    const requestId = ++latestRequestId.current;

    async function load() {
      const { data, error: fetchError } = await supabase
        .from("tokens")
        .select("id,token_number,status,called_at,service_started_at,is_simulated")
        .eq("service_id", serviceId)
        .in("status", ["called", "serving"]);

      if (!isMounted || requestId !== latestRequestId.current) return;

      if (fetchError !== null) {
        setError(`DeQueue: failed to read the counter's tokens — ${fetchError.message}`);
        return;
      }
      setError(null);

      // PostgREST widens `status` to string. The narrowing is sound at this one
      // boundary and nowhere else: `tokens.status` is CHECK-constrained to the
      // TokenStatus union in Postgres, and this query filters to two of its
      // members. Past here the union is enforced by the compiler.
      const rows = (data ?? []) as unknown as ActiveTokenRow[];
      const selection = selectActiveTokens(rows, Date.now());
      setCalledToken(selection.calledToken);
      setServingToken(selection.servingToken);
    }

    void load();

    const channel = supabase
      .channel(`desk-active-${serviceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tokens", filter: `service_id=eq.${serviceId}` },
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
      clearInterval(pollId);
      void supabase.removeChannel(channel);
    };
  }, [serviceId]);

  return { calledToken, servingToken, error };
}
