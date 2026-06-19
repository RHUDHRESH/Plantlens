/** Mirror of packages/contracts/audit.schema.json */

import type { ActorRole, ActorType } from "./common";

export interface AuditRecord {
  audit_id: string;
  /** RFC3339 UTC */
  ts: string;
  actor_type: ActorType;
  action: string;
  entity_type: string;
  hash_prev: string;
  hash_self: string;
  actor_id?: string | null;
  actor_role?: ActorRole | null;
  entity_id?: string | null;
  plant_id?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
  request_id?: string | null;
  session_id?: string | null;
  source_ip?: string | null;
}