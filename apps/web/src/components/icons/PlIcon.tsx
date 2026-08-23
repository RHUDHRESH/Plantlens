import { HugeiconsIcon } from "@hugeicons/react";
import type { ComponentProps } from "react";

type HugeiconData = ComponentProps<typeof HugeiconsIcon>["icon"];

export interface PlIconProps {
  icon: HugeiconData;
  size?: number;
  strokeWidth?: number;
  className?: string;
  color?: string;
  "aria-hidden"?: boolean | "true" | "false";
}

/** PlantLens chrome icon — Hugeicons with Control Room Craft defaults. */
export function PlIcon({
  icon,
  size = 18,
  strokeWidth = 1.5,
  className,
  color = "currentColor",
  "aria-hidden": ariaHidden = true,
}: PlIconProps) {
  return (
    <HugeiconsIcon
      icon={icon}
      size={size}
      strokeWidth={strokeWidth}
      color={color}
      className={className}
      aria-hidden={ariaHidden}
    />
  );
}
