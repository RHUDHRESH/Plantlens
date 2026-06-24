import { Badge } from "../ui/Badge";

interface GraphStateBadgeProps {
  label: string;
  variant?: "success" | "readonly" | "info" | "normal";
}

export function GraphStateBadge({
  label,
  variant = "readonly",
}: GraphStateBadgeProps) {
  return <Badge variant={variant}>{label}</Badge>;
}