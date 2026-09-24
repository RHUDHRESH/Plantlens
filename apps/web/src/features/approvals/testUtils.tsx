/** Test helpers for the engineer/admin workspaces (router + query client + tooltip provider + session). */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Role } from "../../app/session";
import { useSession } from "../../app/session";
import { TooltipProvider } from "../../components/ui/primitives";
import type { ChangeRequest } from "../../api/v2";

export function setRole(role: Role) {
  useSession.setState({ role, status: "ready", subject: `${role}-local`, error: null });
}

export function renderAt(ui: ReactElement, { path = "/", route = "/" }: { path?: string; route?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route path={path} element={ui} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

export function makeChange(overrides: Partial<ChangeRequest> = {}): ChangeRequest {
  return {
    change_id: "c-1",
    plant_id: "demo",
    title: "Mechanical overload on 3-Phase Motor",
    summary: "Instantiated induction_motor.mechanical_overload@1.0.0",
    source: "pattern_library",
    source_ref: "induction_motor.mechanical_overload@1.0.0",
    status: "pending",
    created_by: "j.lindqvist",
    created_by_role: "engineer",
    created_at: "2026-09-24T03:30:05.408824",
    base_rev: 1,
    change_set: {
      title: "Mechanical overload on 3-Phase Motor",
      source: "pattern_library",
      ops: [
        {
          op: "add_edge",
          edge: { id: "PL-MTR-301-INV-102", from: "MTR-301", to: "INV-102", lag_ms: [0, 500], polarity: "+", loop_ok: true, loop_id: "drive_current_limit" },
          rationale: "Drive output current follows motor current",
        },
        { op: "add_alarm_rule", rule: { id: "MTR_301_CURRENT_HIGH", tag: "MOTOR_301_CURRENT", severity: "warning", condition: { op: ">", threshold: 3.4, for_ms: 2000 } } },
      ],
    },
    preview: {
      applies: true,
      error: null,
      diff: [
        {
          doc: "causal_graph",
          collection: "edges",
          id: "PL-MTR-301-INV-102",
          kind: "added",
          after: { id: "PL-MTR-301-INV-102", from: "MTR-301", to: "INV-102", lag_ms: [0, 500], polarity: "+", loop_ok: true, loop_id: "drive_current_limit" },
        },
        {
          doc: "alarm_rules",
          collection: "rules",
          id: "MTR_301_CURRENT_HIGH",
          kind: "added",
          after: { id: "MTR_301_CURRENT_HIGH", tag: "MOTOR_301_CURRENT", severity: "warning", condition: { op: ">", threshold: 3.4, for_ms: 2000 } },
        },
      ],
      validation: { ok: true, schema_errors: [], compile_errors: [], feedback_loops: [], graph_hash: "abc123" },
    },
    reviewed_by: null,
    reviewed_at: null,
    review_comment: null,
    approve_edges: false,
    result_rev: null,
    ...overrides,
  };
}
