/**
 * Shared frame for the Plant Studio pages: one tab strip linking the canvas, the forms (source of
 * truth), the HMI preview (projection) and the component library, so an engineer can move
 * between the projections of the same draft without the main navigation. Routes stay declared in
 * app/router.tsx; these are plain links.
 */
import { Blocks, FileText, MonitorPlay, Workflow } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { cn } from "../../lib/cn";
import "./studio-nav.css";

export const STUDIO_TABS = [
  { to: "/eng/studio", label: "Canvas", icon: Workflow, hint: "Assemble equipment and connections" },
  { to: "/eng/studio/forms", label: "Forms", icon: FileText, hint: "Edit the authored contracts (source of truth)" },
  { to: "/eng/studio/hmi-preview", label: "HMI preview", icon: MonitorPlay, hint: "Compile the draft and preview the operator HMI" },
  { to: "/eng/studio/components", label: "Components", icon: Blocks, hint: "Component templates, ports and media" },
] as const;

export function StudioTabs() {
  return (
    <nav className="sn-tabs" aria-label="Plant Studio views">
      <span className="sn-tabs__title">Plant Studio</span>
      <ul className="sn-tabs__list">
        {STUDIO_TABS.map((t) => {
          const Icon = t.icon;
          return (
            <li key={t.to}>
              <NavLink to={t.to} end className="sn-tabs__tab" title={t.hint}>
                <Icon aria-hidden />
                <span>{t.label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Tab strip + page body. `full` gives the body the whole height (canvas), otherwise it scrolls. */
export function StudioFrame({ children, full = false }: { children: ReactNode; full?: boolean }) {
  return (
    <div className="sn-frame">
      <StudioTabs />
      <div className={cn("sn-frame__body", full && "sn-frame__body--full")}>{children}</div>
    </div>
  );
}
