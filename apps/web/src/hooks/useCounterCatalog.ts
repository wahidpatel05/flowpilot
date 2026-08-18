"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export interface CounterCatalogEntry {
  id: string;
  name: string;
}

/**
 * Counter names, for the Desk's Counter picker. `projectFacility`'s
 * `CounterState` (flowpilot-core/src/types.ts) has no `name` field — it is a
 * frozen contract this app must not extend — so the Desk reads the raw
 * `counters` table directly for this one presentational detail. Counter
 * status and Service binding still come only from the projection.
 */
export function useCounterCatalog(): { counters: CounterCatalogEntry[]; error: string | null } {
  const [counters, setCounters] = useState<CounterCatalogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const { data, error: fetchError } = await supabase
        .from("counters")
        .select("id,name")
        .order("name", { ascending: true });

      if (!isMounted) return;

      if (fetchError !== null) {
        setError(`DeQueue: failed to read counters — ${fetchError.message}`);
        return;
      }

      setError(null);
      setCounters(
        (data ?? []).map((row) => ({
          id: row.id as string,
          name: (row.name as string | null) ?? row.id,
        })),
      );
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, []);

  return { counters, error };
}
