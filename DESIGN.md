# VYOM Design System — "Engineering Intelligence"

VYOM is an AI-assisted predictive-maintenance and digital-twin platform for UAV
propulsion systems. The interface must read as a **real engineering
workstation** used by an aerospace reliability engineer at 2 AM — mission
control, engine instrumentation, SCADA, scientific plots. Not a SaaS dashboard.
Not a gaming HUD. Not a startup landing page.

The engine is the visual anchor. Telemetry is evidence. AI analysis is
interpretation. Alerts are operational decisions.

## Design principles

1. **Remove the defaults before adding decoration.** Before any component,
   ask: does it help the engineer decide? communicate engine state? explain
   evidence? improve diagnosis? improve situational awareness? If no — remove it.
2. **The page feels like looking into the engine system, not browsing a site.**
3. **Hierarchy, asymmetry, visual tension.** Unequal columns. Not every section
   a box. Not every metric an equal card.
4. **Color means engine state, never decoration.**

## Typography

- **UI:** a highly legible technical grotesk (Rajdhani display / system grotesk).
- **Values:** a monospace face with tabular numerals for RPM, TET, vibration,
  pressure, fuel flow, timestamps, alert IDs, sensor IDs.
- **Labels:** restrained uppercase eyebrows, wide tracking.
- **Instrumentation numbers carry authority.** Number and unit are separate
  lines or strongly separated — `10,956` then `RPM`, not `10,956 RPM`.
- Monospace is used *selectively*, not for the whole interface.

## Color

| Role      | Dark (base)       | Meaning            |
|-----------|-------------------|--------------------|
| Base      | near-black charcoal `#0b0e11` | canvas          |
| Surface   | deep graphite `#12161b` | panels           |
| Signal    | technical green `#2fbf6a` | healthy / live   |
| Warning   | amber `#e0a83c`    | degraded / investigate |
| Critical  | red `#e04b3c`      | immediate action |
| Text      | warm white `#d8dde0` | body             |
| Muted     | desaturated gray `#7a858c` | labels         |

**Forbidden:** purple, blue gradients, pink, cyan neon, rainbow gradients,
generic AI-glow. Color is never used decoratively.

## Shapes & borders

- Mixture of sharp corners, `2px`, `4px`, occasional `8px` for large surfaces.
- Thin structural borders (1px hairlines).
- Separate information with **rules, spacing, alignment, typography** — not a
  box around everything.
- No excessive rounded corners, no heavy shadows, no glassmorphism.

## Grid / layout

Engineering grid. Unequal columns encouraged:

```
┌───────────────────────────────────────┬───────────────┐
│                                       │ ENGINE HEALTH │
│          ENGINE DIGITAL TWIN          │ AI DIAGNOSIS  │
│   (primary, dominant)                 │ ACTIVE ALERTS │
├───────────────────────────────────────┴───────────────┤
│ N2 RPM  TET  THRUST  OIL  VIB  FUEL                    │
├───────────────────────────────────────────────────────┤
│                   ENGINE TRENDS                        │
└───────────────────────────────────────────────────────┘
```

Not every section equal height. Not a uniform card matrix.

## Telemetry

- **No seven giant circular gauges.** Use a horizontal instrumentation strip:
  label → value → unit on separate lines, a thin divider, and a tiny real
  trend sparkline per value (direction from actual data).
- Each value shows its own trend direction + a status word (STABLE / NOMINAL /
  trend). Use actual trend direction, not decorative.

## AI diagnostics

- Feel like an engineering analyst, not a marketing card.
- Show **ENGINE CONDITION, CONFIDENCE, OBSERVED SIGNATURE, EVIDENCE
  (per-parameter stable/degraded), MODEL (failure + probability)**.
- The AI explains *why*. Never "AI-powered insights", "unlock intelligent
  maintenance", etc.

## Alerts

- Alerts are **incident investigation records**, not decorative toasts.
- Structure: `CRITICAL / VIBRATION LIMIT BREACH`, `GAS418S / SENSOR BSH-04`,
  `2.87 RMS / LIMIT 2.50 RMS`, `DETECTED 23:26:49`, `AI ASSESSMENT`, `ACTION`,
  `SMS DISPATCHED`.

## Fault injection (Scenario Sim)

- Renamed **FAULT INJECTION** / **FAULT INJECTION LAB**. A controlled
  engineering test environment, not a playful scenario selector.
- Faults are numbered technical test conditions (01 TET RUNAWAY …).
- When active: BASELINE → CURRENT → THRESHOLD → RESULT.
- Trend charts show a vertical **event marker** at the injection time, then
  the resulting deviation (fault → sensor → diagnosis → health → alert).

## Motion

- Motion communicates *system* behavior: telemetry change, graph transition,
  engine state change, fault injection, alert appearance, AI update.
- **Forbidden:** floating/bouncing cards, hover bounce, gradient animation,
  decorative particles, constant pulsing, sheen sweeps.
- Respect `prefers-reduced-motion` (drop motion, keep color).

## Data visualization

- Engineering plots: thin lines, subtle grids, clear axes, precise labels,
  **anomaly/event markers** (e.g. `FAULT INJECTED 14:32:08`).

## Navigation

- Compact and functional: `COMMAND / SENSOR TWIN / AI DIAGNOSTICS /
  MAINTENANCE`. Workspace over chrome.

## Anti-patterns (never)

Centered hero · giant centered headings · 3-card feature grids · symmetrical
card grids · purple/blue gradients · AI glow · rounded-card-everywhere ·
heavy shadows · glassmorphism · gradient blobs · "AI-powered" copy · giant
pill buttons · badge spam · decorative icons · stock illustrations · big empty
whitespace · generic-sans-only · cards-in-cards · equal cards for every metric
· every section the same pattern.

## Component rules

- Panels: flat surface + 1px hairline, sharp or `2–4px` corner. Optional
  single accent rule on the left for status.
- Readouts: bordered window, monospace tabular value, unit separate.
- Buttons: flat, bordered, `2px` radius; active state = accent border + soft
  fill; no pill shapes, no glow.
- Status: green/amber/red text + tiny square/diamond glyph, no pulsing.
- Trends: thin 1–1.5px line, gridless or faint grid, event markers on fault.

## Motion tokens

- `ease-out` ~200–300ms for value/state transitions.
- Fault injection: single 300ms pulse on the strip + event marker, not a loop.
- Alert: 1 short vignette/emphasis (respect reduced-motion), then static color.