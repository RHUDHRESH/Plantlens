import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { ButtonSize, ButtonVariant } from "../../design/types";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  children: ReactNode;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: "pl-btn--primary",
  secondary: "pl-btn--secondary",
  ghost: "pl-btn--ghost",
  danger: "pl-btn--danger",
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "pl-btn--sm",
  md: "pl-btn--md",
  lg: "pl-btn--lg",
};

export function Button({
  variant = "secondary",
  size = "md",
  fullWidth = false,
  className = "",
  children,
  ...props
}: ButtonProps) {
  const classes = [
    "pl-btn",
    variantClass[variant],
    sizeClass[size],
    fullWidth ? "pl-btn--full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type="button" className={classes} {...props}>
      {children}
    </button>
  );
}