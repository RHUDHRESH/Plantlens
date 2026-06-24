import type { ReactNode } from "react";
import { useStore } from "../../store/useStore";
import type { MobileTab } from "../../design/types";

const TABS: { id: MobileTab; label: string; icon: () => ReactNode }[] = [
  { id: "map", label: "Map", icon: MapIcon },
  { id: "situations", label: "Situations", icon: SituationsIcon },
  { id: "copilot", label: "AI", icon: CopilotIcon },
  { id: "studio", label: "Studio", icon: StudioIcon },
  { id: "more", label: "More", icon: MoreIcon },
];

export function MobileBottomNav() {
  const {
    mobileTab,
    setMobileTab,
    screen,
    situations,
    toggleCopilot,
    setBottomSheetMode,
    toggleLeftRail,
    copilotOpen,
    leftRailOpen,
    goBackToMap,
    goBackToEvidence,
    openEvidenceRoom,
    openAssetStudio,
    openPlantLayoutStudio,
  } = useStore();

  const handleTab = (tab: MobileTab) => {
    setMobileTab(tab);

    switch (tab) {
      case "map":
        if (
          screen === "dag" ||
          screen === "evidence" ||
          screen === "assetStudio" ||
          screen === "plantLayoutStudio"
        ) {
          goBackToMap();
        } else {
          setBottomSheetMode("peek");
        }
        break;
      case "situations":
        if (
          screen === "dag" ||
          screen === "assetStudio" ||
          screen === "plantLayoutStudio"
        ) {
          goBackToEvidence();
        } else if (situations[0]) {
          openEvidenceRoom(situations[0].id);
        } else {
          setBottomSheetMode("expanded");
          if (!leftRailOpen) toggleLeftRail();
        }
        break;
      case "copilot":
        toggleCopilot();
        break;
      case "studio":
        if (screen === "plantLayoutStudio") {
          openPlantLayoutStudio();
        } else if (screen === "assetStudio") {
          openAssetStudio();
        } else {
          openPlantLayoutStudio();
        }
        break;
      case "more":
        toggleLeftRail();
        break;
    }
  };

  return (
    <div className="pl-mobile-nav">
      {TABS.map((tab) => {
        const active =
          tab.id === mobileTab ||
          (tab.id === "copilot" && copilotOpen) ||
          (tab.id === "situations" && screen === "evidence") ||
          (tab.id === "studio" &&
            (screen === "assetStudio" || screen === "plantLayoutStudio")) ||
          (tab.id === "more" && leftRailOpen);

        return (
          <button
            key={tab.id}
            type="button"
            className={`pl-mobile-nav__tab ${active ? "pl-mobile-nav__tab--active" : ""}`}
            onClick={() => handleTab(tab.id)}
            aria-current={active ? "page" : undefined}
          >
            <span className="pl-mobile-nav__icon">{tab.icon()}</span>
            <span className="pl-mobile-nav__label">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function MapIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="currentColor" aria-hidden="true">
      <path d="M2 6l7-3 7 3 4-2v13l-4 2-7-3-7 3-4-2V6zm2 1.2v9.6l5 2.1V9.3L4 7.2zm7 2.1v9.6l5-2.1V7.2l-5 2.1z" />
    </svg>
  );
}

function SituationsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="currentColor" aria-hidden="true">
      <path d="M4 4h14v2H4V4zm0 5h10v2H4V9zm0 5h14v2H4v-2z" />
    </svg>
  );
}

function CopilotIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="currentColor" aria-hidden="true">
      <path d="M11 2a6 6 0 00-6 6v2a6 6 0 0012 0V8a6 6 0 00-6-6zm-8 10a2 2 0 012 2v1h12v-1a2 2 0 012-2v2a4 4 0 01-4 4H7a4 4 0 01-4-4v-2z" />
    </svg>
  );
}

function StudioIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="currentColor" aria-hidden="true">
      <path d="M4 4h6v6H4V4zm8 0h6v6h-6V4zM4 12h6v6H4v-6zm8 3h6v3h-6v-3z" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="currentColor" aria-hidden="true">
      <path d="M5 10.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm6 0a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm6 0a1.5 1.5 0 110 3 1.5 1.5 0 010-3z" />
    </svg>
  );
}