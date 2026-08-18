"use client";

import { useEffect } from "react";

/** A fade-in overlay with a slide-up panel — "Modal / Drawer" from the design system. */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fp-modal-overlay" onClick={onClose}>
      <div
        className="fp-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="fp-modal-head">
          <h3 className="fp-modal-title">{title}</h3>
          <button type="button" className="fp-modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
