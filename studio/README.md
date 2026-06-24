# PlantLens Studio — Low-Code Authoring Canvas

Drag-and-drop authoring over the canonical model files (Domain R). Every drag
mutates a model file (optimistic local edit -> POST -> re-validate -> reload);
the canvas edits **files**, not a hidden DB — keeps authoring diffable and
git-friendly. Visual DAG builder is React Flow over `graph.json`.

## Architecture rules
- Drop asset -> writes `plant.json` instance
- Drag position -> writes `plant_layout.json`
- Draw causal arrow -> appends an **unapproved** edge to `graph.json` (engineer gate)
- Live validation in canvas: acyclic / orphan / coverage warnings
- AI-assisted config (Domain Q authoring mode) proposes edges/params; engineer approves

Run: `pnpm studio`
