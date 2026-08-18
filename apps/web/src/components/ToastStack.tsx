"use client";

import type { ToastItem, ToastVariant } from "../hooks/useToasts";

const ICON_PATH: Record<ToastVariant, string> = {
  success: "M5 13l4 4L19 7",
  info: "M12 8v5m0 3h.01M12 22a10 10 0 100-20 10 10 0 000 20z",
  warning: "M12 9v4m0 4h.01M10.29 3.86l-8.4 14.56A2 2 0 003.6 21.5h16.8a2 2 0 001.71-3.08l-8.4-14.56a2 2 0 00-3.42 0z",
  error: "M6 18L18 6M6 6l12 12",
  highlight: "M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4L12 2z",
};

/**
 * Control's toast stack. Every variant plays "Slide In" on arrival and "Slide
 * Out" on dismissal (CSS in control.css); `highlight` additionally gets the
 * "Highlight Pulse" treatment reserved for good news landing mid-session (an
 * ETA getting shorter), so it reads differently from a routine confirmation.
 */
export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: readonly ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="fp-toast-stack" role="region" aria-label="Notifications">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="fp-toast"
          data-variant={toast.variant}
          data-leaving={toast.leaving ? "true" : undefined}
          role={toast.variant === "error" ? "alert" : "status"}
        >
          <span className="fp-toast-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={ICON_PATH[toast.variant]} />
            </svg>
          </span>
          <div className="fp-toast-body">
            <p className="fp-toast-title">{toast.title}</p>
            {toast.message !== undefined ? <p className="fp-toast-message">{toast.message}</p> : null}
          </div>
          <button
            type="button"
            className="fp-toast-close"
            aria-label="Dismiss notification"
            onClick={() => onDismiss(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
