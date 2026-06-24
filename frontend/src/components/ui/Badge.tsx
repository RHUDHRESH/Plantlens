import type { HTMLAttributes, ReactNode } from "react";
import type { BadgeVariant } from "../../design/types";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
  children: ReactNode;
}

const variantClass: Record<BadgeVariant, string> = {
  default: "pl-badge--default",
  normal: "pl-badge--normal",
  success: "pl-badge--success",
  warning: "pl-badge--warning",
  critical: "pl-badge--critical",
  danger: "pl-badge--danger",
  unknown: "pl-badge--unknown",
  readonly: "pl-badge--readonly",
  info: "pl-badge--info",
};

export function Badge({
  variant = "default",
  dot = false,
  className = "",
  children,
  ...props
}: BadgeProps) {
  const classes = ["pl-badge", variantClass[variant], className].filter(Boolean).join(" ");

  return (
    <span className={classes} {...props}>
      {dot && <span className="pl-badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}