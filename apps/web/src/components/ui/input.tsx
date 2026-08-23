import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-9 w-full min-w-0 rounded-md border border-line-strong bg-surface px-3 py-1 text-sm text-ink-900 shadow-e1 transition-[border-color,box-shadow] outline-none",
        "placeholder:text-ink-300",
        "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45",
        "aria-invalid:border-critical aria-invalid:ring-critical/20",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
