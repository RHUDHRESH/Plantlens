# PlantLens Design System

The brief: **calm, industrial, Scandinavian-minimal, second-to-none.** Operators do not need
dribbble candy; they need legibility, focus, and trust. If you want it to feel expensive, the
secret is restraint, not decoration. Reference feel: IKEA configurator + Google Maps zoom +
Linear/Notion cleanliness + ABB control-room seriousness.

The single hardest rule: **this is a High-Performance HMI (ISA-101).** Mostly grey. Color is
reserved for abnormal conditions. A screen full of color is a screen where nothing stands out.

## Design tokens (put these in `apps/web/src/styles/tokens.css` as CSS variables, and
`packages/ui-tokens/tokens.json` as the source)

```
--bg:           #F7F5F0   /* warm paper background (Studio); runtime HMI may go darker */
--surface:      #FFFFFF
--surface-muted:#F1EEE8
--grid:         #E8E2D8
--border:       #DED8CE
--text:         #111111
--text-muted:   #6B6B6B
--accent:       #2563EB   /* selection / interactive only */

/* status — the ONLY place saturated color is allowed */
--status-normal:    #7A8471  /* quiet sage; often rendered as no-glow neutral */
--status-warning:   #C98910  /* amber */
--status-critical:  #B3261E  /* red */
--status-sensor-bad:#6B5DD3  /* purple — instrument fault, distinct from process fault */
--status-offline:   #8A8A8A  /* grey */

--radius:    16px   /* cards */ ;  --radius-dialog: 14px
--font-ui:   "Inter Variable", Inter, system-ui, sans-serif
--font-data: "Inter Variable"   /* tabular-nums + slashed zero for IDs/timestamps/values */
```

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
