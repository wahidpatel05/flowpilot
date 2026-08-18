"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { fetchFacilityRows } from "../lib/fetchFacilityRows";
import { joinQueue } from "../lib/joinQueue";
import {
  clearVisitorSession,
  readVisitorSession,
  writeVisitorSession,
  type VisitorSession,
} from "../lib/visitorSession";
import {
  connectionReducer,
  initialConnectionState,
  shouldPoll,
  type ConnectionState,
} from "../lib/connectionState";
import {
  projectFacility,
  projectTokenEta,
  type FacilityProjection,
  type ProjectedTokenEta,
} from "../lib/core";

/**
 * How often to refetch while there is no live push to trust: before a Token
 * exists (there is deliberately no Realtime subscription yet — see below) and
 * whenever the post-join channel has degraded or a fetch itself failed.
 */
const POLL_INTERVAL_MS = 5_000;

export interface VisitorQueue {
  projection: FacilityProjection | null;
  session: VisitorSession | null;
  myEta: ProjectedTokenEta | null;
  connection: ConnectionState;
  error: string | null;
  isJoining: boolean;
  join: (serviceId: string, serviceSlug: string | undefined) => void;
  leave: () => void;
}

/**
 * Drives both screens of the insurance-scope Visitor PWA off one facility
 * projection, the same way Control's useLiveFacility does — no ETA or Health
 * logic lives here, only projectFacility's output.
 *
 * The one Visitor-specific rule is realtime scope (INTEGRATION.md: "Visitor:
 * own token; counter_assignments filtered to their service"). Before a Token
 * exists there is nothing of the Visitor's own to subscribe to, so the
 * service picker only polls; once joined, this subscribes narrowly to that
 * Token's own Service — never the whole facility.
 */
export function useVisitorQueue(): VisitorQueue {
  const [projection, setProjection] = useState<FacilityProjection | null>(null);
  const [session, setSessionState] = useState<VisitorSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [connection, dispatch] = useReducer(connectionReducer, initialConnectionState);
  const isMounted = useRef(true);
  const latestRequestId = useRef(0);

  useEffect(() => {
    isMounted.current = true;
    setSessionState(readVisitorSession(window.localStorage));
    return () => {
      isMounted.current = false;
    };
  }, []);

  const refetch = useRef(async () => {
    const requestId = ++latestRequestId.current;
    try {
      const rows = await fetchFacilityRows();
      if (!isMounted.current || requestId !== latestRequestId.current) return;
      setProjection(projectFacility(rows));
      setError(null);
    } catch (err) {
      if (!isMounted.current || requestId !== latestRequestId.current) return;
      setError(
        err instanceof Error ? err.message : "DeQueue: failed to load the queue.",
      );
    }
  });

  useEffect(() => {
    void refetch.current();
  }, []);

  // Realtime, scoped to this Token's own Service only — see the doc comment.
  useEffect(() => {
    if (session === null) return;
    const channel = supabase.channel(`visitor-${session.serviceId}`);
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "tokens",
        filter: `service_id=eq.${session.serviceId}`,
      },
      () => void refetch.current(),
    );
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "counter_assignments",
        filter: `service_id=eq.${session.serviceId}`,
      },
      () => void refetch.current(),
    );
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
  }, [session]);

  // Poll whenever there is no Token to subscribe for yet, the post-join
  // channel has degraded, or the last fetch itself failed.
  const isPolling = session === null || shouldPoll(connection) || error !== null;

  useEffect(() => {
    if (!isPolling) return;
    const id = setInterval(() => void refetch.current(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isPolling]);

  const join = useCallback((serviceId: string, serviceSlug: string | undefined) => {
    setIsJoining(true);
    setError(null);
    void (async () => {
      try {
        const result = await joinQueue(serviceId, serviceSlug);
        const next: VisitorSession = {
          tokenId: result.tokenId,
          tokenNumber: result.tokenNumber,
          serviceId: result.serviceId,
        };
        writeVisitorSession(window.localStorage, next);
        if (!isMounted.current) return;
        setSessionState(next);
        await refetch.current();
      } catch (err) {
        if (!isMounted.current) return;
        setError(
          err instanceof Error ? err.message : "DeQueue: could not join the queue.",
        );
      } finally {
        if (isMounted.current) setIsJoining(false);
      }
    })();
  }, []);

  const leave = useCallback(() => {
    clearVisitorSession(window.localStorage);
    setSessionState(null);
  }, []);

  const myEta =
    session !== null && projection !== null
      ? projectTokenEta(projection, session.tokenId)
      : null;

  return { projection, session, myEta, connection, error, isJoining, join, leave };
}
