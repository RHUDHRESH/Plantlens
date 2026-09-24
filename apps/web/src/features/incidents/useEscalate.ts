import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { escalateIncident } from "../../api/client";
import { useRuntimeStore } from "../../app/store/runtime";

/** Open an incident room from the live situation, carrying its evidence (Calm Card + raw alarms). */
export function useEscalate() {
  const navigate = useNavigate();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { calmCard, activeSituation, activeAlarms } = useRuntimeStore.getState();
      if (!activeSituation) throw Object.assign(new Error("No active situation"), { body: { message: "There is no active situation to escalate.", fix: "Wait for a situation, or open an existing incident." } });
      const grouped = new Set(activeSituation.grouped_alarm_ids);
      return escalateIncident({
        calm_card: (calmCard ?? {}) as unknown as Record<string, unknown>,
        situation: activeSituation as unknown as Record<string, unknown>,
        raw_alarms: activeAlarms.filter((a) => grouped.has(a.alarm_id)),
      });
    },
    onSuccess: (res) => {
      void client.invalidateQueries({ queryKey: ["incidents"] });
      navigate(`/ops/incidents?id=${encodeURIComponent(res.incident.incident_id)}`);
    },
  });
}
