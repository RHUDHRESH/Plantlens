import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronsLeft, ChevronsRight, Monitor, Moon, Sun, UserRound } from "lucide-react";
import { Suspense, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { connectRuntimeSocket } from "../../api/ws";
import { useActiveRevision, useChanges } from "../../api/queries";
import { EmptyState, IconButton, StatusBadge, TooltipProvider, priorityToStatus } from "../../components/ui/primitives";
import type { StatusKind } from "../../components/ui/primitives";
import { NAV, WORKSPACE_LABEL, navFor, rolesForPath } from "../nav";
import type { Workspace } from "../nav";
import { ROLE_LABEL, useSession } from "../session";
import type { Role } from "../session";
import { useRuntimeStore } from "../store/runtime";
import { useTheme } from "../theme";
import type { ThemePreference } from "../theme";

const NAV_KEY = "plantlens.nav";

function BrandMark() {
  // Lens over a single-line diagram node: quiet, monochrome, reads at 24 px.
  return (
    <svg className="pl-brand__mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.3 15.3 20.5 20.5" strokeLinecap="round" />
      <path d="M6.5 10.5h2.2l1.2-2.4 1.6 4.8 1.2-2.4h1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function usePlantHealth(): { status: StatusKind; label: string } {
  const assetStatus = useRuntimeStore((s) => s.assetStatus);
  const alarms = useRuntimeStore((s) => s.activeAlarms);
  return useMemo(() => {
    const statuses = Object.values(assetStatus);
    if (alarms.some((a) => priorityToStatus(a.priority, a.severity) === "critical") || statuses.includes("critical")) {
      return { status: "critical", label: "Critical" };
    }
    if (alarms.length || statuses.includes("warning")) return { status: "high", label: "Abnormal" };
    if (statuses.includes("sensor_bad")) return { status: "sensor_bad", label: "Sensor fault" };
    if (!statuses.length) return { status: "offline", label: "No data" };
    return { status: "normal", label: "Normal" };
  }, [assetStatus, alarms]);
}

function ConnectionChip() {
  const connection = useRuntimeStore((s) => s.connection);
  const map: Record<string, { cls: string; label: string }> = {
    live: { cls: "pl-dot--live", label: "Live" },
    stale: { cls: "pl-dot--stale", label: "Stale" },
    connecting: { cls: "pl-dot--stale", label: "Connecting" },
    disconnected: { cls: "pl-dot--down", label: "Offline" },
  };
  const state = map[connection] ?? map.disconnected!;
  return (
    <span className="pl-chip" title="Runtime WebSocket">
      <span className={`pl-dot ${state.cls}`} aria-hidden />
      <strong>{state.label}</strong>
    </span>
  );
}

function RevisionChip() {
  const { data } = useActiveRevision();
  const rev = data?.runtime.bundle_rev;
  return (
    <span className="pl-chip" title={data?.runtime.bundle_hash ?? "Authored files"}>
      Bundle <strong>{rev ? `r${rev}` : "files"}</strong>
    </span>
  );
}

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <span className="pl-mono" style={{ color: "var(--text-muted)", fontSize: 12 }} aria-label="Local time">
      {now.toLocaleTimeString([], { hour12: false })}
    </span>
  );
}

