/**
 * Drives the Live Token screen: fetch, then stay current with no interaction
 * from the Visitor.
 *
 * Subscribes to two channels, both scoped to this Token's Service, never to
 * the whole facility: `tokens` (this Visitor's own row for its status, and
 * every other queueing Token for position — a Desk completing a Service
 * changes another Token's row, not this one, so a same-Service tokens
 * subscription is what "shortens this Visitor's ETA with no interaction"
 * actually requires) and `counter_assignments` (capacity — an applied
 * Intervention). INTEGRATION.md's realtime table names only "own token" for
 * the Visitor; that undersells what is needed here, or FR-006's example
 * ("Desk completes token -> Visitor position updates") could not hold. Two
 * filtered channels on one Service is still narrow — nowhere near the whole
 * facility the catalogue screen reads once at open.
 *
 * FR-006 requires an explicit fallback if Realtime fails, so a slow poll runs
 * alongside the subscriptions regardless of whether they are behaving.
 */
import { useEffect, useState } from "react";
import { projectFacility } from "@flowpilot/core";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { TokenRow } from "@flowpilot/core";
import { fetchServiceQueueRows } from "../facility/fetchServiceQueueRows";
import { fetchTokenRow } from "../facility/fetchTokenRow";
import { getSupabaseClient } from "../supabase";
import {
  deriveConnectionState,
  type ChannelSubscribeStatus,
  type ConnectionState,
} from "./connectionState";
import { didEtaImprove } from "./improvementMoment";
import { buildLiveTokenModel, type LiveTokenModel } from "./tokenPresentation";

/** Coalesces a burst of realtime events (e.g. Simulate Rush) into one refetch. */
const REFRESH_DEBOUNCE_MS = 250;
/** FR-006's explicit fallback: catches up within a few seconds if Realtime drops. */
const POLL_INTERVAL_MS = 12_000;

export interface LiveTokenState {
  model: LiveTokenModel | null;
  isLoading: boolean;
  error: string | null;
  /** TRUE when the Token row is gone — a stale pointer, e.g. after reset_demo(). */
  notFound: boolean;
  /**
   * Set to Date.now() the moment `didEtaImprove` fires, else carried forward
   * unchanged — so a screen can useEffect on this value to play the
   * improvement moment exactly once per improvement, not once per render.
   */
  improvedAt: number | null;
  /** A4's connection indicator: whether both Realtime channels below are actually subscribed. */
  connectionState: ConnectionState;
}

export function useLiveToken(
  tokenId: string,
  serviceNameHint: string,
): LiveTokenState {
  const [state, setState] = useState<LiveTokenState>({
    model: null,
    isLoading: true,
    error: null,
    notFound: false,
    improvedAt: null,
    connectionState: "connecting",
  });

  useEffect(() => {
    const client = getSupabaseClient();
    let debounceHandle: ReturnType<typeof setTimeout> | undefined;
    let channels: RealtimeChannel[] = [];
    let cancelled = false;
    // Reset per Token — a new Token shouldn't inherit a stale celebration.
    let previousModel: LiveTokenModel | null = null;
    // One slot per channel opened below (tokens, counter_assignments) — see
    // subscribeToService. Fixed length, pre-filled undefined: deriveConnectionState
    // treats a shorter array as "every reported channel happens to be
    // SUBSCRIBED," which would read "live" after only one of two channels has
    // actually confirmed.
    const channelStatuses: (ChannelSubscribeStatus | undefined)[] = [undefined, undefined];

    // Position and ETA are only meaningful while still queueing; every other
    // status is a fixed message tokenPresentation renders without a
    // projection, so there is nothing else worth reading for it.
    async function buildModelFor(token: TokenRow): Promise<LiveTokenModel> {
      if (token.status !== "waiting") {
        return buildLiveTokenModel({ token, serviceName: serviceNameHint, projection: null });
      }
      const rows = await fetchServiceQueueRows(client, token.service_id);
      const projection = projectFacility(rows);
      const serviceName = projection.serviceDetails[0]?.serviceName ?? serviceNameHint;
      return buildLiveTokenModel({ token, serviceName, projection });
    }

    function scheduleRefresh() {
      if (debounceHandle !== undefined) clearTimeout(debounceHandle);
      debounceHandle = setTimeout(() => void refresh(), REFRESH_DEBOUNCE_MS);
    }

    // Called once per channel, by index, whenever its subscribe status changes —
    // recomputes the shared connectionState from every slot, not just this one.
    function onChannelStatus(index: number, status: ChannelSubscribeStatus) {
      channelStatuses[index] = status;
      if (cancelled) return;
      setState((previous) => ({
        ...previous,
        connectionState: deriveConnectionState(channelStatuses),
      }));
    }

    function subscribeToService(serviceId: string) {
      channels = [
        client
          .channel(`live-token-${tokenId}-tokens`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "tokens", filter: `service_id=eq.${serviceId}` },
            scheduleRefresh,
          )
          .subscribe((status) => onChannelStatus(0, status)),
        client
          .channel(`live-token-${tokenId}-assignments`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "counter_assignments",
              filter: `service_id=eq.${serviceId}`,
            },
            scheduleRefresh,
          )
          .subscribe((status) => onChannelStatus(1, status)),
      ];
    }

    // Reused for the initial load, every realtime event, and the fallback poll.
    // The channels open exactly once, the first time a Token is found — cheap
    // to guard on channels.length rather than threading a separate "started"
    // flag through.
    async function refresh() {
      try {
        const token = await fetchTokenRow(client, tokenId);
        if (cancelled) return;
        if (token === null) {
          setState((previous) => ({
            model: null,
            isLoading: false,
            error: null,
            notFound: true,
            improvedAt: previous.improvedAt,
            connectionState: previous.connectionState,
          }));
          return;
        }
        if (channels.length === 0) subscribeToService(token.service_id);
        const model = await buildModelFor(token);
        if (cancelled) return;
        const improved = didEtaImprove(previousModel, model);
        previousModel = model;
        setState((previous) => ({
          model,
          isLoading: false,
          error: null,
          notFound: false,
          improvedAt: improved ? Date.now() : previous.improvedAt,
          connectionState: previous.connectionState,
        }));
      } catch (caught) {
        if (cancelled) return;
        setState((previous) => ({
          ...previous,
          isLoading: false,
          error: caught instanceof Error ? caught.message : String(caught),
        }));
      }
    }
    void refresh();

    const pollHandle = setInterval(() => void refresh(), POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (debounceHandle !== undefined) clearTimeout(debounceHandle);
      clearInterval(pollHandle);
      for (const channel of channels) void client.removeChannel(channel);
    };
    // tokenId is this effect's only real input; serviceNameHint is a launch-time
    // hint, not a live value, and re-subscribing on every render would thrash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenId]);

  return state;
}
