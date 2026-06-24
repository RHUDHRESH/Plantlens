/**
 * Studio main (Domain R). Drag-and-drop canvas; every drag mutates a model file.
 * Scaffold: placeholder shell. Real impl: @dnd-kit canvas + React Flow DAG builder.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { Canvas } from "./Canvas";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Canvas />
  </React.StrictMode>,
);
