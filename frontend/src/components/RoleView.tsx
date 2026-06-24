/**
 * RoleView (Domain N) — same plant state, different surface per role.
 * operator / maintenance / supervisor / engineer. Identity for view selection +
 * audit attribution ONLY; never unlocks write capability (there is none).
 */
import { useStore } from "../store/useStore";

export function RoleView() {
  const role = useStore((s) => s.role);
  const setRole = (r: typeof role) => useStore.setState({ role: r });
  const roles = ["operator", "maintenance", "supervisor", "engineer"] as const;
  return (
    <div className="flex gap-2 text-xs">
      {roles.map((r) => (
        <button
          key={r}
          onClick={() => setRole(r)}
          className={`rounded px-2 py-1 ${r === role ? "bg-white/20" : "bg-white/5"}`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}
