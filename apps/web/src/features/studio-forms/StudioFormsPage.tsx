import { StudioFormShell } from "./StudioFormShell";

/** Form-based authoring (R4: forms are the source of truth; the graph is a projection). */
export function StudioFormsPage() {
  return <StudioFormShell route={{ surface: "asset", targetId: null, mode: "inspect" }} />;
}
