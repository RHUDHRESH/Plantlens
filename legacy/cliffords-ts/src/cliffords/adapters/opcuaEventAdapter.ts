import type { AdapterContext, AdapterInput, AdapterResult } from "./types.js";
import { mapOpcUaSeverity } from "../normalizers/normalizePriority.js";
import { enforcePayloadDepth } from "./payloadLimits.js";

function opcUaAlarmState(
  active: unknown,
  acked: unknown,
  suppressed: unknown,
  shelving: unknown
): string | null {
  if (suppressed === true) {
    return "SUPPRESSED";
  }
  if (shelving === true || shelving === "Shelved") {
    return "SHELVED";
  }
  if (active === true) {
    return "ACTIVE";
  }
  if (acked === true) {
    return "ACKED";
  }
  return active === false ? "CLEAR" : null;
}

export function parseOpcuaEvent(
  input: AdapterInput,
  context: AdapterContext
): AdapterResult {
  const payload =
    input.payload ??
    JSON.parse(Buffer.from(input.bytes).toString("utf8"));
  enforcePayloadDepth(payload, context.config.max_json_depth);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { records: [] };
  }
  const event = payload as Record<string, unknown>;
  const active = event.ActiveState;
  const acked = event.AckedState;
  const confirmed = event.ConfirmedState;
  const suppressed = event.SuppressedState;
  const shelving = event.ShelvingState ?? event.ShelvedState;
  const state = opcUaAlarmState(active, acked, suppressed, shelving);

  return {
    records: [
      {
        parsed_id: context.ids.next("parsed"),
        artifact_id: input.artifact.artifact_id,
        record_kind: "alarm_event_candidate",
        extracted_at_utc: context.clock.now().toISOString(),
        source_ref: {
          artifact_id: input.artifact.artifact_id,
          json_pointer: ""
        },
        confidence: 0.99,
        fields: {
          timestamp: event.Time ?? null,
          received_at: event.ReceiveTime ?? null,
          source_event_id: event.EventId ?? null,
          source_event_source:
            event.SourceNode ?? event.SourceName ?? null,
          tag_id: event.ConditionName ?? null,
          equipment_id: event.SourceName ?? null,
          priority: mapOpcUaSeverity(
            event.Severity,
            context.config.opcua_severity_ranges
          ),
          state,
          source_quality: event.Quality ?? null,
          process_value: event.Value ?? null,
          engineering_unit: event.Unit ?? null,
          alarm_message: event.Message ?? null,
          zone_id: null,
          source_system: "OPC-UA",
          acked_state: acked ?? null,
          active_state: active ?? null,
          confirmed_state: confirmed ?? null,
          suppressed_state: suppressed ?? null,
          shelving_state: shelving ?? null,
          enabled_state: event.EnabledState ?? null,
          retain: event.Retain ?? null,
          branch_id: event.BranchId ?? null,
          condition_class_id: event.ConditionClassId ?? null,
          condition_class_name: event.ConditionClassName ?? null,
          last_severity: event.LastSeverity ?? null,
          comment: event.Comment ?? null,
          client_user_id: event.ClientUserId ?? null,
          opcua_severity: event.Severity ?? null
        },
        raw_text: JSON.stringify(event)
      }
    ]
  };
}
