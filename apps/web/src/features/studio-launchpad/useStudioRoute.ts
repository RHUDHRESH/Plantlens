import { useCallback, useState } from "react";
import type { StudioOpenIntent } from "../source-lineage";
import type { SourceEditTargetKind } from "../source-lineage/sourceLineageTypes";
import type { StudioRouteState, StudioSurface } from "./studioTypes";

const KIND_TO_SURFACE: Record<SourceEditTargetKind, StudioSurface> = {
  asset: "asset",
  tag: "tag",
  alarm_rule: "alarm_rule",
  causal_edge: "causal_edge",
  action: "action",
  role_view: "role_view",
  compiled_hmi_node: "asset",
};

const DEFAULT_ROUTE: StudioRouteState = {
  surface: "overview",
  targetId: null,
  mode: "inspect",
};

function surfaceFromIntent(intent: StudioOpenIntent): StudioSurface {
  return KIND_TO_SURFACE[intent.targetKind] ?? "overview";
}

export function useStudioRoute() {
  const [open, setOpen] = useState(false);
  const [route, setRoute] = useState<StudioRouteState>(DEFAULT_ROUTE);

  const openStudio = useCallback((intent: StudioOpenIntent) => {
    setRoute({
      surface: surfaceFromIntent(intent),
      targetId: intent.targetId,
      mode: intent.mode,
    });
    setOpen(true);
  }, []);

  const openOverview = useCallback(() => {
    setRoute(DEFAULT_ROUTE);
    setOpen(true);
  }, []);

  const closeStudio = useCallback(() => {
    setOpen(false);
  }, []);

  const setSurface = useCallback(
    (surface: StudioSurface, targetId: string | null = null, mode: "inspect" | "edit_intent" = "inspect") => {
      setRoute({ surface, targetId, mode });
      setOpen(true);
    },
    [],
  );

  return {
    open,
    route,
    openStudio,
    openOverview,
    closeStudio,
    setSurface,
  };
}