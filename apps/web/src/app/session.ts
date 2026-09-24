/**
 * Session: who is signed in and with which role. The role drives navigation, route guards and
 * which actions render; the API re-checks every permission server-side (never trust the UI).
 *
 * Dev/bench builds obtain a token from /internal/auth-test/dev-token. Production uses OIDC; the
 * store API stays the same (setToken with the IdP token and decoded role).
 */
import { create } from "zustand";
import { issueDevToken } from "../api/client";
import { setAuthToken } from "../api/config";

export type Role = "viewer" | "operator" | "maintenance" | "engineer" | "admin";

export const ROLE_LABEL: Record<Role, string> = {
  viewer: "Viewer",
  operator: "Operator",
  maintenance: "Maintenance",
  engineer: "Engineer",
  admin: "Administrator",
};

/** Roles that may act on alarms (ack/shelve). Mirrors apps/api HUMAN_APPROVER_ROLES. */
export const ALARM_ACTION_ROLES: readonly Role[] = ["operator", "maintenance", "engineer", "admin"];
/** Roles that may author and approve plant-model changes. Mirrors ENGINEER_WRITE_ROLES. */
export const ENGINEER_ROLES: readonly Role[] = ["engineer", "admin"];

const ROLE_STORAGE_KEY = "plantlens.role";

function readStoredRole(): Role {
  try {
    const stored = localStorage.getItem(ROLE_STORAGE_KEY);
    if (stored && stored in ROLE_LABEL) return stored as Role;
  } catch {
    /* storage unavailable */
  }
  return "operator";
}

interface SessionState {
  role: Role;
  subject: string;
  status: "signed_out" | "signing_in" | "ready" | "error";
  error: string | null;
  signIn: (role?: Role) => Promise<void>;
  can: (roles: readonly Role[]) => boolean;
}

export const useSession = create<SessionState>((set, get) => ({
  role: readStoredRole(),
  subject: "",
  status: "signed_out",
  error: null,
  async signIn(role) {
    const next = role ?? get().role;
    set({ status: "signing_in", error: null });
    try {
      const token = await issueDevToken(next);
      setAuthToken(token);
      try {
        localStorage.setItem(ROLE_STORAGE_KEY, next);
      } catch {
        /* storage unavailable */
      }
      set({ role: next, subject: `${next}-local`, status: "ready" });
    } catch (err) {
      set({ status: "error", error: err instanceof Error ? err.message : "Sign-in failed" });
    }
  },
  can(roles) {
    return roles.includes(get().role);
  },
}));

export function useCan(roles: readonly Role[]): boolean {
  return useSession((s) => roles.includes(s.role));
}
