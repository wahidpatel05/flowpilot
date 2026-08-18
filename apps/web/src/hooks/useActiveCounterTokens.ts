"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export interface ActiveToken {
  id: string;
  tokenNumber: string;
  /** `called_at` for a called Token, `service_started_at` for a serving one. */
  startedAtMillis: number;
}

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
 * presently serving, read straight off `tokens` rather than the projection:
 * `projectFacility` deliberately excludes `serving` Tokens from
 * `ProjectedService.queue` (they have already left the queue), and it carries
 * no `called_at`/`service_started_at` timestamps for the "Now Serving" clock.
 *
 * `tokens` has no `counter_id`, only `service_id`, so when a Service runs more
 * than one active Counter this can only report the single most recent called
 * and serving Token for the whole Service, not necessarily the ones at THIS
 * Counter. Acceptable at hackathon scale (the seeded baseline runs one active
 * Counter per Service); a true per-Counter answer needs a schema change, out
 * of scope here.
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
        .select("id,token_number,status,called_at,service_started_at")
        .eq("service_id", serviceId)
        .in("status", ["called", "serving"]);

      if (!isMounted || requestId !== latestRequestId.current) return;

      if (fetchError !== null) {
        setError(`DeQueue: failed to read the counter's tokens — ${fetchError.message}`);
        return;
      }
      setError(null);

      const rows = data ?? [];
      const called = rows
        .filter((row) => row.status === "called")
        .sort((a, b) => Date.parse(b.called_at ?? "") - Date.parse(a.called_at ?? ""))[0];
      const serving = rows
        .filter((row) => row.status === "serving")
        .sort(
          (a, b) =>
            Date.parse(b.service_started_at ?? "") - Date.parse(a.service_started_at ?? ""),
        )[0];

      setCalledToken(
        called === undefined
          ? null
          : {
              id: called.id as string,
              tokenNumber: (called.token_number as string | null) ?? "",
              startedAtMillis:
                called.called_at !== null ? Date.parse(called.called_at as string) : Date.now(),
            },
      );
      setServingToken(
        serving === undefined
          ? null
          : {
              id: serving.id as string,
              tokenNumber: (serving.token_number as string | null) ?? "",
              startedAtMillis:
                serving.service_started_at !== null
                  ? Date.parse(serving.service_started_at as string)
                  : Date.now(),
            },
      );
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
