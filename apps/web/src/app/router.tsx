import { createBrowserRouter, Navigate } from "react-router-dom";
import { HmiPreviewPage } from "../features/hmi-preview/HmiPreviewPage";
import { RuntimeHMI } from "../features/plant-runtime/RuntimeHMI";
import { StudioFormShell } from "../features/studio-forms/StudioFormShell";
import { ComponentLibraryPage } from "../features/studio-graph/ComponentLibraryPage";

export const router = createBrowserRouter([
  { path: "/", element: <RuntimeHMI /> },
  { path: "/hmi", element: <HmiPreviewPage /> },
  { path: "/studio", element: <StudioFormShell /> },
  { path: "/studio/library", element: <ComponentLibraryPage /> },
  { path: "*", element: <Navigate to="/" replace /> },
]);