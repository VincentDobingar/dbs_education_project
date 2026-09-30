import { useEffect, type ReactNode } from "react";

export interface ToastProps {
  message: ReactNode;
  variant?: "success" | "error";
  onDismiss: () => void;
  /** Auto-dismiss delay; pass 0 to disable and require the close button. */
  durationMs?: number;
  dismissLabel?: string;
}

const VARIANT_CLASSES: Record<NonNullable<ToastProps["variant"]>, string> = {
  success: "bg-teal-600 text-white",
  error: "bg-red-600 text-white",
};

/**
 * No page had transient success/error feedback before this (audit design/sécu
 * 2026-09-22) — mutations either invalidated the list silently or, on error, gave
 * no visible feedback at all. Deliberately not a global provider/queue: each page
 * owns one `useState<ToastState | null>` and renders this when it's set.
 */
export function Toast({
  message,
  variant = "success",
  onDismiss,
  durationMs = 4000,
  dismissLabel = "Close",
}: ToastProps): ReactNode {
  useEffect(() => {
    if (durationMs <= 0) return;
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [onDismiss, durationMs]);

  return (
    <div
      role="status"
      className={`fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-md px-4 py-3 text-sm shadow-lg ${VARIANT_CLASSES[variant]}`}
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={dismissLabel}
        className="text-white/80 hover:text-white"
      >
        ×
      </button>
    </div>
  );
}
