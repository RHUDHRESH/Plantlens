import type { StudioDraftBundle } from "./studioDraftTypes";
import actionEnvelopeData from "./demo-data/action_envelope.json";
import alarmRulesData from "./demo-data/alarm_rules.json";
import causalGraphData from "./demo-data/causal_graph.json";
import plantData from "./demo-data/plant.json";
import tagMapData from "./demo-data/tag_map.json";

/** Demo authored bundle from packages/sample-data/demo-microgrid (copied into demo-data for Vite import). */
export function getInitialStudioDraftBundle(): StudioDraftBundle {
  return {
    plant: structuredClone(plantData),
    tag_map: structuredClone(tagMapData),
    alarm_rules: structuredClone(alarmRulesData),
    causal_graph: structuredClone(causalGraphData),
    action_envelope: structuredClone(actionEnvelopeData),
  };
}