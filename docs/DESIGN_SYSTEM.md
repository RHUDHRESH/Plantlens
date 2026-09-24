# PlantLens Design System

> **CURRENT SOURCE OF TRUTH — safe for build agents.**

The brief: **calm, industrial, Scandinavian-minimal, second-to-none.** Operators do not need
dribbble candy; they need legibility, focus, and trust. If you want it to feel expensive, the
secret is restraint, not decoration. Reference feel: IKEA configurator + Google Maps zoom +
Linear/Notion cleanliness + high-performance control-room seriousness.

The single hardest rule: **this is a High-Performance HMI (ISA-101).** Mostly grey. Color is
reserved for abnormal conditions. A screen full of color is a screen where nothing stands out.

## Design tokens (v2 — generated, never hand-copied)

`packages/ui-tokens/tokens.json` is the **only** source. Running `pnpm tokens:build` generates:
- `apps/web/src/styles/tokens.css`, the runtime CSS variables for both themes;
- `apps/web/src/styles/tailwind-theme.css`, the Tailwind utilities (`bg-surface`,
  `text-text-muted`, `border-border`, …) mapped onto those variables.

CI runs `pnpm tokens:check` and fails if the generated files are stale. How to use them is in
`docs/FRONTEND_V2.md`.

**Themes** (`data-theme` on `<html>`):
- **light:** for engineering and Studio work.
- **dark (control room):** low-luminance neutrals for 24/7 operation. Status colours are re-tuned
  so they keep their contrast.

**Neutrals.** A warm-neutral grey ramp (`--neutral-0…900`) carries about 90 % of the UI:
`--canvas`, `--surface`, `--surface-sunken`, `--border`, `--text`, `--text-muted`.

**Accent.** `--accent` is for interaction only: selection, focus and primary buttons. It never
signals status.

**Status.** This is the only place saturated colour is allowed, and it is always paired with a
shape and text:

| Priority / state | Token | Shape | Label |
|------------------|-------|-------|-------|
| P1 critical | `--status-critical` | ▲ triangle | CRITICAL |
| P2 high | `--status-high` | ◆ diamond | HIGH |
| P3 medium | `--status-medium` | ■ square | MEDIUM |
| P4 low | `--status-low` | ● circle | LOW |
| Sensor bad (instrument fault) | `--status-sensor-bad` (purple) | hatched square | SENSOR BAD |
| Offline | `--status-offline` | dashed ring | OFFLINE |
| Shelved | `--status-shelved` | three bars | SHELVED |

Each status also has a `-tint` fill. The `PriorityGlyph` and `StatusBadge` components are the
reference implementation.

**Media (Studio only).** Muted colours paired with dash patterns so no medium relies on colour
alone: `--medium-dc-power`, `-ac-power`, `-mechanical`, `-fluid`, `-air`, `-signal`, `-data`,
`-thermal`, each with a matching `--medium-*-dash`.

**Equipment.** `--equipment-stroke`, `--equipment-fill`, `--equipment-fill-running`. Running
equipment is filled and stopped equipment is outlined; state is never shown by colour.

**Type.** Inter Variable for UI and JetBrains Mono for tabular values, bundled locally with no
runtime font CDN. The scale runs display, h1, h2, h3, body (13/20), caption, micro.

**Radius, space, motion, z-index and layout** are all tokens as well.

## Status rules (never rely on color alone — WCAG + control-room safety)
Every status is conveyed by **color + text + icon + shape**, never color alone:
| Status | Border | Fill | Glow | Badge/text |
|--------|--------|------|------|-----------|
| normal | quiet | white | none | none |
| warning | amber | pale amber | soft slow halo (2.2s) | "WARNING" |
| critical | red | pale red | steady halo (1.4s) — **not blinking** | "CRITICAL" |
| sensor_bad | purple | pale purple | none | "SENSOR BAD" badge |
| offline | grey | grey | none | greyed out, "OFFLINE" |

## Motion (durations — calm, not TikTok)
```
node status change      180ms
Calm Card open          220ms slide/fade
evidence items          80ms stagger
panel slide             240ms
causal path highlight   300ms
3D camera focus         400ms
compile drawer          240ms slide-up
```
- Honor `useReducedMotion()` globally (motion lib hook).
- **Do not animate:** critical alarm text, rapidly-changing raw values, whole-layout reflows,
  tables. Animate only what improves cognition (state transitions, enters/exits, focus).
- Critical = steady red border, never blinking (blinking destroys situational awareness).

## Copywriting (operators don't need poetry)
- Bad: "High probability cascading motor branch anomaly inferred."
- Good: "Motor current rose first. The bus sag came after. Check motor load first."
- Validation errors must explain the fix:
  - Bad: `422 validation failed edge target error`
  - Good: `Inverter output must connect to a motor or load. Fix: connect INV-101 → MOTOR-301.`
- Suppression language: say "5 raw alarms grouped — view raw alarms", **never** "5 alarms
  suppressed/hidden". Glass-box with receipts is the whole point.

## Layout grammar (runtime HMI)
```
┌──────────────────────────────────────────────────────────────┐
│ Top strip: plant health · mode · data source · time · role   │
├──────────────────────────────────┬───────────────────────────┤
│                                  │ Active Situation          │
│         2D plant map (hero)      │ Calm Card (decision layer)│
│                                  │ Action envelope           │
├──────────────────────────────────┴───────────────────────────┤
│ Raw alarm strip / timeline (always available, never hidden)  │
└──────────────────────────────────────────────────────────────┘
```
Visual priority order: Situation title → root asset → first signal → evidence chain → best check
→ blocked actions → raw alarms. Do not give everything equal weight.

## Iconography
- **UI chrome:** Lucide (tree-shaken inline SVG, TS types, a11y attrs).
- **Process/electrical symbols:** a dedicated SVG symbol library in `apps/web/src/assets/icons/`
  and `packages/icons/` — breakers, feeders, motors, busbars, inverters, sensors, HMIs. Do NOT
  abuse Lucide for these.

## Accessibility
- Target WCAG 2.2 AA for Studio + audit views; as much as practical for runtime HMI.
- Semantic HTML first, ARIA only where native semantics are insufficient ("no ARIA is better
  than bad ARIA"). SVG maps get `role="img"` + `aria-label`; interactive nodes are buttons.

## Performance budgets (defend these every sprint — they are not vibes)
| Surface | Budget |
|---------|--------|
| Runtime shell critical-path JS+CSS | < 220 KB gzipped |
| Initial route TTI (dev bench laptop) | < 2.0 s |
| WS → alarm-strip paint latency | < 150 ms end-to-end |
| 2D runtime FPS under alarm storm | > 50 fps |
| 3D route chunk (lazy) | < 700 KB gzipped initial |
| React Flow editor load (200-node graph) | < 1.5 s |
| SVG pan/zoom frame budget | < 16 ms |

## 2D vs 3D
- **2D (SVG) is canonical and default.** Crisp at any zoom, accessible DOM, easy hitboxes/export,
  reliable under stress. Coordinates come from `plant.json`, never hardcoded in components.
- **3D (R3F) is a lazy-loaded enhancement.** Schematic, low-poly, quiet lighting. The moment it
  looks like a game, you lose credibility. It reads from the *same* runtime store as 2D.
