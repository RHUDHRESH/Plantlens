import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "../../components/ui/primitives";
import "./ops.css";

/**
 * Right-hand detail sheet shared by the operate views. Non-modal so the plant stays visible and
 * live behind it; Esc closes, focus moves into the sheet and back to the trigger.
 */
export function SideSheet({
  open,
  onOpenChange,
  title,
  subtitle,
  badge,
  children,
  footer,
  width = 420,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <Dialog.Portal>
        <Dialog.Content
          className="ops-sheet"
          style={{ width: `min(${width}px, calc(100vw - 24px))` }}
          onInteractOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => {
            // Focus the sheet itself (not the close button) so no tooltip pops on open.
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.focus();
          }}
          aria-describedby={undefined}
        >
          <header className="ops-sheet__head">
            <div className="ops-sheet__titles">
              <Dialog.Title className="ops-sheet__title">{title}</Dialog.Title>
              {subtitle ? <div className="ops-sheet__subtitle">{subtitle}</div> : null}
            </div>
            {badge}
            <Dialog.Close asChild>
              <IconButton label="Close details" icon={<X />} size="sm" />
            </Dialog.Close>
          </header>
          <div className="ops-sheet__body">{children}</div>
          {footer ? <footer className="ops-sheet__foot">{footer}</footer> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Label/value definition list used inside sheets and cards. */
export function Facts({ items }: { items: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <dl className="ops-facts">
      {items.map((it, i) => (
        <div key={i} className="ops-facts__row">
          <dt>{it.label}</dt>
          <dd>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SectionLabel({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="ops-section-label">
      <span>{children}</span>
      {aside ? <span className="ops-section-label__aside">{aside}</span> : null}
    </div>
  );
}
