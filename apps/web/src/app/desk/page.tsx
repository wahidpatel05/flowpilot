"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveFacility } from "../../hooks/useLiveFacility";
import { useCounterCatalog } from "../../hooks/useCounterCatalog";
import { useActiveCounterTokens } from "../../hooks/useActiveCounterTokens";
import { useIncomingAssignment } from "../../hooks/useIncomingAssignment";
import { ConnectionBadge } from "../../components/ConnectionBadge";
import { CounterPicker } from "../../components/CounterPicker";
import { CounterStatusPanel } from "../../components/CounterStatusPanel";
import { NowServing } from "../../components/NowServing";
import { UpNextList } from "../../components/UpNextList";
import { QueueActions } from "../../components/QueueActions";
import { IncomingAssignmentCard } from "../../components/IncomingAssignmentCard";
import { ActionFeedback, type Feedback } from "../../components/ActionFeedback";
import { findProjectedService } from "../../lib/core";
import { selectWaitingPreview } from "../../lib/deskQueue";
import { destinationServiceId } from "../../lib/interventionTarget";
import {
  acceptIncomingAssignment,
  callToken,
  completeServiceForToken,
  setCounterActive,
  skipToken,
  startServiceForToken,
} from "../../lib/deskActions";

const SELECTED_COUNTER_STORAGE_KEY = "flowpilot-desk-counter-id";
const WAITING_PREVIEW_LIMIT = 5;
const FEEDBACK_DURATION_MS = 4_000;

