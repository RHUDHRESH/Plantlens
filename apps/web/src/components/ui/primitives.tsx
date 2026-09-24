/**
 * PlantLens UI primitives (v2). Small, token-driven, accessible. Status is ALWAYS conveyed by
 * colour + shape + text (ISA-101 / WCAG): see StatusBadge and PriorityGlyph.
 */
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { forwardRef } from "react";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

// ---- Button ------------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  busy?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, busy, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn("pl-btn", `pl-btn--${variant}`, `pl-btn--${size}`, className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {icon ? <span className="pl-btn__icon" aria-hidden>{icon}</span> : null}
      {children ? <span>{children}</span> : null}
    </button>
  );
});

export const IconButton = forwardRef<HTMLButtonElement, ButtonProps & { label: string }>(function IconButton(
  { label, icon, className, variant = "ghost", size = "md", ...rest },
  ref,
) {
  return (
    <Tooltip content={label}>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        className={cn("pl-icon-btn", `pl-btn--${variant}`, `pl-icon-btn--${size}`, className)}
        {...rest}
      >
        {icon}
      </button>
    </Tooltip>
  );
});

// ---- Tooltip -----------------------------------------------------------------------------

export function Tooltip({ content, children, side = "top" }: { content: ReactNode; children: ReactNode; side?: "top" | "right" | "bottom" | "left" }) {
  return (
    <TooltipPrimitive.Root delayDuration={350}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={6} className="pl-tooltip">
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export const TooltipProvider = TooltipPrimitive.Provider;

// ---- Status & priority -------------------------------------------------------------------

export type StatusKind =
  | "normal"
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "sensor_bad"
  | "offline"
  | "shelved"
  | "acked";

const STATUS_LABEL: Record<StatusKind, string> = {
  normal: "Normal",
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  sensor_bad: "Sensor bad",
  offline: "Offline",
  shelved: "Shelved",
  acked: "Acknowledged",
};

/** Priority 1–4 (ISA-18.2) → status kind. Severity strings from the API map onto the same scale. */
export function priorityToStatus(priority?: number | null, severity?: string | null): StatusKind {
  if (priority === 1 || severity === "critical") return "critical";
  if (priority === 2 || severity === "high") return "high";
  if (priority === 3 || severity === "warning" || severity === "medium") return "medium";
  if (priority === 4 || severity === "info" || severity === "low") return "low";
  return "medium";
}

/** Shape-coded glyph so priority never relies on colour: ▲ P1, ◆ P2, ■ P3, ● P4. */
export function PriorityGlyph({ status, size = 12, title }: { status: StatusKind; size?: number; title?: string }) {
  const s = size;
  const common = { width: s, height: s, viewBox: "0 0 12 12", "aria-hidden": title ? undefined : true, role: title ? "img" : undefined };
  const cls = `pl-glyph pl-glyph--${status}`;
  switch (status) {
    case "critical":
      return <svg {...common} className={cls}>{title ? <title>{title}</title> : null}<path d="M6 1 11 10.5H1Z" /></svg>;
    case "high":
      return <svg {...common} className={cls}>{title ? <title>{title}</title> : null}<path d="M6 .8 11.2 6 6 11.2.8 6Z" /></svg>;
    case "medium":
      return <svg {...common} className={cls}>{title ? <title>{title}</title> : null}<rect x="1.5" y="1.5" width="9" height="9" rx="1" /></svg>;
    case "low":
      return <svg {...common} className={cls}>{title ? <title>{title}</title> : null}<circle cx="6" cy="6" r="4.6" /></svg>;
    case "sensor_bad":
      return <svg {...common} className={cls}>{title ? <title>{title}</title> : null}<path d="M1.5 1.5h9v9h-9Z M3 9 9 3" fill="none" strokeWidth="1.6" /></svg>;
    case "offline":
      return <svg {...common} className={cls}>{title ? <title>{title}</title> : null}<circle cx="6" cy="6" r="4.4" fill="none" strokeWidth="1.6" strokeDasharray="2 1.6" /></svg>;
    case "shelved":
      return <svg {...common} className={cls}>{title ? <title>{title}</title> : null}<path d="M2 3.5h8M2 6h8M2 8.5h8" fill="none" strokeWidth="1.4" /></svg>;
    case "acked":
      return <svg {...common} className={cls}>{title ? <title>{title}</title> : null}<path d="M2.2 6.2 5 9 9.8 3.4" fill="none" strokeWidth="1.8" /></svg>;
    default:
      return <svg {...common} className={cls}>{title ? <title>{title}</title> : null}<circle cx="6" cy="6" r="2.2" /></svg>;
  }
}

export function StatusBadge({ status, label, compact }: { status: StatusKind; label?: string; compact?: boolean }) {
  return (
    <span className={cn("pl-status", `pl-status--${status}`, compact && "pl-status--compact")}>
      <PriorityGlyph status={status} />
      <span>{label ?? STATUS_LABEL[status]}</span>
    </span>
  );
}

// ---- Layout pieces -----------------------------------------------------------------------

export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="pl-page-header">
      <div className="pl-page-header__text">
        <h1 className="pl-page-header__title">{title}</h1>
        {description ? <p className="pl-page-header__desc">{description}</p> : null}
      </div>
      {meta ? <div className="pl-page-header__meta">{meta}</div> : null}
      {actions ? <div className="pl-page-header__actions">{actions}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  actions,
  children,
  className,
  padded = true,
  ...rest
}: HTMLAttributes<HTMLElement> & { title?: ReactNode; actions?: ReactNode; padded?: boolean }) {
  return (
    <section className={cn("pl-panel", className)} {...rest}>
      {title || actions ? (
        <div className="pl-panel__head">
          {title ? <h2 className="pl-panel__title">{title}</h2> : <span />}
          {actions ? <div className="pl-panel__actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn(padded && "pl-panel__body")}>{children}</div>
    </section>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="pl-empty" role="status">
      {icon ? <div className="pl-empty__icon" aria-hidden>{icon}</div> : null}
      <p className="pl-empty__title">{title}</p>
      {children ? <div className="pl-empty__body">{children}</div> : null}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="pl-kbd">{children}</kbd>;
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("pl-mono", className)}>{children}</span>;
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="pl-segmented" role="radiogroup" aria-label={label}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={opt.value === value}
          className={cn("pl-segmented__item", opt.value === value && "is-active")}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** Structured API error {message, fix} rendered the way DESIGN_SYSTEM.md asks (explain the fix). */
export function ErrorNotice({ error }: { error: unknown }) {
  const body = (error as { body?: { message?: string; fix?: string } } | null)?.body;
  const message = body?.message ?? (error instanceof Error ? error.message : "Something went wrong");
  return (
    <div className="pl-error" role="alert">
      <strong>{message}</strong>
      {body?.fix ? <span> Fix: {body.fix}</span> : null}
    </div>
  );
}
