/**
 * Loads the Service catalogue: rows -> projectFacility -> cards.
 *
 * The projection is taken at a single captured instant so that every card on
 * screen describes the same moment. Live updates arrive with the Live Token
 * work (A2); here a pull-to-refresh is the honest amount of freshness.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { projectFacility } from "@flowpilot/core";
import { buildServiceCatalogue, type ServiceCardModel } from "./catalogue";
import { fetchFacilityRows } from "./fetchFacilityRows";
import { supabase } from "../supabase";

export interface ServiceCatalogueState {
  services: ServiceCardModel[];
  /** True only for the first load, so a refresh does not blank the screen. */
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  refresh: () => void;
}

export function useServiceCatalogue(): ServiceCatalogueState {
  const [services, setServices] = useState<ServiceCardModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A refresh that resolves after unmount must not set state on a dead tree.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const load = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setIsRefreshing(true);
    try {
      const rows = await fetchFacilityRows(supabase);
      if (!isMountedRef.current) return;
      setServices(buildServiceCatalogue(projectFacility(rows)));
      setError(null);
    } catch (caught) {
      if (!isMountedRef.current) return;
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      if (!isMountedRef.current) return;
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const refresh = useCallback(() => {
    void load(true);
  }, [load]);

  return { services, isLoading, isRefreshing, error, refresh };
}
