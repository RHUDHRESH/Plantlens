import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "dark" | "light" | "elevated";
  padding?: "none" | "sm" | "md" | "lg";
  children: ReactNode;
}

const variantClass = {
  dark: "pl-card--dark",
  light: "pl-card--light",
  elevated: "pl-card--elevated",
};

const paddingClass = {
  none: "pl-card--pad-none",
  sm: "pl-card--pad-sm",
  md: "pl-card--pad-md",
  lg: "pl-card--pad-lg",
};

export function Card({
  variant = "dark",
  padding = "md",
  className = "",
  children,
  ...props
}: CardProps) {
  const classes = ["pl-card", variantClass[variant], paddingClass[padding], className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}