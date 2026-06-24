import type { HTMLAttributes, ReactNode } from "react";
import type { PanelVariant } from "../../design/types";

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  variant?: PanelVariant;
  title?: string;
  subtitle?: string;
  scaffold?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
  children: ReactNode;
}

const variantClass: Record<PanelVariant, string> = {
  dark: "pl-panel--dark",
  light: "pl-panel--light",
  elevated: "pl-panel--elevated",
};

const paddingClass = {
  none: "pl-panel--pad-none",
  sm: "pl-panel--pad-sm",
  md: "pl-panel--pad-md",
  lg: "pl-panel--pad-lg",
};

export function Panel({
  variant = "dark",
  title,
  subtitle,
  scaffold = false,
  padding = "md",
  className = "",
  children,
  ...props
}: PanelProps) {
  const classes = [
    "pl-panel",
    variantClass[variant],
    paddingClass[padding],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} {...props}>
      {(title || subtitle) && (
        <header className="pl-panel__header">
          {title && <h3 className="pl-panel__title">{title}</h3>}
          {subtitle && <p className="pl-panel__subtitle">{subtitle}</p>}
          {scaffold && <span className="pl-scaffold-tag">Scaffold</span>}
        </header>
      )}
      <div className="pl-panel__body">{children}</div>
    </div>
  );
}