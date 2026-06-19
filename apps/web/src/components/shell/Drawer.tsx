import { useEffect, type ReactNode } from "react";

interface DrawerProps {
  title: string;
  subtitle?: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  ariaLabel?: string;
}

export function Drawer({ title, subtitle, open, onClose, children, ariaLabel }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="pl-drawer__backdrop" onClick={onClose} aria-hidden />
      <aside className="pl-drawer" role="dialog" aria-label={ariaLabel ?? title}>
        <div className="pl-drawer__header">
          <div>
            <h2 style={{ margin: 0, fontSize: 16 }}>{title}</h2>
            {subtitle && <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-muted)" }}>{subtitle}</p>}
          </div>
          <button type="button" className="pl-btn pl-btn--ghost pl-btn--compact" onClick={onClose} aria-label="Close drawer">
            Close
          </button>
        </div>
        <div className="pl-drawer__body">{children}</div>
      </aside>
    </>
  );
}