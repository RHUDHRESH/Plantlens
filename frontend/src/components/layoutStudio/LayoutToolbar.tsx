import { useStore } from "../../store/useStore";
import type { LayoutMode } from "./layoutStudioTypes";
import { IconButton } from "../ui/IconButton";

const MODES: { id: LayoutMode; label: string }[] = [
  { id: "select", label: "Select" },
  { id: "place", label: "Place" },
  { id: "connect", label: "Connect" },
  { id: "pan", label: "Pan" },
];

export function LayoutToolbar() {
  const { layoutMode, setLayoutMode } = useStore();

  return (
    <div className="pl-layout-toolbar" role="toolbar" aria-label="Canvas tools">
      {MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          className={[
            "pl-layout-toolbar__mode",
            layoutMode === mode.id ? "pl-layout-toolbar__mode--active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={() => setLayoutMode(mode.id)}
          aria-pressed={layoutMode === mode.id}
        >
          {mode.label}
        </button>
      ))}
      <span className="pl-layout-toolbar__sep" aria-hidden="true" />
      <IconButton label="Fit canvas (scaffold)" disabled title="Fit — scaffold">
        <FitIcon />
      </IconButton>
      <IconButton label="Zoom in (scaffold)" disabled title="Zoom in — scaffold">
        <ZoomInIcon />
      </IconButton>
      <IconButton label="Zoom out (scaffold)" disabled title="Zoom out — scaffold">
        <ZoomOutIcon />
      </IconButton>
    </div>
  );
}

function FitIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M2 5V2h3M11 2h3v3M14 11v3h-3M5 14H2v-3" stroke="currentColor" strokeWidth="1.2" fill="none" />
    </svg>
  );
}

function ZoomInIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M7 3v8M3 7h8" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function ZoomOutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M3 7h8" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}