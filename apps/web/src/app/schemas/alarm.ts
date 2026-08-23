/** Mirror of packages/contracts/alarm_rules.schema.json */

import type { AlarmClass, AlarmOp, Severity } from "./common";

export interface AlarmCondition {
  op: AlarmOp;
  threshold?: number;
  warning?: number;
  critical?: number;
  for_ms?: number;
}

export interface AlarmRule {
  id: string;
  tag: string;
  severity: Severity;
  condition: AlarmCondition;
  message: string;
  asset_id?: string;
  alarm_class?: AlarmClass;
  priority?: number;
  deadband?: number;
  delay_ms?: number;
  latching?: boolean;
  requires_ack?: boolean;
  shelvable?: boolean;
  max_shelve_seconds?: number;
  suggested_actions?: string[];
}

export interface AlarmRules {
  version: string;
  rules: AlarmRule[];
}