export default function DeskPage() {
  const { projection, connection, error: facilityError } = useLiveFacility();
  const { counters, error: catalogError } = useCounterCatalog();

  const [selectedCounterId, setSelectedCounterId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const feedbackToken = useRef(0);

  useEffect(() => {
    const stored = window.localStorage.getItem(SELECTED_COUNTER_STORAGE_KEY);
    if (stored !== null) setSelectedCounterId(stored);
  }, []);

  // A Counter picked in a previous session may no longer exist once the
  // catalog loads (a demo reset, or a stale localStorage value on another
  // machine) — clear it rather than leaving the picker showing its disabled
  // placeholder while stale RPC calls still target the missing id.
  useEffect(() => {
    if (selectedCounterId === null || counters.length === 0) return;
    if (counters.some((counter) => counter.id === selectedCounterId)) return;
    setSelectedCounterId(null);
    window.localStorage.removeItem(SELECTED_COUNTER_STORAGE_KEY);
  }, [counters, selectedCounterId]);

  const handleSelectCounter = useCallback((counterId: string) => {
    setSelectedCounterId(counterId);
    window.localStorage.setItem(SELECTED_COUNTER_STORAGE_KEY, counterId);
  }, []);

  const showFeedback = useCallback((type: Feedback["type"], message: string) => {
    const token = ++feedbackToken.current;
    setFeedback({ type, message });
    window.setTimeout(() => {
      if (feedbackToken.current === token) setFeedback(null);
    }, FEEDBACK_DURATION_MS);
  }, []);

  const runAction = useCallback(
    async (action: () => Promise<void>, successMessage: string) => {
      setBusy(true);
      try {
        await action();
        showFeedback("success", successMessage);
      } catch (err) {
        showFeedback(
          "error",
          err instanceof Error ? err.message : "DeQueue: something went wrong.",
        );
      } finally {
        setBusy(false);
      }
    },
    [showFeedback],
  );

  const selectedCounter = counters.find((counter) => counter.id === selectedCounterId) ?? null;
  const selectedCounterState =
    projection?.counters.find((counter) => counter.counterId === selectedCounterId) ?? null;
  const assignedServiceId = selectedCounterState?.serviceId ?? null;
  const assignedService =
    projection !== null && assignedServiceId !== null
      ? findProjectedService(projection, assignedServiceId)
      : undefined;

  const { calledToken, servingToken, error: activeTokensError } =
    useActiveCounterTokens(assignedServiceId);
  const {
    assignment: incomingAssignment,
    error: incomingError,
    refetch: refetchIncomingAssignment,
  } = useIncomingAssignment(selectedCounterId);

  const waitingPreview =
    assignedService !== undefined
      ? selectWaitingPreview(assignedService.queue, WAITING_PREVIEW_LIMIT)
      : [];

  const nextWaitingToken = waitingPreview[0] ?? null;
  const canCallNext = calledToken === null && servingToken === null && nextWaitingToken !== null;
  const canStart = calledToken !== null && servingToken === null;
  const canComplete = servingToken !== null;
  const canSkip = calledToken !== null;

  const destinationId =
    incomingAssignment !== null ? destinationServiceId(incomingAssignment) : undefined;
  const destinationServiceName =
    projection !== null && destinationId !== undefined
      ? (findProjectedService(projection, destinationId)?.serviceName ?? "another Service")
      : "another Service";

  function handleCallNext() {
    if (nextWaitingToken === null) return;
    void runAction(
      () => callToken(nextWaitingToken.tokenId),
      `Called ${nextWaitingToken.tokenNumber}.`,
    );
  }

  function handleStart() {
    if (calledToken === null) return;
    void runAction(
      () => startServiceForToken(calledToken.id),
      `Started serving ${calledToken.tokenNumber}.`,
    );
  }

  function handleComplete() {
    if (servingToken === null) return;
    void runAction(
      () => completeServiceForToken(servingToken.id),
      `Completed ${servingToken.tokenNumber}.`,
    );
  }

  function handleSkip() {
    if (calledToken === null) return;
    void runAction(() => skipToken(calledToken.id), `Skipped ${calledToken.tokenNumber}.`);
  }

  function handleToggleCounter() {
    if (selectedCounterId === null || selectedCounterState === null) return;
    const goingActive = selectedCounterState.status !== "active";
    void runAction(
      () => setCounterActive(selectedCounterId, goingActive),
      goingActive ? "Counter is now active." : "Counter is now inactive.",
    );
  }

  function handleAcceptAssignment() {
    if (incomingAssignment === null) return;
    void runAction(async () => {
      await acceptIncomingAssignment(incomingAssignment);
      refetchIncomingAssignment();
    }, `Accepted — now serving ${destinationServiceName}.`);
  }

  const combinedError = facilityError ?? catalogError ?? activeTokensError ?? incomingError;

  /*
   * A Counter is a physical desk with no Service of its own — the binding
   * lives in counter_assignments and moves (ADR-0001), so this reads the
   * current one off the projection every render rather than caching it.
   */
  const serviceNameForCounter = useCallback(
    (counterId: string): string | null => {
      if (projection === null) return null;
      const boundServiceId = projection.counters.find(
        (counter) => counter.counterId === counterId,
      )?.serviceId;
      if (boundServiceId === undefined) return null;
      return findProjectedService(projection, boundServiceId)?.serviceName ?? null;
    },
    [projection],
  );

  return (
    <div className="fp-canvas">
      <main className="fp-page fp-sheet">
        <div className="fp-header">
          <div>
            <h1 className="fp-title">
              Serve the
              <br />
              next Visitor.
            </h1>
            <p className="fp-subtitle">One Counter at a time.</p>
          </div>
          <ConnectionBadge connection={connection} />
        </div>

        {combinedError !== null ? <div className="fp-error">{combinedError}</div> : null}

        <CounterPicker
          counters={counters}
          selectedCounterId={selectedCounterId}
          onSelect={handleSelectCounter}
          serviceNameForCounter={serviceNameForCounter}
        />

        <ActionFeedback feedback={feedback} />

        {selectedCounterId === null ? (
          <p className="fp-empty">Choose a Counter to begin.</p>
        ) : (
          <div className="fp-desk-layout">
            <div className="fp-desk-main">
              {assignedServiceId === null ? (
                <p className="fp-empty">This Counter has no Service assigned right now.</p>
              ) : (
                <>
                  <NowServing servingToken={servingToken} calledToken={calledToken} />
                  <QueueActions
                    canCallNext={canCallNext}
                    canStart={canStart}
                    canComplete={canComplete}
                    canSkip={canSkip}
                    busy={busy}
                    onCallNext={handleCallNext}
                    onStart={handleStart}
                    onComplete={handleComplete}
                    onSkip={handleSkip}
                  />
                </>
              )}
            </div>

            <aside className="fp-desk-aside">
              <CounterStatusPanel
                counterName={selectedCounter?.name ?? "Counter"}
                status={selectedCounterState?.status ?? "inactive"}
                serviceName={assignedService?.serviceName ?? null}
                busy={busy}
                onToggle={handleToggleCounter}
              />

              {incomingAssignment !== null ? (
                <IncomingAssignmentCard
                  assignment={incomingAssignment}
                  destinationServiceName={destinationServiceName}
                  busy={busy}
                  onAccept={handleAcceptAssignment}
                />
              ) : null}

              {assignedServiceId !== null ? <UpNextList waiting={waitingPreview} /> : null}
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
