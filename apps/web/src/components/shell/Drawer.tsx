import { useEffect, type ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";

interface DrawerProps {
  title: string;
  subtitle?: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  ariaLabel?: string;
}

/** Asset/context drawer — Sheet with focus trap + Escape (Radix). */
export function Drawer({ title, subtitle, open, onClose, children, ariaLabel }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full sm:max-w-[var(--context-panel)] overflow-y-auto"
        aria-label={ariaLabel ?? title}
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {subtitle ? <SheetDescription>{subtitle}</SheetDescription> : null}
        </SheetHeader>
        <div className="mt-4 flex flex-col gap-3">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
