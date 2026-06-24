import { useEffect, type ReactNode } from "react";
import { useStore } from "../../store/useStore";
import { breakpoints } from "../../design/layout";

interface AppShellProps {
  children: ReactNode;
  top?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  bottom?: ReactNode;
  mobileNav?: ReactNode;
  copilot?: ReactNode;
}

export function AppShell({
  children,
  top,
  left,
  right,
  bottom,
  mobileNav,
  copilot,
}: AppShellProps) {
  const themeMode = useStore((s) => s.themeMode);
  const copilotOpen = useStore((s) => s.copilotOpen);
  const leftRailOpen = useStore((s) => s.leftRailOpen);
  const rightPanelOpen = useStore((s) => s.rightPanelOpen);
  const setLeftRailOpen = useStore((s) => s.setLeftRailOpen);
  const setRightPanelOpen = useStore((s) => s.setRightPanelOpen);

  useEffect(() => {
    const syncRails = () => {
      const mobile = window.innerWidth < breakpoints.lg;
      if (mobile) {
        setLeftRailOpen(false);
        setRightPanelOpen(false);
      } else {
        setLeftRailOpen(true);
        setRightPanelOpen(true);
      }
    };
    syncRails();
    window.addEventListener("resize", syncRails);
    return () => window.removeEventListener("resize", syncRails);
  }, [setLeftRailOpen, setRightPanelOpen]);

  return (
    <div
      className={`pl-shell pl-shell--${themeMode}`}
      data-left-open={leftRailOpen}
      data-right-open={rightPanelOpen}
    >
      <div className="pl-shell__map pl-panel-enter" role="main" aria-label="Plant map">
        {children}
      </div>

      {top && <div className="pl-shell__top">{top}</div>}

      {left && (
        <aside
          className="pl-shell__left pl-panel-enter"
          aria-label="Context rail"
          aria-hidden={!leftRailOpen}
        >
          {left}
        </aside>
      )}

      {right && (
        <aside
          className="pl-shell__right pl-panel-enter"
          aria-label="Inspector panel"
          aria-hidden={!rightPanelOpen}
        >
          {right}
        </aside>
      )}

      {bottom && <div className="pl-shell__bottom pl-slide-up">{bottom}</div>}

      {mobileNav && (
        <nav className="pl-shell__mobile-nav" aria-label="Mobile navigation">
          {mobileNav}
        </nav>
      )}

      {copilotOpen && copilot && (
        <div className="pl-shell__copilot pl-fade-in" role="dialog" aria-label="Read-only copilot">
          {copilot}
        </div>
      )}
    </div>
  );
}