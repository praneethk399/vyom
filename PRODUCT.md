# VYOM — Product Definition

## One line

> An AI-assisted predictive-maintenance and digital-twin platform for UAV
> propulsion systems.

## Primary user

An **aerospace reliability engineer / operator** monitoring the Flygas GAS418S
Turbo-Supercharged Aero Engine (fitted to the DRDO Tapas-BH-201 / Archer
Tactical UAV).

## Mode

**OPERATE.** Not marketing, not a landing page, not SaaS.

## What it does

VYOM runs a real-time digital twin of the engine: live simulated telemetry and
dataset replay write into a rolling ring buffer; a deterministic threshold
layer raises instant `ACTIVE_LIMIT` alerts; a trained on-device model and the
`/api/diagnose` AI pass raise `PREDICTIVE_PRECURSOR` alerts and produce an
`AIDiagnosticReport` (condition, health score, predicted RUL, risk factor,
thermodynamic/mechanical/electrical assessments, root cause, recommended
actions, DRDO compliance). Scenario/FAULT INJECTION drives the same pipeline
through a centralized backend (simulation → alert engine → history → SMS for
WARNING/CRITICAL, 5-minute dedup). Supabase provides email/password auth; the
API gates dataset + diagnose endpoints behind the session.

## Pages

1. **Access** — boot readout + email/password sign-in/register (+ forgot
   password), demo fallback offline.
2. **Command** — the operating interface: engine twin (primary), health +
   AI diagnosis + active alerts rail, horizontal telemetry band, engine
   trends with fault markers, FAULT INJECTION lab / dataset replay.
3. **Sensor & Digital Twin** — ingestion pipeline, live T–s Brayton-cycle
   diagram, data-quality strip.
4. **AI Diagnostics** — the full `AIDiagnosticReport` + probable failure modes.
5. **Predictive Maintenance & Mission Reliability** — component RUL bars vs
   TBO, mission-reliability matrix, mission/fault log.

## Guardrails

- The engine is the anchor; telemetry is evidence; AI is interpretation;
  alerts are decisions.
- Every screen surfaces at least one real schema field (TET, N2 RPM, blade
  stress, entropy points, RUL, health index, …).
- Deterministic layer never blocks on the AI layer.
- UI follows `DESIGN.md`. Preserve Live Sim, Dataset Replay, Engine Viewer,
  telemetry, AI diagnostics, predicted RUL, alerts, Supabase, backend, SMS.