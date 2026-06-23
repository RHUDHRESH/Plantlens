import { lazy, Suspense } from "react";
import type { ReactNode } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { RuntimeHMI } from "../features/plant-runtime/RuntimeHMI";

const HmiPreviewPage = lazy(() =>
  import("../features/hmi-preview/HmiPreviewPage").then((m) => ({ default: m.HmiPreviewPage })),
);
const StudioFormShell = lazy(() =>
  import("../features/studio-forms/StudioFormShell").then((m) => ({ default: m.StudioFormShell })),
);
const AssemblyStudioPage = lazy(() =>
  import("../features/studio-graph/AssemblyStudioPage").then((m) => ({
    default: m.AssemblyStudioPage,
  })),
);
const ComponentLibraryPage = lazy(() =>
  import("../features/studio-graph/ComponentLibraryPage").then((m) => ({
    default: m.ComponentLibraryPage,
  })),
);

function RouteFallback() {
  return (
    <div className="pl-empty-state" role="status">
      Loading PlantLens view...
    </div>
  );
}

function DeferredRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

export const router = createBrowserRouter([
  { path: "/", element: <RuntimeHMI /> },
  {
    path: "/hmi",
    element: (
      <DeferredRoute>
        <HmiPreviewPage />
      </DeferredRoute>
    ),
  },
  {
    path: "/studio",
    element: (
      <DeferredRoute>
        <StudioFormShell route={{ surface: "asset", targetId: null, mode: "inspect" }} />
      </DeferredRoute>
    ),
  },
  {
    path: "/studio/assembly",
    element: (
      <DeferredRoute>
        <AssemblyStudioPage />
      </DeferredRoute>
    ),
  },
  {
    path: "/studio/library",
    element: (
      <DeferredRoute>
        <ComponentLibraryPage />
      </DeferredRoute>
    ),
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