function ThemeMenu() {
  const { preference, setPreference } = useTheme();
  const icon = preference === "dark" ? <Moon /> : preference === "light" ? <Sun /> : <Monitor />;
  const options: { value: ThemePreference; label: string; icon: ReactNode }[] = [
    { value: "system", label: "Match system", icon: <Monitor /> },
    { value: "light", label: "Light", icon: <Sun /> },
    { value: "dark", label: "Control room (dark)", icon: <Moon /> },
  ];
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton label="Theme" icon={icon} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="pl-menu" align="end" sideOffset={6}>
          <DropdownMenu.Label className="pl-menu__label">Theme</DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={preference} onValueChange={(v) => setPreference(v as ThemePreference)}>
            {options.map((o) => (
              <DropdownMenu.RadioItem key={o.value} value={o.value} className="pl-menu__item">
                {o.icon}
                {o.label}
                <DropdownMenu.ItemIndicator style={{ marginLeft: "auto" }}>
                  <Check />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function RoleMenu() {
  const role = useSession((s) => s.role);
  const signIn = useSession((s) => s.signIn);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className="pl-chip" style={{ cursor: "pointer" }} aria-label="Switch role">
          <UserRound width={14} height={14} aria-hidden />
          <strong>{ROLE_LABEL[role]}</strong>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="pl-menu" align="end" sideOffset={6}>
          <DropdownMenu.Label className="pl-menu__label">Signed-in role (bench)</DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={role} onValueChange={(v) => void signIn(v as Role)}>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
              <DropdownMenu.RadioItem key={r} value={r} className="pl-menu__item">
                {ROLE_LABEL[r]}
                <DropdownMenu.ItemIndicator style={{ marginLeft: "auto" }}>
                  <Check />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function useNavBadges(): Record<string, { count: number; critical: boolean }> {
  const alarms = useRuntimeStore((s) => s.activeAlarms);
  const role = useSession((s) => s.role);
  const pending = useChanges("pending");
  const canReview = role === "engineer" || role === "admin";
  const unacked = alarms.filter((a) => !a.acked);
  return {
    "/ops/alarms": {
      count: unacked.length,
      critical: unacked.some((a) => priorityToStatus(a.priority, a.severity) === "critical"),
    },
    "/eng/approvals": { count: canReview ? (pending.data?.changes.length ?? 0) : 0, critical: false },
  };
}

function Nav({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  const role = useSession((s) => s.role);
  const items = navFor(role);
  const badges = useNavBadges();
  const groups = (["operate", "engineer", "admin"] as Workspace[])
    .map((ws) => ({ ws, items: items.filter((i) => i.workspace === ws) }))
    .filter((g) => g.items.length);
  return (
    <nav className="pl-nav" aria-label="Primary">
      {groups.map((group) => (
        <div key={group.ws} role="group" aria-label={WORKSPACE_LABEL[group.ws]}>
          <div className="pl-nav__section">{WORKSPACE_LABEL[group.ws]}</div>
          {group.items.map((item) => {
            const Icon = item.icon;
            const badge = badges[item.path];
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/ops"}
                className="pl-nav__item"
                title={expanded ? undefined : item.label}
              >
                <Icon aria-hidden />
                <span className="pl-nav__label">{item.label}</span>
                {badge && badge.count > 0 ? (
                  <span className={`pl-nav__badge${badge.critical ? " pl-nav__badge--critical" : ""}`}>
                    {badge.count > 99 ? "99+" : badge.count}
                  </span>
                ) : null}
              </NavLink>
            );
          })}
        </div>
      ))}
      <div className="pl-nav__foot">
        <button type="button" className="pl-nav__item" onClick={onToggle} aria-expanded={expanded} style={{ border: 0, background: "transparent", cursor: "pointer" }}>
          {expanded ? <ChevronsLeft aria-hidden /> : <ChevronsRight aria-hidden />}
          <span className="pl-nav__label">Collapse</span>
        </button>
      </div>
    </nav>
  );
}

function Breadcrumb() {
  const { pathname } = useLocation();
  const item = [...NAV].sort((a, b) => b.path.length - a.path.length).find((i) => pathname.startsWith(i.path));
  if (!item) return null;
  return (
    <div className="pl-topbar__crumb">
      <span>{WORKSPACE_LABEL[item.workspace]}</span>
      <span aria-hidden>/</span>
      <strong>{item.label}</strong>
    </div>
  );
}

/** Keeps the session signed in and the runtime socket connected for every page. */
function useRuntimeWiring() {
  const status = useSession((s) => s.status);
  const signIn = useSession((s) => s.signIn);
  useEffect(() => {
    if (status === "signed_out") void signIn();
  }, [status, signIn]);
  useEffect(() => {
    if (status !== "ready") return;
    const handle = connectRuntimeSocket();
    return () => handle.close();
  }, [status]);
}

export function AppShell() {
  useRuntimeWiring();
  const health = usePlantHealth();
  const [expanded, setExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(NAV_KEY) !== "collapsed";
    } catch {
      return true;
    }
  });
  const toggle = () => {
    setExpanded((v) => {
      try {
        localStorage.setItem(NAV_KEY, v ? "collapsed" : "expanded");
      } catch {
        /* storage unavailable */
      }
      return !v;
    });
  };

  return (
    <TooltipProvider>
      <div className="pl-shell" data-nav={expanded ? "expanded" : "collapsed"}>
        <header className="pl-topbar">
          <div className="pl-brand">
            <BrandMark />
            <span className="pl-brand__name">PlantLens</span>
          </div>
          <Breadcrumb />
          <div className="pl-topbar__spacer" />
          <div className="pl-topbar__group">
            <StatusBadge status={health.status} label={`Plant ${health.label}`} />
            <ConnectionChip />
            <RevisionChip />
          </div>
          <span className="pl-topbar__divider" aria-hidden />
          <div className="pl-topbar__group">
            <Clock />
            <ThemeMenu />
            <RoleMenu />
          </div>
        </header>
        <Nav expanded={expanded} onToggle={toggle} />
        <main className="pl-main" id="main">
          <RequireRole>
            <Suspense fallback={<EmptyState title="Loading view…" />}>
              <Outlet />
            </Suspense>
          </RequireRole>
        </main>
      </div>
    </TooltipProvider>
  );
}

/** Route guard driven by the same NAV config as the menu. The API enforces access too. */
export function RequireRole({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const role = useSession((s) => s.role);
  const status = useSession((s) => s.status);
  const error = useSession((s) => s.error);
  if (status === "error") {
    return (
      <div className="pl-page">
        <EmptyState title="Could not sign in to the PlantLens API">
          {error}. Start the API (uvicorn app.main:app) and reload.
        </EmptyState>
      </div>
    );
  }
  if (status !== "ready") return <EmptyState title="Signing in…" />;
  const allowed = rolesForPath(pathname);
  if (!allowed.includes(role)) {
    return (
      <div className="pl-page">
        <EmptyState title={`${ROLE_LABEL[role]} role cannot open this view`}>
          This workspace needs one of: {allowed.map((r) => ROLE_LABEL[r]).join(", ")}. Switch role from the
          top-right menu or ask an administrator.
        </EmptyState>
      </div>
    );
  }
  return <>{children}</>;
}
