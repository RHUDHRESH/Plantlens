import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  [
    "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5",
    "text-[11px] font-semibold uppercase tracking-[0.04em]",
    "transition-colors",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "border-accent/20 bg-accent-tint text-accent",
        secondary: "border-line bg-surface-sunken text-ink-700",
        outline: "border-line-strong bg-surface text-ink-700",
        warning: "border-warning/25 bg-warning-tint text-warning",
        critical: "border-critical/25 bg-critical-tint text-critical",
        advisory: "border-advisory/25 bg-advisory-tint text-advisory",
        healthy: "border-healthy/25 bg-healthy/10 text-healthy",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
