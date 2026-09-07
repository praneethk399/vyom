# VYOM — GAS418S AI-Enabled Digital Twin

AI-enabled real-time digital twin for the **Flygas GAS418S Turbo-Supercharged Aero Engine**, fitted to the **DRDO Tapas-BH-201 / Archer Tactical UAV** — Smart India Hackathon 2026, Problem Statement 26054, Team ALPHA Q.

Stack: Vite · React 18 · TypeScript · Tailwind 4 · react-three-fiber / drei / three · recharts · motion · zustand · Express · @google/genai.

## Run

```bash
npm install
npm run dev          # Express API on :3001 + Vite on :5173 (proxies /api)
```

Optional — live Gemini diagnostics (otherwise the server runs deterministic rule-based reports):

```bash
cp .env.example .env   # set GEMINI_API_KEY=
```

Login: any callsign (≥3 chars) with access key **`GAS418S-ALPHA-Q`**.

## Pages

1. **Access** — callsign + access-key login, boot readout, HUD-collapse wipe.
2. **Command Overview** — 3D engine viewer (thermal/stress overlay, clickable subsystem hotspots), gauge strip, alert feed, health/RUL, trend charts, scenario sim (LIVE_SIM) or dataset picker + scrub bar (DATASET_REPLAY).
3. **Sensor & Digital Twin** — ingestion pipeline animation, live T–s Brayton diagram with ideal-cycle reference, data-quality strip.
4. **AI Diagnostics** — structured `AIDiagnosticReport` (healthScore, predictedRulHours, confidence, risk factor, three assessments, root causes, actions, DRDO compliance), ProbableFailureMode cards grouped by subsystem.
5. **Maintenance & Mission Reliability** — ComponentRul countdowns vs nominalTboHours, mission-reliability matrix, mission/fault log swiper.

## How it works

- **LIVE_SIM** runs a client-side procedural generator (10 Hz, deterministic seed) — no server round-trip. **DATASET_REPLAY** steps named FlightDatasets (DRDO Mission 01/02/03) from `/api/datasets/:id` at their sampling rate, scrubbable.
- Every frame is checked against the deterministic threshold table (`src/lib/thresholds.ts`) — instant ACTIVE_LIMIT alerts.
- Every ~4 s the window is POSTed to `/api/diagnose` → Gemini (`responseJsonSchema` = `AIDiagnosticReport`) or rule-based fallback. Failures above the confidence bar raise PREDICTIVE_PRECURSOR alerts. If Gemini errors/rate-limits, the deterministic layer continues and the panel shows "AI analysis unavailable".
- Alert ladder: caution → gauge highlight + toast; warning → panel pulse + toast + `vibrate(200)`; critical → vignette flash + banner + anime.js screen shake + `vibrate([100,50,100,50,200])`. `prefers-reduced-motion` and the Alert Intensity setting (Full / Reduced / Silent) gate motion/haptics; color + toast always remain.
- Mode/fault/replay state is global (zustand) — injecting a fault or scrubbing a replay ripples into all pages.

## Checks

```bash
npm run typecheck   # tsc -b (app + server)
npm test            # vitest — thresholds, ring buffer, fault golden tests
npm run build       # production build
```