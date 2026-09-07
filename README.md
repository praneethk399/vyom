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

## Backend API

Single Express server (`server/`, port 3001, proxied from Vite as `/api`).

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | liveness |
| `GET /api/telemetry` | current simulated engine state (`engineId, rpm, tet, thrust, oilPressure, vibration, fuelFlow, batteryVoltage, health, predictedRUL, missionStatus, timestamp`) |
| `POST /api/simulation/scenario` | apply a scenario: `nominal \| tet_runaway \| vibration_growth \| oil_pressure_loss \| compressor_surge \| fuel_flow_anomaly \| battery_sag`. Runs the centralized alert engine → history → SMS; returns telemetry + alert |
| `POST /api/alerts` | ingest a standardized alert `{ alertType, severity, engineId, parameter, value, threshold, timestamp, scenario }`; validate → store → SMS (WARNING/CRITICAL only, 5-min duplicate window) |
| `GET /api/alerts` | recent alert history for the dashboard |
| `POST /api/test/critical-alert` | **dev/test only** — forces a `VIBRATION_LIMIT_BREACH` CRITICAL alert through the full pipeline |
| `GET /api/datasets` · `GET /api/datasets/:id` | replay dataset library |
| `POST /api/diagnose` | telemetry window → `AIDiagnosticReport` (Gemini or rule-based) |

### Scenario Sim workflow

Scenario Sim button → `POST /api/simulation/scenario` → backend applies the scenario to its simulated engine → centralized alert engine evaluates it (severity/alertType per scenario) → alert recorded → **WARNING/CRITICAL** sent to Fast2SMS (duplicates for the same engine + alert type suppressed for 5 minutes) → response carries the telemetry snapshot + alert, which the frontend adopts into the existing stores (viewer, gauge strip, health/RUL, mission status, alert feed + SMS status). Scenario classification lives in the backend — the React side only renders its result. The client-side 10 Hz LIVE_SIM generator and its deterministic threshold layer are unchanged and keep running alongside.

### Alert SMS (Fast2SMS)

Add to `.env` (server-only — never exposed to the frontend):

```
FAST2SMS_API_KEY=xxxx        # from console.fast2sms.com
ALERT_PHONE_NUMBER=+919999999999
```

- Only `WARNING` and `CRITICAL` alerts are ever SMS'd; `NORMAL` is never sent.
- Messages are fault-specific (`TET_RUNAWAY`, `VIBRATION_LIMIT_BREACH` with live value/threshold, `OIL_PRESSURE_LOSS`, `COMPRESSOR_SURGE`, `FUEL_FLOW_ANOMALY`, `BATTERY_SAG`).
- **No API key → dev-test mode:** the exact message is logged server-side and the pipeline reports success, so the whole chain can be exercised without a provider.
- Failures (missing key, invalid phone, provider error) never crash the backend — the alert is stored with `sms: "failed"`. Alert/SMS endpoints carry a basic per-IP rate limit (429 on excess).

### Environment variables

| Var | Used by | Notes |
|---|---|---|
| `PORT` | server | default 3001 |
| `GEMINI_API_KEY` | `/api/diagnose` | optional — rule-based fallback without it |
| `FAST2SMS_API_KEY` | alert SMS | optional — dev-test mode without it |
| `ALERT_PHONE_NUMBER` | alert SMS | E.164 recipient |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Access page auth | empty = demo login (callsign + `GAS418S-ALPHA-Q`) |

### Testing

```bash
npm run typecheck   # tsc -b (app + server)
npm test            # vitest — thresholds, ring buffer, fault golden, alert/SMS pipeline
npm run build       # production build

# exercise the pipeline against a running dev server:
curl -X POST localhost:3001/api/simulation/scenario -H 'Content-Type: application/json' -d '{"scenario":"vibration_growth"}'
curl -X POST localhost:3001/api/test/critical-alert -H 'Content-Type: application/json' -d '{}'
```