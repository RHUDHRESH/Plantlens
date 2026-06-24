/**
 * Authoring canvas (Domain R). Drop asset -> plant.json; drag position ->
 * plant_layout.json; draw arrow -> unapproved edge in graph.json (engineer gate).
 */
export function Canvas() {
  return (
    <div style={{ padding: 16, fontFamily: "ui-sans-serif, system-ui" }}>
      <h1>PlantLens Studio</h1>
      <p style={{ color: "#666", maxWidth: 520 }}>
        Drag-and-drop authoring over the canonical model files. Scaffold shell —
        wire @dnd-kit canvas + React Flow DAG builder here.
      </p>
    </div>
  );
}
