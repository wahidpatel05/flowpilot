"use client";

import { useCallback, useState } from "react";
import { supabase } from "../lib/supabaseClient";

/** The demo-control RPCs Control is allowed to call. */
export type DemoAction = "simulate_rush" | "reset_demo";

export interface DemoControls {
  /** Which action is in flight, or null. */
  pending: DemoAction | null;
  /** The RPC's own message on failure — these are written for a human. */
  error: string | null;
  /** A short confirmation of what the last successful action did. */
  lastResult: string | null;
  run: (action: DemoAction) => void;
}

function describe(action: DemoAction, payload: unknown): string {
  if (action === "simulate_rush") {
    const added =
      typeof payload === "object" && payload !== null && "tokens_added" in payload
        ? (payload as { tokens_added?: number }).tokens_added
        : undefined;
    return added === undefined
      ? "Rush simulated."
      : `Rush simulated — ${added} simulated Visitors joined.`;
  }
  return "Reset to the seeded baseline.";
}

/**
 * Runs the demo-control RPCs. Both mutate through Postgres functions rather
 * than client-side writes, so Control cannot drift from what the golden-path
 * script and the Desk do.
 *
 * `onDone` triggers an immediate refetch: Realtime will also deliver these
 * changes, but a demo on stage should not wait on a round trip through the
 * socket to redraw.
 */
export function useDemoControls(onDone: () => void): DemoControls {
  const [pending, setPending] = useState<DemoAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const run = useCallback(
    (action: DemoAction) => {
      setPending(action);
      setError(null);
      void (async () => {
        const { data, error: rpcError } = await supabase.rpc(action);
        if (rpcError) {
          // The RPCs raise P0001 with text meant for an operator to read.
          setError(rpcError.message);
          setLastResult(null);
        } else {
          setError(null);
          setLastResult(describe(action, data));
          onDone();
        }
        setPending(null);
      })();
    },
    [onDone],
  );

  return { pending, error, lastResult, run };
}
