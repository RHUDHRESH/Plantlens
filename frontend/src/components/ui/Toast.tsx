import { useEffect, useState } from "react";
import type { ToastVariant } from "../../design/types";

export interface ToastMessage {
  id: string;
  message: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastProps {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}

const variantClass: Record<ToastVariant, string> = {
  default: "pl-toast--default",
  success: "pl-toast--success",
  warning: "pl-toast--warning",
  error: "pl-toast--error",
};

function ToastItem({ toast, onDismiss }: ToastProps) {
  useEffect(() => {
    const ms = toast.duration ?? 4000;
    const timer = setTimeout(() => onDismiss(toast.id), ms);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  return (
    <div
      className={`pl-toast ${variantClass[toast.variant ?? "default"]}`}
      role="status"
      aria-live="polite"
    >
      <span>{toast.message}</span>
      <button
        type="button"
        className="pl-toast__dismiss"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
}

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="pl-toast-container" aria-label="Notifications">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

let toastCounter = 0;

export function useToasts() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (message: string, variant: ToastVariant = "default", duration?: number) => {
    const id = `toast-${++toastCounter}`;
    setToasts((prev) => [...prev, { id, message, variant, duration }]);
  };

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return { toasts, addToast, dismiss };
}