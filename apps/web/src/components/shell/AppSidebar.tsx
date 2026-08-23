import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "../ui/sidebar";
import { PlIcon } from "../icons/PlIcon";
import { navIcons } from "../icons/navIcons";

export type AppScreen =
  | "monitor"
  | "diagnose"
  | "incidents"
  | "atlas"
  | "connection"
  | "twin"
  | "actions";

interface AppSidebarProps {
  screen: AppScreen;
  alarmCount: number;
  hasActiveEvent: boolean;
  onNav: (screen: AppScreen) => void;
  onOpenStudio: () => void;
  onOpenIncidents?: () => void;
  studioOpen?: boolean;
}

export function AppSidebar({
  screen,
  alarmCount,
  hasActiveEvent,
  onNav,
  onOpenStudio,
  onOpenIncidents,
  studioOpen = false,
}: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" aria-label="App navigation">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip="PlantLens"
              className="pointer-events-none"
              aria-label="PlantLens"
            >
              <span className="flex size-8 items-center justify-center rounded-md bg-accent text-inverse">
                <PlIcon icon={navIcons.flash} size={16} color="currentColor" />
              </span>
              <span className="font-semibold tracking-wide">PlantLens</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operate</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={screen === "monitor"}
                  tooltip="Monitor"
                  onClick={() => onNav("monitor")}
                  aria-label="MONITOR"
                  aria-current={screen === "monitor" ? "page" : undefined}
                >
                  <PlIcon icon={navIcons.monitor} />
                  <span>Monitor</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={screen === "diagnose"}
                  tooltip="Diagnose"
                  onClick={() => onNav("diagnose")}
                  aria-label="DIAGNOSE"
                  aria-current={screen === "diagnose" ? "page" : undefined}
                >
                  <PlIcon icon={navIcons.diagnose} />
                  <span>Diagnose</span>
                </SidebarMenuButton>
                {alarmCount > 0 ? (
                  <SidebarMenuBadge aria-label={`${alarmCount} active alarms`}>
                    {alarmCount > 9 ? "9+" : alarmCount}
                  </SidebarMenuBadge>
                ) : null}
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={screen === "incidents"}
                  tooltip="Incidents"
                  onClick={() => {
                    if (onOpenIncidents) onOpenIncidents();
                    else onNav("incidents");
                  }}
                  aria-label="Incidents"
                  aria-current={screen === "incidents" ? "page" : undefined}
                >
                  <PlIcon icon={navIcons.incidents} />
                  <span>Incidents</span>
                </SidebarMenuButton>
                {hasActiveEvent ? (
                  <SidebarMenuBadge
                    className="bg-warning/15 text-warning"
                    aria-label="Active incident or situation"
                  >
                    ●
                  </SidebarMenuBadge>
                ) : null}
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={screen === "connection"}
                  tooltip="Connection"
                  onClick={() => onNav("connection")}
                  aria-label="Connection"
                  aria-current={screen === "connection" ? "page" : undefined}
                >
                  <PlIcon icon={navIcons.connection} />
                  <span>Connection</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Author</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={studioOpen}
                  tooltip="Studio"
                  onClick={onOpenStudio}
                  aria-label="Studio"
                  aria-pressed={studioOpen}
                >
                  <PlIcon icon={navIcons.studio} />
                  <span>Studio</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Engineer</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={screen === "atlas"}
                  tooltip="Atlas"
                  onClick={() => onNav("atlas")}
                  aria-label="Atlas"
                  aria-current={screen === "atlas" ? "page" : undefined}
                >
                  <PlIcon icon={navIcons.atlas} />
                  <span>Atlas</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={screen === "twin"}
                  tooltip="Twin"
                  onClick={() => onNav("twin")}
                  aria-label="Twin"
                  aria-current={screen === "twin" ? "page" : undefined}
                >
                  <PlIcon icon={navIcons.twin} />
                  <span>Twin</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={screen === "actions"}
                  tooltip="Act"
                  onClick={() => onNav("actions")}
                  aria-label="Act"
                  aria-current={screen === "actions" ? "page" : undefined}
                >
                  <PlIcon icon={navIcons.act} />
                  <span>Act</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}

/** @deprecated Use AppSidebar — re-export for gradual migration */
export { AppSidebar as AppIconRail };
