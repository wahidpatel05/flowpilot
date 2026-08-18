"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { fetchFacilityRows } from "../lib/fetchFacilityRows";
import {
  connectionReducer,
  initialConnectionState,
  shouldPoll,
  type ConnectionState,
} from "../lib/connectionState";
import {
  projectFacility,
  type FacilityProjection,
  type ServiceFlowEdgeRow,
} from "../lib/core";

/**
 * Tables whose changes can move a number rendered on this page. `counters`
 * and `staff` are deliberately excluded: activeCounters is derived only from
 * `counter_assignments` (ADR-0001), and staff availability isn't rendered
 * here, so watching them would only add wasted refetches.
 */
const WATCHED_TABLES = ["tokens", "counter_assignments"] as const;

/**
 * How often to refetch once the Realtime channel has been given up on, or
 * once a fetch itself has failed — a subscribed-but-erroring channel must
 * retry too, not just a dropped one.
 */
const POLL_INTERVAL_MS = 5_000;

/** id -> display name, for surfaces that must never render a raw identifier. */
export type NameLookup = Readonly<Record<string, string>>;

function buildNameLookup(
  rows: readonly { id: string; name?: string | null }[] | undefined,
): NameLookup {
  const lookup: Record<string, string> = {};
  for (const row of rows ?? []) {
    lookup[row.id] = row.name ?? row.id;
  }
  return lookup;
}

/** service id -> the Token currently being served there, for a "Now Serving" widget. */
export type NowServingLookup = Readonly<Record<string, string>>;

function buildNowServingLookup(
  rows: readonly { service_id: string; token_number?: string | null; status: string; service_started_at?: string | number | Date | null }[] | undefined,
): NowServingLookup {
  const latestStartedAtByService = new Map<string, number>();
  const lookup: Record<string, string> = {};
  for (const row of rows ?? []) {
    if (row.status !== "serving") continue;
    const startedAtMillis = row.service_started_at ? Date.parse(String(row.service_started_at)) : 0;
    const current = latestStartedAtByService.get(row.service_id) ?? -Infinity;
    if (startedAtMillis >= current) {
      latestStartedAtByService.set(row.service_id, startedAtMillis);
      lookup[row.service_id] = row.token_number ?? "";
    }
  }
  return lookup;
}

export interface LiveFacility {
  projection: FacilityProjection | null;
  /**
   * The Flow Graph edges as fetched. The projection folds these into each
   * Service's downstream arrival rate but does not carry the edges themselves,
   * and Control needs the from/to pairs to actually draw the graph.
   */
  flowEdges: readonly ServiceFlowEdgeRow[];
  /**
   * Staff and Counter names by id. `CounterState`/`StaffMemberState` are frozen
   * engine contracts that carry only ids, but a Recommendation card must name
   * the actual Staff member and Counter, never a raw identifier — so these ride
   * alongside the projection from the same fetch rather than a second round trip.
   */
  staffNames: NameLookup;
  counterNames: NameLookup;
  /** service id -> the Token number currently being served there. */
  nowServing: NowServingLookup;
  connection: ConnectionState;
  error: string | null;
  /** Refetch on demand — used right after a demo-control RPC. */
  refresh: () => void;
}

/**
 * Fetches the facility once, projects it through the shared engine, and keeps
 * it live: Realtime pushes a refetch on any relevant row change, and if the
 * channel degrades enough, a polling timer takes over so the page never just
 * freezes. Every number rendered downstream comes from `projectFacility` —
 * this hook holds no ETA or Health logic of its own.
 */
export function useLiveFacility(): LiveFacility {
  const [projection, setProjection] = useState<FacilityProjection | null>(null);
  const [flowEdges, setFlowEdges] = useState<readonly ServiceFlowEdgeRow[]>([]);
  const [staffNames, setStaffNames] = useState<NameLookup>({});
  const [counterNames, setCounterNames] = useState<NameLookup>({});
  const [nowServing, setNowServing] = useState<NowServingLookup>({});
  const [error, setError] = useState<string | null>(null);
  const [connection, dispatch] = useReducer(connectionReducer, initialConnectionState);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  /**
   * A monotonically increasing request id. Realtime can fire several
   * `postgres_changes` callbacks for one transaction in quick succession, so
   * more than one fetch can be in flight at once; if responses arrive out of
   * order, applying an older one after a newer one has already landed would
   * transiently revert the page to stale data. Only the response matching
   * the latest issued request is ever applied.
   */
  const latestRequestId = useRef(0);

  const refetch = useRef(async () => {
    const requestId = ++latestRequestId.current;
    try {
      const rows = await fetchFacilityRows();
      if (!isMounted.current || requestId !== latestRequestId.current) return;
      setProjection(projectFacility(rows));
      setFlowEdges(rows.serviceFlowEdges ?? []);
      setStaffNames(buildNameLookup(rows.staff));
      setCounterNames(buildNameLookup(rows.counters));
      setNowServing(buildNowServingLookup(rows.tokens));
      setError(null);
    } catch (err) {
      if (!isMounted.current || requestId !== latestRequestId.current) return;
      setError(err instanceof Error ? err.message : "FlowPilot: failed to load the facility.");
    }
  });

  useEffect(() => {
    void refetch.current();

    const channel = supabase.channel("facility-tracer");
    for (const table of WATCHED_TABLES) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          void refetch.current();
        },
      );
    }
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        dispatch({ type: "subscribed" });
      } else if (status === "CHANNEL_ERROR") {
        dispatch({ type: "channel_error" });
      } else if (status === "TIMED_OUT") {
        dispatch({ type: "timed_out" });
      } else if (status === "CLOSED") {
        dispatch({ type: "closed" });
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  /*
   * Two independent reasons to poll: the channel gave up (shouldPoll), or the
   * last fetch itself failed even though the channel is healthy (a
   * subscribed-but-erroring page must still retry, not wait forever for a
   * row change that may never come). Depending on `connection.phase` rather
   * than the whole `connection` object matters: connectionReducer returns a
   * new object on every event, including repeated failures that don't change
   * the phase, and depending on the object would tear down and restart this
   * interval on every one of those — starving the poll if failures arrive
   * faster than POLL_INTERVAL_MS.
   */
  const isPolling = shouldPoll(connection) || error !== null;

  useEffect(() => {
    if (!isPolling) return;
    const id = setInterval(() => {
      void refetch.current();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isPolling]);

  const refresh = useCallback(() => {
    void refetch.current();
  }, []);

  return { projection, flowEdges, staffNames, counterNames, nowServing, connection, error, refresh };
}
