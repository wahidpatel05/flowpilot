"use client";

import { useState } from "react";
import { Icon } from "./Icon";

type RefreshPhase = "idle" | "loading" | "success";

/** "Pull to Refresh" / "Loading" / "Success" micro-interactions, on a button a mouse can click. */
export function RefreshButton({ onRefresh }: { onRefresh: () => void }) {
  const [phase, setPhase] = useState<RefreshPhase>("idle");

  function handleClick() {
    if (phase === "loading") return;
    setPhase("loading");
    onRefresh();
    setTimeout(() => setPhase("success"), 550);
    setTimeout(() => setPhase("idle"), 1650);
  }

  return (
    <button
      type="button"
      className="fp-icon-button"
      data-phase={phase}
      onClick={handleClick}
      disabled={phase === "loading"}
      aria-label="Refresh the facility now"
    >
      {phase === "loading" ? (
        <span className="fp-spinner" aria-hidden="true" />
      ) : phase === "success" ? (
        <Icon name="check" className="fp-icon-success" />
      ) : (
        <Icon name="refresh" />
      )}
    </button>
  );
}
