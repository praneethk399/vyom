# VYOM — Run Guide

AI-enabled digital twin for the Flygas GAS418S engine (SIH 2026, PS 26054, Team ALPHA Q).
Stack: Vite 6 + React 18 + TS + Tailwind 4 + react-three-fiber + Express + @google/genai.

## Reproduce artifacts

1. Install dependencies (npm — there is no lockfile committed; Node >= 20 required):

   ```bash
   npm install --no-audit --no-fund
   ```

2. Environment file: copy `.env.example` to `.env` and fill in values.
   Copy `.env` from the main checkout (`C:\Users\PRANEETH\Downloads\Vyom`) if one exists there.
   `GEMINI_API_KEY` is optional — without it the server runs deterministic rule-based
   diagnostics (the UI shows "AI analysis unavailable" / "SIMULATED ANALYSIS").

3. No other generated artifacts are needed. `npm run build` (optional) emits `dist/`.

## Run the server (dev)

One command starts both processes (concurrently):

```bash
npm run dev
```

- Express API on **http://localhost:3001** (script `dev:server`: `tsx watch server/index.ts`)
- Vite dev server on **http://localhost:5173**, with `/api` proxied to :3001 (script `dev:web`)

If 5173 or 3001 are taken, free them or adjust `vite.config.ts` (`server.port`) and
`server/index.ts` (`PORT`); the Vite proxy target must match the API port.

Open the preview URL and sign in with any callsign (>= 3 chars) and access key
**GAS418S-ALPHA-Q**.

### Detached start (Windows, PowerShell)

```powershell
powershell -NoProfile -Command "(Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev' -RedirectStandardOutput '<log>' -RedirectStandardError '<log>.err' -WindowStyle Hidden -PassThru).Id"
```

stdout and stderr must go to different files. Confirm survival with
`Get-Process -Id <pid>`, then wait for http://localhost:5173 to answer before use.

## Checks

```bash
npm run typecheck   # tsc -b (app + server)
npm test            # vitest — thresholds, ring buffer, fault golden tests
npm run build       # production build
```
