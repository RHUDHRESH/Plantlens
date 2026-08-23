# PlantLens Design System

> **Current source of truth.**
> Aligned with [`PRODUCT_VISION.md`](../PRODUCT_VISION.md).

**Design language: Control Room Craft.** Calm industrial HMI with Linear-grade chrome craft.
Reference feel: ISA-101 grey-first · ABB high-performance graphics (light) · Linear sidebar craft.
Not SaaS candy, not dark-mode gaming, not purple dashboards.

The single hardest rule: **this is a High-Performance HMI (ISA-101).** Mostly grey. Color is
reserved for abnormal conditions. A screen full of color is a screen where nothing stands out.

## Design tokens

Source: `packages/ui-tokens/tokens.json` → mirrored in `apps/web/src/styles/tokens.css`.

```
/* Neutrals (90% of pixels) — cool graphite field */
--canvas:        #E8EAED
--surface:       #FAFBFC   /* raised panels */
--surface-raised:#F4F5F7
--surface-sunken:#DEE1E5
--line:          #D5D9DE
--line-strong:   #C0C5CC
--ink-900:       #14171A
--ink-500:       #5A6168
--accent:        #2563EB   /* selection / interactive only */

/* Status — the ONLY place saturated color is allowed */
--status-normal:     #1F8A4C   /* healthy / quiet */
--status-warning:    #C2410C   /* amber-orange */
--status-critical:   #B42318   /* red — steady, never blink */
--status-sensor-bad: #B45309   /* advisory amber — instrument, not process */
--status-offline:    #A6ADB4

--radius-sm: 6px; --radius-md: 8px; --radius-lg: 12px
--font-ui:   "IBM Plex Sans", "Source Sans 3", system-ui, sans-serif
--font-data: "IBM Plex Mono", "JetBrains Mono", ui-monospace, monospace
```

Density modes: `comfortable` (default padding) and `compact` (tighter Monitor for bench PCs).

### Shell sidebar tokens (shadcn Sidebar)

Mapped in `tokens.css` / `@theme` for `SidebarProvider` / `collapsible="icon"`:

```
--sidebar:                      #F4F5F7
--sidebar-foreground:           #14171A
--sidebar-primary:              #2563EB
--sidebar-primary-foreground:   #FFFFFF
--sidebar-accent:               #EAF1FE
--sidebar-accent-foreground:    #1D4FD7
--sidebar-border:               #D5D9DE
--sidebar-ring:                 #2563EB
```

Default operator density: sidebar **collapsed to icons**; expand reveals labels.

## Status rules (never color alone)

Every status uses **color + text + icon + shape**:

| Status | Border | Fill | Glow | Badge |
|--------|--------|------|------|-------|
| normal | quiet | white | none | none |
| warning | amber | pale amber | soft slow halo (2.2s) | WARNING |
| critical | red | pale red | steady halo (1.4s) — **not blinking** | CRITICAL |
| sensor_bad | advisory | pale advisory | none | SENSOR BAD |
| offline | grey | grey | none | OFFLINE |

## Motion (calm, not TikTok)

```
node status change      120–180ms
Calm Card open          200–220ms
evidence items          80ms stagger
panel slide             240ms
causal path highlight   300ms
3D camera focus         400–600ms
```

- Honor `prefers-reduced-motion` / `useReducedMotion()`.
- Do **not** animate critical alarm text, rapidly-changing raw values, or whole-layout reflows.
- Critical = steady red border, never blinking.

## Copywriting

- Bad: "High probability cascading motor branch anomaly inferred."
- Good: "Motor current rose first. The bus sag came after. Check motor load first."
- Say "5 raw alarms grouped — view raw alarms", **never** "suppressed/hidden".

## Layout grammar — Monitor (default home)

Per `PRODUCT_VISION.md`: fault×signal matrix is the **cognition hero**; 2D map is secondary toggle.

```
┌─ TopStrip: health · source · time · role · LLM badge ─────────────┐
├─ Signal rail (live TagFrames + quality) ──────────────────────────┤
├─ Fault×Signal MATRIX (hero) ──────────────┬─ Calm Card + Copilot ─┤
├─ 2D map / causal path (toggle) ───────────┴─ raw alarms drawer ───┤
└─ Sidebar (icon): Monitor · Diagnose · Studio · Incidents · Comms ─┘
```

Visual priority: Situation title → root asset → first signal → evidence → best check →
blocked actions → raw alarms. Matrix cells show match / contradict / missing at a glance.

## Iconography

- **UI chrome (shell / nav):** Hugeicons via `PlIcon` (`strokeWidth={1.5}`, size 18–20).
- **shadcn primitives (dialogs, etc.):** Lucide may remain until migrated.
- **Process/electrical:** SVG symbol library — not Hugeicons for motors/busbars/inverters.

## Accessibility

WCAG 2.2 AA for Studio + audit; as practical for runtime HMI. Semantic HTML first.

## Performance budgets

| Surface | Budget |
|---------|--------|
| Runtime shell critical-path JS+CSS | < 220 KB gzipped |
| Initial route TTI | < 2.0 s |
| WS → alarm-strip paint | < 150 ms |
| 2D FPS under alarm storm | > 50 fps |
| 3D lazy chunk | < 700 KB gzipped |
| React Flow 200-node load | < 1.5 s |

## 2D vs 3D

- **2D is canonical spatial default** (R8). Coordinates from `plant.json`.
- **3D is lazy schematic enhancement** — never game-like; same runtime store.
