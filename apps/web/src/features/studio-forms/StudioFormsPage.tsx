import { MonitorPlay } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/ui/primitives";
import type { StudioSurface } from "../studio-launchpad/studioTypes";
import { StudioFrame } from "../studio-nav/StudioFrame";
import { StudioFormShell } from "./StudioFormShell";
import { selectEntitiesForFamily, selectRoles, surfaceToFamily } from "./studioSelectors";
import { useStudioDraftStore } from "./useStudioDraftStore";
import "./studio-forms.css";

const FORM_SURFACES: { surface: StudioSurface; label: string }[] = [
  { surface: "asset", label: "Assets" },
  { surface: "tag", label: "Tags" },
  { surface: "alarm_rule", label: "Alarm rules" },
  { surface: "causal_edge", label: "Causal edges" },
  { surface: "action", label: "Actions" },
  { surface: "role_view", label: "Role views" },
];

function isFormSurface(value: string | null): value is StudioSurface {
  return FORM_SURFACES.some((f) => f.surface === value);
}

/**
 * Form-based authoring (R4: forms are the source of truth; the canvas, maps and HMI are
 * projections). `?kind=` picks the contract family and `?id=` the entity, so links from other
 * views can open a specific record.
 */
export function StudioFormsPage() {
  const [params, setParams] = useSearchParams();
  const kind = params.get("kind");
  const surface: StudioSurface = isFormSurface(kind) ? kind : "asset";
  const targetId = params.get("id");
  const bundle = useStudioDraftStore((s) => s.bundle);
  const issues = useStudioDraftStore((s) => s.issues);
  const loaded = useStudioDraftStore((s) => s.loaded);
  const loadInitialBundle = useStudioDraftStore((s) => s.loadInitialBundle);

  useEffect(() => {
    if (!loaded) loadInitialBundle();
  }, [loaded, loadInitialBundle]);

  const counts = useMemo(() => {
    const out: Partial<Record<StudioSurface, { total: number; errors: number }>> = {};
    for (const f of FORM_SURFACES) {
      const family = surfaceToFamily(f.surface);
      const total = family ? selectEntitiesForFamily(bundle, family).length : selectRoles(bundle).length;
      const errors = family ? issues.filter((i) => i.family === family && i.severity === "error").length : 0;
      out[f.surface] = { total, errors };
    }
    return out;
  }, [bundle, issues]);

  const pick = (next: StudioSurface) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === "asset") p.delete("kind");
        else p.set("kind", next);
        p.delete("id");
        return p;
      },
      { replace: true },
    );

  return (
    <StudioFrame>
      <div className="pl-page sf-page">
        <PageHeader
          title="Studio forms"
          description="The authored contracts — plant, tags, alarm rules, causal graph and action envelope — are the source of truth. The canvas, maps and HMI are compiled from them."
          actions={
            <Link to="/eng/studio/hmi-preview" className="pl-btn pl-btn--secondary pl-btn--md">
              <span className="pl-btn__icon" aria-hidden>
                <MonitorPlay />
              </span>
              <span>Preview HMI from this draft</span>
            </Link>
          }
        />
        <div className="sf-kinds" role="tablist" aria-label="Contract family">
          {FORM_SURFACES.map((f) => {
            const c = counts[f.surface];
            const active = f.surface === surface;
            return (
              <button
                key={f.surface}
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                className="sf-kinds__tab"
                onClick={() => pick(f.surface)}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                  const i = FORM_SURFACES.findIndex((x) => x.surface === surface);
                  const n = FORM_SURFACES[(i + (e.key === "ArrowRight" ? 1 : FORM_SURFACES.length - 1)) % FORM_SURFACES.length]!;
                  pick(n.surface);
                  requestAnimationFrame(() =>
                    document.querySelector<HTMLButtonElement>(`.sf-kinds__tab[data-surface="${n.surface}"]`)?.focus(),
                  );
                }}
                data-surface={f.surface}
              >
                {f.label}
                <span className="sf-kinds__count">{c?.total ?? 0}</span>
                {c?.errors ? (
                  <span className="sf-kinds__err" title={`${c.errors} error(s)`}>
                    {c.errors}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <div role="tabpanel" aria-label={FORM_SURFACES.find((f) => f.surface === surface)?.label}>
          <StudioFormShell route={{ surface, targetId, mode: targetId ? "edit_intent" : "inspect" }} />
        </div>
      </div>
    </StudioFrame>
  );
}
