# Frontend v2 conventions

> **CURRENT SOURCE OF TRUTH — safe for build agents.** Read `docs/DESIGN_SYSTEM.md` first; this file
> says how v2 implements it.

## Foundations (already in place)

| Concern | Where | Rule |
|---------|-------|------|
| Tokens | `packages/ui-tokens/tokens.json` → `pnpm tokens:build` → `apps/web/src/styles/tokens.css`, `tailwind-theme.css` | Never hard-code colours, radii, shadows or fonts. Use CSS variables (`var(--surface)`) or Tailwind utilities (`bg-surface`, `text-text-muted`, `border-border`). CI runs `pnpm tokens:check`. |
| Themes | `data-theme="light" \| "dark"` on `<html>` (`app/theme.ts`) | Every view must look right in both. Check both before you finish. |
| Shell, navigation, guards | `app/shell/AppShell.tsx`, `app/nav.ts`, `app/router.tsx` | Routes and roles are declared once in `nav.ts`. Pages render inside `<main>`; don't add another app chrome. |
| Session and roles | `app/session.ts` (`useSession`, `useCan`, `ENGINEER_ROLES`, `ALARM_ACTION_ROLES`) | Hide actions the role can't do; the API enforces access as well. |
| API | `api/v2.ts` (typed fetchers), `api/queries.ts` (TanStack hooks and `qk` keys) | Add endpoints here; don't call `fetch` directly from components. |
| Live runtime | `app/store/runtime.ts`, fed by the shell's single WebSocket | Read with selectors (`useRuntimeStore((s) => s.activeAlarms)`). |
| Primitives | `components/ui/primitives.tsx` | `Button`, `IconButton`, `Tooltip`, `StatusBadge`, `PriorityGlyph`, `PageHeader`, `Panel`, `EmptyState`, `Kbd`, `Mono`, `SegmentedControl`, `ErrorNotice`. Style classes live in `styles/ui.css` (`pl-*`, `pl-table`, `pl-input`, `pl-menu`, `pl-dialog`, `pl-field`). |
| Equipment symbols | `components/symbols` (`EquipmentSymbol`, `symbolForAssetType`, `symbolForComponentType`, `sensorLetters`) | Every 2D surface draws equipment through this API. Don't draw one-off equipment icons. |
| Menus, dialogs, tooltips, tabs, popovers | `@radix-ui/react-*` (installed) | Use `pl-menu` / `pl-dialog` styling. |
| Charts | `uplot` (installed) | Trends. Follow the dataviz rules: legible axes and units, alarm limits drawn as reference lines. |
| Graph layout | `elkjs` (installed) | Causal graph and auto-layout. |
| Canvas editor | `@xyflow/react` 12 | Studio. |
| 3D | `three`, `@react-three/fiber`, `@react-three/drei` | Lazy route only (R8). |

**No new npm dependencies.** Installing them is blocked in this workspace and would conflict
across branches. If one is truly required, stop and explain why in your report.

## ISA-101 rules that apply to every view

- **Grey by default.** Colour appears only for abnormal state.
- **Status is always colour + shape + text** (`StatusBadge`, `PriorityGlyph`).
- **Critical never blinks.** Nothing pulses faster than the design-system timings, and motion
  respects reduced-motion settings.
- **Raw alarms are never hidden.** Say "5 raw alarms grouped", never "suppressed".
- **Errors explain the fix.** Render API errors with `ErrorNotice`, which shows `message` and `fix`.
- **Values** use `Mono` (tabular figures) and always carry units.
- **Keyboard:** every action is reachable, focus is visible (`:focus-visible`), and the ARIA roles
  are correct.

## Page layout

```tsx
<div className="pl-page">                      {/* or pl-page pl-page--full for canvases */}
  <PageHeader title="Alarms" description="…" actions={…} meta={…} />
  <Panel title="Active">…</Panel>
</div>
```

Feature CSS goes in the feature folder (for example `features/trends/trends.css`, imported by the
page). Use `pl-` or feature-prefixed class names. Don't edit `styles/runtime.css`; it is legacy and
will be removed.

## Tests

Vitest and Testing Library, next to the code (`*.test.tsx`). Every page needs:
- a render test;
- a test of role-gated actions;
- tests for the pure logic (rules, reducers, layout helpers).

Keep `pnpm --filter @plantlens/web typecheck`, `test` and `build` green.
