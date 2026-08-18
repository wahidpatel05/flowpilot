"use client";

import { useCallback, useRef, useState } from "react";

export type ToastVariant = "success" | "info" | "warning" | "error" | "highlight";

export interface ToastItem {
  id: string;
  variant: ToastVariant;
  title: string;
  message?: string;
  /** TRUE once dismissal has been requested, so the slide-out plays before removal. */
  leaving: boolean;
}

/** How long a toast plays its slide-out animation before it leaves the DOM. */
const EXIT_ANIMATION_MS = 260;

/** How long a toast sits on screen before auto-dismissing, per variant. */
const AUTO_DISMISS_MS: Record<ToastVariant, number> = {
  success: 4500,
  info: 4500,
  warning: 6000,
  error: 7000,
  highlight: 5000,
};

export interface ToastsController {
  toasts: readonly ToastItem[];
  push: (variant: ToastVariant, title: string, message?: string) => void;
  dismiss: (id: string) => void;
}

/**
 * A small, self-contained toast stack for Control's "Notification Animations"
 * (Slide In on arrival, Highlight Pulse for the ETA-improvement variant, Slide
 * Out on dismissal). Every push is tied to a real event — an RPC result, a
 * demo-control run, a wait-time improvement — never decorative.
 */
export function useToasts(): ToastsController {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const clearTimer = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id);
      setToasts((current) => current.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast)));
      const removalTimer = setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, EXIT_ANIMATION_MS);
      timers.current.set(id, removalTimer);
    },
    [clearTimer],
  );

  const push = useCallback(
    (variant: ToastVariant, title: string, message?: string) => {
      const id = `toast-${(nextId.current += 1)}`;
      const toast: ToastItem = { id, variant, title, leaving: false };
      if (message !== undefined) toast.message = message;
      setToasts((current) => [...current, toast]);

      const autoDismiss = setTimeout(() => dismiss(id), AUTO_DISMISS_MS[variant]);
      timers.current.set(id, autoDismiss);
    },
    [dismiss],
  );

  return { toasts, push, dismiss };
}
