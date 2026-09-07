import fs from 'fs';
import path from 'path';
import { buildApp } from './app';

/** Minimal .env loader (no dependency) — never overrides real env vars. */
function loadDotEnv(file: string): void {
  try {
    const text = fs.readFileSync(file, 'utf8');
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    /* no .env file — env comes from the shell */
  }
}
loadDotEnv(path.join(process.cwd(), '.env'));

const rawPort = Number(process.env.PORT ?? 3001);
const PORT = Number.isFinite(rawPort) && rawPort > 0 ? rawPort : 3001;

buildApp().listen(PORT, () => {
  console.log(`[vyom] server listening on http://localhost:${PORT}`);
});
