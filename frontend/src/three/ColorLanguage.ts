/**
 * Color-as-language (Domain L / ISA-101). "Gray is good" ~90% neutral baseline;
 * color reserved for abnormal conditions + operator actions. Supplement with
 * shape/position for color-blind accessibility.
 */
export type AssetState = "normal" | "warning" | "critical" | "resolved" | "unknown";

export function colorForState(state: AssetState): string {
  switch (state) {
    case "normal":
      return "#6b7280"; // gray
    case "warning":
      return "#f59e0b"; // amber
    case "critical":
      return "#ef4444"; // red
    case "resolved":
      return "#9ca3af"; // light grey
    case "unknown":
      return "#374151"; // dark grey
  }
}
