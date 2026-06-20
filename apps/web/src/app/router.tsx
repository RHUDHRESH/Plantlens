import { createBrowserRouter, Navigate } from "react-router-dom";
import { HmiPreviewPage } from "../features/hmi-preview/HmiPreviewPage";
import { RuntimeHMI } from "../features/plant-runtime/RuntimeHMI";
import { StudioFormShell } from "../features/studio-forms/StudioFormShell";

export const router = createBrowserRouter([
  { path: "/", element: <RuntimeHMI /> },
  { path: "/hmi", element: <HmiPreviewPage /> },
  { path: "/studio", element: <StudioFormShell /> },
  { path: "*", element: <Navigate to="/" replace /> },
]);