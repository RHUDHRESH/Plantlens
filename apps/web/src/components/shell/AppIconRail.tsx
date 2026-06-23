export type AppScreen = "atlas" | "alarms" | "event" | "twin" | "actions";

interface AppIconRailProps {
  screen: AppScreen;
  alarmCount: number;
  hasActiveEvent: boolean;
  onNav: (screen: AppScreen) => void;
  onOpenStudio: () => void;
  reducedMotion: boolean;
}

export function AppIconRail({
  screen,
  alarmCount,
  hasActiveEvent,
  onNav,
  onOpenStudio,
  reducedMotion,
}: AppIconRailProps) {
  return (
    <aside className="app-icon-rail" aria-label="App navigation">
      <div className="app-icon-rail__logo" aria-label="PlantLens">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" aria-hidden>
          <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
        </svg>
      </div>

      <nav className="app-icon-rail__nav" aria-label="Main navigation">
        <button
          type="button"
          className="app-icon-rail__btn"
          title="Studio"
          onClick={onOpenStudio}
          aria-label="Studio"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
            <path d="M10 6.5h4a3 3 0 0 1 3 3v4" />
          </svg>
          <span className="app-icon-rail__label">STUDIO</span>
        </button>

        <RailBtn id="atlas" label="ATLAS" active={screen === "atlas"} onNav={onNav}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M9 3 3 5v16l6-2 6 2 6-2V3l-6 2-6-2Z" />
            <path d="M9 3v16M15 5v16" />
          </svg>
        </RailBtn>

        <RailBtn id="alarms" label="ALARMS" active={screen === "alarms"} onNav={onNav}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
          {alarmCount > 0 && (
            <span className="app-icon-rail__badge" aria-label={`${alarmCount} active alarms`}>
              {alarmCount > 9 ? "9+" : alarmCount}
            </span>
          )}
        </RailBtn>

        <RailBtn id="event" label="EVENT" active={screen === "event"} onNav={onNav}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M10.3 3.8 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
          {hasActiveEvent && (
            <span
              className={`app-icon-rail__pulse${reducedMotion ? " app-icon-rail__pulse--static" : ""}`}
              aria-hidden
            />
          )}
        </RailBtn>

        <RailBtn id="twin" label="TWIN" active={screen === "twin"} onNav={onNav}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
            <path d="M12 2 3 7v10l9 5 9-5V7l-9-5Z" />
            <path d="m3 7 9 5 9-5M12 12v10" />
          </svg>
        </RailBtn>

        <RailBtn id="actions" label="ACT" active={screen === "actions"} onNav={onNav}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </RailBtn>
      </nav>

      <div className="app-icon-rail__avatar" aria-label="User">RS</div>
    </aside>
  );
}

function RailBtn({
  id,
  label,
  active,
  onNav,
  children,
}: {
  id: AppScreen;
  label: string;
  active: boolean;
  onNav: (s: AppScreen) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`app-icon-rail__btn${active ? " app-icon-rail__btn--active" : ""}`}
      title={label}
      onClick={() => onNav(id)}
      aria-label={label}
      aria-current={active ? "page" : undefined}
    >
      {children}
      <span className="app-icon-rail__label">{label}</span>
    </button>
  );
}
