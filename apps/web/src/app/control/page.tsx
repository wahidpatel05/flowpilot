"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "./control.css";
import { useLiveFacility, type NameLookup } from "../../hooks/useLiveFacility";
import { useDemoControls } from "../../hooks/useDemoControls";
import { useRecommendation } from "../../hooks/useRecommendation";
import { useToasts } from "../../hooks/useToasts";
import { useEtaImprovement } from "../../hooks/useEtaImprovement";
import { useWaitHistory } from "../../hooks/useWaitHistory";
import { useInterventions } from "../../hooks/useInterventions";
import {
  buildControlViewModel,
  findControlNode,
  pickFeaturedService,
} from "../../lib/controlViewModel";
import { deriveAvatarMood } from "../../lib/avatarMood";
import { formatWaitMinutes } from "../../lib/formatMinutes";
import { ConnectionBadge } from "../../components/ConnectionBadge";
import { FlowGraph, type TwinMode } from "../../components/FlowGraph";
import { CriticalCallout } from "../../components/CriticalCallout";
import { FacilityTotals } from "../../components/FacilityTotals";
import { DemoControls } from "../../components/DemoControls";
import { RecommendationCard } from "../../components/RecommendationCard";
import { FlowPilotAvatar } from "../../components/FlowPilotAvatar";
import { ToastStack } from "../../components/ToastStack";
import { EtaImprovementBadge } from "../../components/EtaImprovementBadge";
import { LiveQueuePanel } from "../../components/LiveQueuePanel";
import { ServiceStatusGrid } from "../../components/ServiceStatusGrid";
import { RefreshButton } from "../../components/RefreshButton";
import { InterventionApplyCard } from "../../components/InterventionApplyCard";
import { InterventionTimeline } from "../../components/InterventionTimeline";
import { TimeReturnedCard } from "../../components/TimeReturnedCard";
import { ServiceQueueDetail } from "../../components/ServiceQueueDetail";

