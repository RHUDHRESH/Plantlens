import type { ButtonHTMLAttributes, ReactNode } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: "sm" | "md" | "lg";
  variant?: "ghost" | "solid";
  children: ReactNode;
}

const sizeClass = {
  sm: "pl-icon-btn--sm",
  md: "pl-icon-btn--md",
  lg: "pl-icon-btn--lg",
};

const variantClass = {
  ghost: "pl-icon-btn--ghost",
  solid: "pl-icon-btn--solid",
};

export function IconButton({
  label,
  size = "md",
  variant = "ghost",
  className = "",
  children,
  ...props
}: IconButtonProps) {
  const classes = [
    "pl-icon-btn",
    sizeClass[size],
    variantClass[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type="button" className={classes} aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}