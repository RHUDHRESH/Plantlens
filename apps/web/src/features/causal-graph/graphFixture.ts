import type { CausalGraphView } from "../../api/v2";

/** Demo microgrid causal graph (shape of /api/runtime/causal-graph) with one feedback loop. */
export const GRAPH_FIXTURE: CausalGraphView = {
  graph_id: "demo_microgrid_rca",
  bundle_rev: 3,
  nodes: [
    { id: "BAT-101", label: "Battery Bank", asset_type: "storage.battery", evidence_tags: ["BAT_101_V"], status: "normal" },
    { id: "BUS-101", label: "DC Bus", asset_type: "distribution.dc_bus", evidence_tags: ["BUS_101_V"], status: "warning" },
    { id: "INV-102", label: "Motor Inverter", asset_type: "drive.inverter", evidence_tags: [], status: "warning" },
    { id: "MTR-301", label: "3-Phase Motor", asset_type: "load.motor_3phase", evidence_tags: ["MOTOR_301_CURRENT"], status: "critical" },
    { id: "PV-101", label: "PV Array", asset_type: "source.solar", evidence_tags: [], status: "normal" },
  ],
  edges: [
    { id: "E3", from: "BAT-101", to: "BUS-101", approved: true, edge_type: "structural_power", lag_ms: [0, 800], polarity: "any", loop_ok: false, loop_id: null, provenance: "engineer_entered" },
    { id: "E4", from: "BUS-101", to: "INV-102", approved: true, edge_type: "structural_power", lag_ms: [0, 500], polarity: "+", loop_ok: true, loop_id: "L_DRIVE", provenance: "engineer_entered" },
    { id: "E5", from: "MTR-301", to: "BUS-101", approved: true, edge_type: "structural_load_effect", lag_ms: [0, 4000], polarity: "-", loop_ok: true, loop_id: "L_DRIVE", provenance: "cause_effect_matrix" },
    { id: "E7", from: "INV-102", to: "MTR-301", approved: true, edge_type: "structural_power", lag_ms: [100, 900], polarity: "+", loop_ok: true, loop_id: "L_DRIVE", provenance: "engineer_entered" },
    { id: "E_UNAPPROVED", from: "PV-101", to: "MTR-301", approved: false, edge_type: "cause_to_effect", lag_ms: [0, 5000], polarity: "any", loop_ok: false, loop_id: null, provenance: "agent_proposed" },
  ],
  feedback_loops: [["BUS-101", "INV-102", "MTR-301"]],
  highlight: { root_asset_id: "MTR-301", traversed_edges: ["E5", "E4"], alarmed_assets: ["BUS-101", "INV-102", "MTR-301"] },
};
