import type { RuntimeSnapshot } from "../api/types";

/** Backend-derived hero scenario snapshot — not computed in UI. */
export const HERO_MOTOR_OVERLOAD: RuntimeSnapshot = {
  tags: {},
  active_alarms: [
    {
      alarm_id: "MOTOR_CURRENT_HIGH",
      asset_id: "MTR-301",
      tag_id: "MOTOR_301_CURRENT",
      severity: "critical",
      message: "Motor current high",
      raised_at: "2026-01-01T10:32:14Z",
      acked: false,
    },
    {
      alarm_id: "DC_BUS_LOW",
      asset_id: "BUS-101",
      tag_id: "BUS_101_V",
      severity: "critical",
      message: "DC bus low",
      raised_at: "2026-01-01T10:32:18Z",
      acked: false,
    },
  ],
  active_situations: [
    {
      situation_id: "sit-motor-1",
      situation_type: "MOTOR_MECHANICAL_OVERLOAD",
      title: "Motor mechanical overload",
      severity: "critical",
      root_asset_id: "MTR-301",
      created_at: "2026-01-01T10:32:20Z",
      grouped_alarm_ids: ["MOTOR_CURRENT_HIGH", "MOTOR_SPEED_LOW", "DC_BUS_LOW", "INV_UNDERVOLTAGE", "MOTOR_TEMP_HIGH"],
      evidence: [],
      causal_path: ["MTR-301", "BUS-101", "INV-102"],
      affected_asset_ids: ["BUS-101", "INV-102"],
    },
  ],
  latest_calm_card: {
    card_id: "card-1",
    situation_id: "sit-motor-1",
    title: "Motor mechanical overload",
    severity: "critical",
    root_asset_id: "MTR-301",
    root_asset_name: "3-Phase Motor",
    created_at: "2026-01-01T10:32:20Z",
    evidence_chain: [
      { order: 1, alarm_id: "MOTOR_CURRENT_HIGH", asset_id: "MTR-301", message: "Motor current rose first", timestamp: "2026-01-01T10:32:14Z" },
      { order: 2, alarm_id: "MOTOR_SPEED_LOW", asset_id: "MTR-301", message: "Motor speed dropped", timestamp: "2026-01-01T10:32:16Z" },
      { order: 3, alarm_id: "DC_BUS_LOW", asset_id: "BUS-101", message: "DC bus sagged", timestamp: "2026-01-01T10:32:18Z" },
    ],
    recommended_first_check: {
      action_id: "INSPECT_SHAFT_LOAD",
      label: "Inspect shaft load, coupling, and bearing drag",
      risk_level: "medium",
      requires_isolation: true,
    },
    raw_alarm_count: 5,
    operator_authority: "Operator may inspect; restart requires maintenance.",
    first_signal: {
      alarm_id: "MOTOR_CURRENT_HIGH",
      asset_id: "MTR-301",
      timestamp: "2026-01-01T10:32:14Z",
      message: "Motor current rose first",
    },
    why_it_matters: "The motor branch is pulling the bus down; the bus is not the first suspect.",
    blocked_actions: [
      {
        action_id: "RESTART_INVERTER",
        label: "Restart inverter",
        reason: "Blocked while motor thermal alarm is active",
      },
    ],
  },
  asset_status: {
    "MTR-301": "critical",
    "BUS-101": "warning",
    "INV-102": "warning",
    "PV-101": "normal",
  },
};