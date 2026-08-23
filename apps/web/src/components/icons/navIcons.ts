import {
  Alert02Icon,
  Analytics,
  Computer,
  CubeIcon,
  Flash,
  Grid,
  Layers,
  MapsLocation01Icon,
  Monitor,
  MoreVertical,
  PencilEdit01Icon,
  Plug,
  Search01Icon,
  Shield01Icon,
  Tools,
  Wifi01Icon,
} from "@hugeicons/core-free-icons";

/** Shell / chrome icon map — Hugeicons free set. */
export const navIcons = {
  monitor: Monitor,
  diagnose: Search01Icon,
  studio: PencilEdit01Icon,
  incidents: Alert02Icon,
  connection: Plug,
  more: MoreVertical,
  atlas: MapsLocation01Icon,
  twin: CubeIcon,
  act: Shield01Icon,
  search: Search01Icon,
  agents: Analytics,
  computer: Computer,
  grid: Grid,
  layers: Layers,
  wifi: Wifi01Icon,
  flash: Flash,
  tools: Tools,
} as const;

export type NavIconKey = keyof typeof navIcons;
