import { lazy } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "./shell/AppShell";

// Every view is its own chunk; the shell and the Overview load first (runtime budget).
const page = <T extends Record<string, React.ComponentType>>(loader: () => Promise<T>, name: keyof T) =>
  lazy(() => loader().then((m) => ({ default: m[name] as React.ComponentType })));

const OverviewPage = page(() => import("../features/overview/OverviewPage"), "OverviewPage");
const AlarmsPage = page(() => import("../features/alarms/AlarmsPage"), "AlarmsPage");
const TrendsPage = page(() => import("../features/trends/TrendsPage"), "TrendsPage");
const CausalGraphPage = page(() => import("../features/causal-graph/CausalGraphPage"), "CausalGraphPage");
const Plant3DPage = page(() => import("../features/plant3d/Plant3DPage"), "Plant3DPage");
const IncidentsPage = page(() => import("../features/incidents/IncidentsPage"), "IncidentsPage");
const AssemblyStudioPage = page(() => import("../features/studio-graph/AssemblyStudioPage"), "AssemblyStudioPage");
const ComponentLibraryPage = page(
  () => import("../features/studio-graph/ComponentLibraryPage"),
  "ComponentLibraryPage",
);
const StudioFormsPage = page(() => import("../features/studio-forms/StudioFormsPage"), "StudioFormsPage");
const HmiPreviewPage = page(() => import("../features/hmi-preview/HmiPreviewPage"), "HmiPreviewPage");
const PatternLibraryPage = page(() => import("../features/pattern-library/PatternLibraryPage"), "PatternLibraryPage");
const CoveragePage = page(() => import("../features/pattern-library/CoveragePage"), "CoveragePage");
const ApprovalsPage = page(() => import("../features/approvals/ApprovalsPage"), "ApprovalsPage");
const RevisionsPage = page(() => import("../features/revisions/RevisionsPage"), "RevisionsPage");
const AuditPage = page(() => import("../features/audit/AuditPage"), "AuditPage");

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: "/", element: <Navigate to="/ops" replace /> },
      { path: "/ops", element: <OverviewPage /> },
      { path: "/ops/alarms", element: <AlarmsPage /> },
      { path: "/ops/trends", element: <TrendsPage /> },
      { path: "/ops/causal", element: <CausalGraphPage /> },
      { path: "/ops/3d", element: <Plant3DPage /> },
      { path: "/ops/incidents", element: <IncidentsPage /> },
      { path: "/eng/studio", element: <AssemblyStudioPage /> },
      { path: "/eng/studio/components", element: <ComponentLibraryPage /> },
      { path: "/eng/studio/forms", element: <StudioFormsPage /> },
      { path: "/eng/studio/hmi-preview", element: <HmiPreviewPage /> },
      { path: "/eng/library", element: <PatternLibraryPage /> },
      { path: "/eng/library/:patternId", element: <PatternLibraryPage /> },
      { path: "/eng/coverage", element: <CoveragePage /> },
      { path: "/eng/approvals", element: <ApprovalsPage /> },
      { path: "/eng/approvals/:changeId", element: <ApprovalsPage /> },
      { path: "/admin/revisions", element: <RevisionsPage /> },
      { path: "/admin/audit", element: <AuditPage /> },
      // Pre-v2 URLs keep working.
      { path: "/hmi", element: <Navigate to="/eng/studio/hmi-preview" replace /> },
      { path: "/studio", element: <Navigate to="/eng/studio/forms" replace /> },
      { path: "/studio/assembly", element: <Navigate to="/eng/studio" replace /> },
      { path: "/studio/library", element: <Navigate to="/eng/studio/components" replace /> },
      { path: "*", element: <Navigate to="/ops" replace /> },
    ],
  },
]);
