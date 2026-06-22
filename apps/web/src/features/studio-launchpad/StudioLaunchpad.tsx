import { CompilePreviewShell } from "./CompilePreviewShell";
import type { StudioRouteState, StudioSurface } from "./studioTypes";

interface StudioLaunchpadProps {
  open: boolean;
  route: StudioRouteState;
  onClose: () => void;
}

const NAV_ITEMS: Array<{ surface: StudioSurface; label: string }> = [
  { surface: "overview", label: "Overview" },
  { surface: "asset", label: "Assets" },
  { surface: "tag", label: "Tags" },
  { surface: "alarm_rule", label: "Alarm Rules" },
  { surface: "causal_edge", label: "Causal Graph" },
  { surface: "action", label: "Actions" },
  { surface: "role_view", label: "Role Views" },
  { surface: "compile_preview", label: "Compile Preview" },
];

const SURFACE_LABELS: Record<StudioSurface, string> = {
  overview: "Overview",
  asset: "Assets",
  tag: "Tags",
  alarm_rule: "Alarm Rules",
  causal_edge: "Causal Graph",
  action: "Actions",
  role_view: "Role Views",
  compile_preview: "Compile Preview",
};

function StudioMainPanel({ route }: { route: StudioRouteState }) {
  if (route.surface === "overview") {
    return (
      <div className="studio-launchpad__main">
        <h3>Source of truth rules</h3>
        <ul>
          <li>Authored contracts are canonical — plant, tag map, alarm rules, causal graph, action envelope.</li>
          <li>Forms are the editing surface; graph and HMI are projections.</li>
          <li>Compiled HMI and runtime snapshots are outputs — never hand-edited in the live HMI.</li>
          <li>Studio drafts require human approval before any backend apply.</li>
          <li>PlantLens is read-only advisory at runtime — no direct hardware control.</li>
        </ul>
      </div>
    );
  }

  if (route.surface === "compile_preview") {
    return (
      <div className="studio-launchpad__main">
        <CompilePreviewShell />
      </div>
    );
  }

  return (
    <div className="studio-launchpad__main">
      <h3>{SURFACE_LABELS[route.surface]}</h3>
      {route.targetId ? (
        <p>
          Target: <span className="data-number">{route.targetId}</span>
          {route.mode === "edit_intent" ? " · edit intent" : " · inspect"}
        </p>
      ) : (
        <p>Select a lineage reference to open a specific target.</p>
      )}
      <p className="studio-launchpad__draft-note">
        Draft surface not wired yet — coming in next Studio prompt.
      </p>
    </div>
  );
}

export function StudioLaunchpad({ open, route, onClose }: StudioLaunchpadProps) {
  if (!open) return null;

  return (
    <div className="studio-launchpad" role="dialog" aria-label="PlantLens Studio">
      <header className="studio-launchpad__header">
        <h2>PlantLens Studio</h2>
        <button type="button" className="pl-btn pl-btn--ghost pl-btn--compact" onClick={onClose}>
          Close
        </button>
      </header>

      <div className="studio-launchpad__banner" role="status">
        Draft authoring surface — no live runtime mutation.
      </div>

      <div className="studio-launchpad__panel">
        <nav className="studio-launchpad__nav" aria-label="Studio surfaces">
          <ul>
            {NAV_ITEMS.map((item) => (
              <li key={item.surface}>
                <span
                  className={
                    route.surface === item.surface
                      ? "studio-launchpad__nav-item studio-launchpad__nav-item--active"
                      : "studio-launchpad__nav-item"
                  }
                  aria-current={route.surface === item.surface ? "page" : undefined}
                >
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
        </nav>
        <StudioMainPanel route={route} />
      </div>
    </div>
  );
}