export default function ControlPage() {
  const {
    projection,
    flowEdges,
    staffNames,
    counterNames,
    nowServing,
    connection,
    error,
    refresh,
  } = useLiveFacility();
  const [mode, setMode] = useState<TwinMode>("now");
  const demo = useDemoControls(refresh);
  const toasts = useToasts();
  const recommendation = useRecommendation(projection, toasts);
  // `refresh` pulls the Digital Twin forward the instant capacity changes,
  // rather than waiting on the counter_assignments Realtime round trip.
  const interventions = useInterventions(toasts, refresh);
  const [drilledServiceId, setDrilledServiceId] = useState<string | null>(null);

  const viewModel = useMemo(
    () =>
      projection === null
        ? null
        : buildControlViewModel({ projection, flowEdges }),
    [projection, flowEdges],
  );

  const serviceNames: NameLookup = useMemo(() => {
    if (viewModel === null) return {};
    const lookup: Record<string, string> = {};
    for (const service of viewModel.services) lookup[service.serviceId] = service.name;
    return lookup;
  }, [viewModel]);

  const waitHistory = useWaitHistory(viewModel?.totals.averageWaitMinutes ?? null);
  const etaImprovement = useEtaImprovement(viewModel?.totals.averageWaitMinutes ?? null);

  useEffect(() => {
    if (etaImprovement === null) return;
    toasts.push(
      "highlight",
      "Your wait just got shorter!",
      `${formatWaitMinutes(etaImprovement.fromMinutes)} → ${formatWaitMinutes(etaImprovement.toMinutes)} min, facility-wide.`,
    );
    // toasts.push is referentially stable; only a genuinely new improvement should fire this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etaImprovement]);

  const avatarMood = deriveAvatarMood({
    actionError: recommendation.actionError ?? interventions.applyError,
    generating: recommendation.generating,
    hasActiveRecommendation: recommendation.active !== null,
    justApproved: recommendation.justApproved,
    justApplied: interventions.justApplied,
    criticalNow: viewModel !== null && viewModel.criticalNow !== null,
  });

  // Now/Forecast toggle direction, so the Twin slides rather than jump-cuts.
  const prevModeRef = useRef<TwinMode>(mode);
  const [slideDirection, setSlideDirection] = useState<"forward" | "back">("forward");
  if (prevModeRef.current !== mode) {
    setSlideDirection(mode === "forecast" ? "forward" : "back");
    prevModeRef.current = mode;
  }

  const featuredService = viewModel === null ? undefined : pickFeaturedService(viewModel);
  const drilledService =
    viewModel === null ? undefined : findControlNode(viewModel, drilledServiceId);
  const totalCounters = Object.keys(counterNames).length;
  const activeCounters =
    viewModel === null
      ? 0
      : viewModel.services.reduce((sum, node) => sum + node.now.activeCounters, 0);

  return (
    <main className="fp-control fp-control-canvas">
      <ToastStack toasts={toasts.toasts} onDismiss={toasts.dismiss} />

      <div className="fp-control-sheet">
        <header className="fp-control-header">
          <div className="fp-control-header-left">
            <FlowPilotAvatar mood={avatarMood} />
            <div>
              <h1 className="fp-title">FlowPilot Control</h1>
              <p className="fp-subtitle">Facility operations · MHSSCE Student Services</p>
            </div>
          </div>
          <div className="fp-control-header-right">
            <RefreshButton onRefresh={refresh} />
            <DemoControls controls={demo} />
            <ConnectionBadge connection={connection} />
          </div>
        </header>

        {error !== null ? (
          <div className="fp-error" role="alert">
            {error}
          </div>
        ) : null}

        {viewModel === null ? (
          <p className="fp-empty">Loading the facility…</p>
        ) : (
          <>
            <FacilityTotals
              totals={viewModel.totals}
              healthBreakdown={viewModel.healthBreakdown}
              totalCounters={totalCounters}
              activeCounters={activeCounters}
            />

            <TimeReturnedCard
              minutes={interventions.ledger.cumulativeMinutesReturned}
              realisedCount={interventions.ledger.realisedCount}
              pulse={interventions.justApplied}
            />

            {etaImprovement !== null ? <EtaImprovementBadge improvement={etaImprovement} /> : null}

            <LiveQueuePanel
              featured={featuredService}
              nowServingTokenNumber={
                featuredService === undefined ? null : nowServing[featuredService.serviceId] ?? null
              }
              totalCounters={totalCounters}
              healthBreakdown={viewModel.healthBreakdown}
              waitHistory={waitHistory}
              onDrillIn={setDrilledServiceId}
            />

            <div className="fp-control-body">
              <section className="fp-twin" aria-label="Facility flow graph and digital twin">
                <div className="fp-twin-head">
                  <div>
                    <h2 className="fp-twin-title">Facility Flow Graph</h2>
                    <p className="fp-twin-caption">
                      {mode === "now"
                        ? "Current state"
                        : `Predicted state · ${viewModel.horizonMinutes} min ahead`}
                    </p>
                  </div>

                  <div className="fp-toggle" role="group" aria-label="Twin mode">
                    <button
                      type="button"
                      className="fp-toggle-option"
                      data-active={mode === "now" ? "true" : undefined}
                      aria-pressed={mode === "now"}
                      onClick={() => setMode("now")}
                    >
                      Now
                    </button>
                    <button
                      type="button"
                      className="fp-toggle-option"
                      data-active={mode === "forecast" ? "true" : undefined}
                      aria-pressed={mode === "forecast"}
                      onClick={() => setMode("forecast")}
                    >
                      +{viewModel.horizonMinutes} min
                    </button>
                  </div>
                </div>

                {mode === "forecast" ? (
                  <p className="fp-forecast-banner">
                    <span className="fp-predicted-tag">Predicted</span> These are
                    forecast values from the simulation, not the present.
                  </p>
                ) : null}

                <div className="fp-twin-canvas" key={mode} data-direction={slideDirection}>
                  <FlowGraph viewModel={viewModel} mode={mode} />
                </div>

                {viewModel.totals.simulatedWaiting > 0 ? (
                  <p className="fp-simulated-banner">
                    {viewModel.totals.simulatedWaiting} of the{" "}
                    {viewModel.totals.visitorsWaiting} Visitors waiting are{" "}
                    <strong>simulated</strong> by Simulate Rush.
                  </p>
                ) : null}
              </section>

              <aside className="fp-side">
                <CriticalCallout viewModel={viewModel} mode={mode} />
                <RecommendationCard
                  recommendation={recommendation.active}
                  noRecommendation={recommendation.noRecommendation}
                  staffNames={staffNames}
                  counterNames={counterNames}
                  serviceNames={serviceNames}
                  pendingAction={recommendation.pendingAction}
                  actionError={recommendation.actionError}
                  onApprove={recommendation.approve}
                  onReject={recommendation.reject}
                />
                <InterventionApplyCard
                  intervention={interventions.ledger.awaitingApply}
                  staffNames={staffNames}
                  counterNames={counterNames}
                  serviceNames={serviceNames}
                  applying={interventions.applying}
                  applyError={interventions.applyError}
                  justApplied={interventions.justApplied}
                  onApply={interventions.apply}
                />
              </aside>
            </div>

            <InterventionTimeline
              entries={interventions.timeline}
              error={interventions.readError}
            />

            <ServiceStatusGrid services={viewModel.services} onDrillIn={setDrilledServiceId} />

            {drilledService !== undefined ? (
              <ServiceQueueDetail
                service={drilledService}
                nowServingTokenNumber={nowServing[drilledService.serviceId] ?? null}
                horizonMinutes={viewModel.horizonMinutes}
                onClose={() => setDrilledServiceId(null)}
              />
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
