# apps/web/src/components — shared chrome + design-system primitives

Reusable building blocks that are NOT feature-specific. Features compose these.

| Folder | What |
|--------|------|
| `shell/` | AppShell, Sidebar, RoleSwitcher, ConnectionBadge ("LIVE / DATA STALE"), ClockUtc |
| `ui/` | thin wrappers over Radix primitives styled with the tokens: Button, Dialog, Tabs, Tooltip, Card, Badge, Field, Select. (shadcn-style "open code" — copy in, own it.) |

## Rules
- Build `ui/` on Radix primitives (`@radix-ui/react-*`) for accessibility; style with the CSS
  variables in `styles/tokens.css`. Don't pull a heavyweight component library.
- Status components (StatusBadge, StatusDot) MUST encode status as color + text + icon (never color
  alone) — they are used across maps, alarms, and incidents.
- Keep these presentational; no data fetching, no store writes.

CHUNK: 5
