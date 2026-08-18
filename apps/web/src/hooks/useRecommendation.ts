"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { recommendIntervention, type FacilityProjection } from "../lib/core";
import { ACTIVE_RECOMMENDATION_STATUS, type RecommendationRow } from "../lib/recommendationRow";

const SELECT_COLUMNS =
  "id,service_id,action_type,action_payload,baseline_wait,predicted_wait,baseline_person_minutes,predicted_person_minutes,estimated_minutes_returned,confidence,status,created_at";

/** Postgres numeric columns reject Infinity; an unbounded wait is stored as null. */
function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

export type RecommendationAction = "approve" | "reject";

export interface RecommendationEngine {
  /** The one live Recommendation a Manager can act on, or null. */
  active: RecommendationRow | null;
  /**
   * TRUE once the engine has run against the current facility and found
   * nothing worth doing, and no active Recommendation is on record. Distinct
   * from `active === null && !checked`, which just means the first read
   * hasn't landed yet.
   */
  noRecommendation: boolean;
  /** The RPC's own message on an approve/reject failure — never swallowed. */
  actionError: string | null;
  /** Which action is in flight, or null. */
  pendingAction: RecommendationAction | null;
  approve: (id: string) => void;
  reject: (id: string, reason: string) => void;
}

/**
 * Control is the one writer of Recommendations (INTEGRATION.md: "Only Control
 * generates Recommendations, so there is one writer and no race"). Whenever the
 * live projection updates and no Recommendation is currently outstanding, this
 * asks the engine and persists whatever it returns — Gemini never selects or
 * scores an Intervention (W3 acceptance criteria). Approve and reject always go
 * through the RPCs in INTEGRATION.md's table, never a direct write.
 */
export function useRecommendation(projection: FacilityProjection | null): RecommendationEngine {
  const [active, setActive] = useState<RecommendationRow | null>(null);
  const [checked, setChecked] = useState(false);
  const [noRecommendation, setNoRecommendation] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<RecommendationAction | null>(null);
  const generatingRef = useRef(false);

  const loadActive = useCallback(async () => {
    const { data, error } = await supabase
      .from("recommendations")
      .select(SELECT_COLUMNS)
      .eq("status", ACTIVE_RECOMMENDATION_STATUS)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error !== null) {
      setActionError(`FlowPilot: failed to read the Recommendation — ${error.message}`);
      return;
    }
    setActionError(null);
    setActive(((data ?? [])[0] as RecommendationRow | undefined) ?? null);
    setChecked(true);
  }, []);

  useEffect(() => {
    void loadActive();

    const channel = supabase
      .channel("control-recommendations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "recommendations" },
        () => {
          void loadActive();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadActive]);

  // Generate: only when the facility state is known, nothing is already
  // outstanding, and no generation is already in flight for this tick.
  useEffect(() => {
    if (projection === null || !checked || active !== null || generatingRef.current) return;

    generatingRef.current = true;
    void (async () => {
      try {
        const recommendation = recommendIntervention({
          services: projection.services,
          counters: projection.counters,
          staff: projection.staff,
          staffSkills: projection.staffSkills,
        });

        if (recommendation === null) {
          setNoRecommendation(true);
          return;
        }

        const { error } = await supabase.from("recommendations").insert({
          service_id: recommendation.serviceId,
          action_type: recommendation.actionType,
          action_payload: recommendation.actionPayload,
          baseline_wait: finiteOrNull(recommendation.baselineWaitMinutes),
          predicted_wait: finiteOrNull(recommendation.optimizedWaitMinutes),
          baseline_person_minutes: finiteOrNull(recommendation.baselinePersonMinutes),
          predicted_person_minutes: finiteOrNull(recommendation.optimizedPersonMinutes),
          estimated_minutes_returned: finiteOrNull(recommendation.estimatedMinutesReturned),
          confidence: recommendation.confidence ?? null,
          status: ACTIVE_RECOMMENDATION_STATUS,
        });

        if (error !== null) {
          setActionError(`FlowPilot: failed to persist the Recommendation — ${error.message}`);
          return;
        }
        setNoRecommendation(false);
        await loadActive();
      } finally {
        generatingRef.current = false;
      }
    })();
  }, [projection, checked, active, loadActive]);

  const approve = useCallback((id: string) => {
    setPendingAction("approve");
    setActionError(null);
    void (async () => {
      const { error } = await supabase.rpc("approve_recommendation", {
        p_recommendation_id: id,
      });
      if (error !== null) {
        setActionError(error.message);
      } else {
        await loadActive();
      }
      setPendingAction(null);
    })();
  }, [loadActive]);

  const reject = useCallback((id: string, reason: string) => {
    setPendingAction("reject");
    setActionError(null);
    void (async () => {
      const { error } = await supabase.rpc("reject_recommendation", {
        p_recommendation_id: id,
        p_reason: reason,
      });
      if (error !== null) {
        setActionError(error.message);
      } else {
        await loadActive();
      }
      setPendingAction(null);
    })();
  }, [loadActive]);

  return { active, noRecommendation, actionError, pendingAction, approve, reject };
}
