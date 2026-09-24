/** Small presentational pieces shared by the engineer/admin workspaces. */
import * as Dialog from "@radix-ui/react-dialog";
import { Bot, Check, Copy, LibraryBig, UserRound, Workflow, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { ChangeSource } from "../../api/v2";
import { Button, IconButton } from "../../components/ui/primitives";

/** Focus the dialog itself on open (not the close button, whose tooltip would pop up). */
export function focusContent(e: Event) {
  e.preventDefault();
  (e.currentTarget as HTMLElement | null)?.focus();
}

const SOURCE: Record<ChangeSource, { label: string; Icon: typeof Bot }> = {
  agent: { label: "Agent draft", Icon: Bot },
  pattern_library: { label: "Pattern library", Icon: LibraryBig },
  studio: { label: "Studio", Icon: Workflow },
  engineer: { label: "Engineer", Icon: UserRound },
};

export function SourceTag({ source, compact }: { source: ChangeSource; compact?: boolean }) {
  const s = SOURCE[source] ?? SOURCE.engineer;
  return (
    <span className="eng-source" title={s.label}>
      <s.Icon aria-hidden />
      {compact ? <span className="eng-sr-only">{s.label}</span> : <span>{s.label}</span>}
    </span>
  );
}

export function RevChip({ rev, active, label }: { rev: number | null | undefined; active?: boolean; label?: string }) {
  return (
    <span className={`eng-rev${active ? " eng-rev--active" : ""}`}>
      {label ? <span className="eng-rev__label">{label}</span> : null}
      <strong className="pl-mono">{rev != null ? `r${rev}` : "—"}</strong>
    </span>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const id = window.setTimeout(() => setDone(false), 1400);
    return () => window.clearTimeout(id);
  }, [done]);
  return (
    <IconButton
      size="sm"
      label={done ? "Copied" : label}
      icon={done ? <Check /> : <Copy />}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => setDone(true), () => setDone(false));
      }}
    />
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  confirmVariant = "primary",
  onConfirm,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  confirmVariant?: "primary" | "danger";
  onConfirm: () => void;
  busy?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="pl-dialog-overlay" />
        <Dialog.Content className="pl-dialog eng-dialog" onOpenAutoFocus={focusContent} tabIndex={-1}>
          <Dialog.Title className="pl-dialog__title">{title}</Dialog.Title>
          {description ? <Dialog.Description className="pl-dialog__desc">{description}</Dialog.Description> : null}
          {children}
          <div className="eng-dialog__actions">
            <Dialog.Close asChild>
              <Button variant="ghost">Cancel</Button>
            </Dialog.Close>
            <Button variant={confirmVariant} onClick={onConfirm} busy={busy ?? false}>
              {confirmLabel}
            </Button>
          </div>
          <Dialog.Close asChild>
            <IconButton className="eng-dialog__close" size="sm" label="Close" icon={<X />} />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export interface ToastMessage {
  id: number;
  title: string;
  body?: ReactNode;
}

/** Polite, non-blinking confirmation toast; auto-dismisses after 8 s (links stay reachable by keyboard). */
export function Toast({ toast, onDismiss }: { toast: ToastMessage | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(onDismiss, 8000);
    return () => window.clearTimeout(id);
  }, [toast, onDismiss]);
  return (
    <div className="eng-toast-region" role="status" aria-live="polite">
      {toast ? (
        <div className="eng-toast" key={toast.id}>
          <Check className="eng-toast__icon" aria-hidden />
          <div className="eng-toast__text">
            <strong>{toast.title}</strong>
            {toast.body ? <div>{toast.body}</div> : null}
          </div>
          <IconButton size="sm" label="Dismiss" icon={<X />} onClick={onDismiss} />
        </div>
      ) : null}
    </div>
  );
}
