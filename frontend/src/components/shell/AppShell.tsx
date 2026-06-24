import type { ReactNode } from "react";
import { useStore } from "../../store/useStore";

interface AppShellProps {
  map: ReactNode;
  topBar: ReactNode;
  leftRail: ReactNode;
  rightPanel: ReactNode;
  bottomSheet: ReactNode;
  mobileNav: ReactNode;
  copilot?: ReactNode;
}

export function AppShell({
  map,
  topBar,
  leftRail,
  rightPanel,
  bottomSheet,
  mobileNav,
  copilot,
}: AppShellProps) {
  const themeMode = useStore((s) => s.themeMode);
  const copilotOpen = useStore((s) => s.copilotOpen);
  const leftRailOpen = useStore((s) => s.leftRailOpen);
  const rightPanelOpen = useStore((s) => s.rightPanelOpen);

  return (
    <div
      className={`pl-shell pl-shell--${themeMode}`}
      data-left-open={leftRailOpen}
      data-right-open={rightPanelOpen}
    >
      <div className="pl-shell__map" role="main" aria-label="Plant map">
        {map}
      </div>

      <div className="pl-shell__top">{topBar}</div>

      <aside
        className="pl-shell__left"
        aria-label="Context rail"
        aria-hidden={!leftRailOpen}
      >
        {leftRail}
      </aside>

      <aside
        className="pl-shell__right"
        aria-label="Inspector panel"
        aria-hidden={!rightPanelOpen}
      >
        {rightPanel}
      </aside>

      <div className="pl-shell__bottom">{bottomSheet}</div>

      <nav className="pl-shell__mobile-nav" aria-label="Mobile navigation">
        {mobileNav}
      </nav>

      {copilotOpen && copilot && (
        <div className="pl-shell__copilot" role="dialog" aria-label="Read-only copilot">
          {copilot}
        </div>
      )}
    </div>
  );
}