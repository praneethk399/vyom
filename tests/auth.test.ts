import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'http';
import { buildApp } from '../server/app';

/**
 * Auth gate for /api/datasets + /api/diagnose. Supabase is NOT configured in
 * this repo (demo mode), so we stub the env and the Supabase client's
 * `getUser` to exercise the middleware's real branches headlessly:
 *   - configured + valid token  -> 200 (passes through)
 *   - configured + bad/missing  -> 401 (rejects)
 *   - not configured (demo)     -> 200 regardless (passes through)
 *
 * NOTE: the middleware snapshots the env when buildApp() runs, so each case
 * stubs the env BEFORE booting its own ephemeral server.
 */

// Mock the Supabase client so `auth.getUser` is controllable without a network call.
const getUserMock = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: (token: string) => getUserMock(token) } }),
}));

function json(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

function boot(): Promise<{ server: Server; base: string }> {
  return new Promise((resolve) => {
    const server = buildApp().listen(0);
    server.once('listening', () => {
      const addr = server.address();
      const base = addr && typeof addr === 'object' ? `http://127.0.0.1:${addr.port}` : '';
      resolve({ server, base });
    });
  });
}

describe('Supabase auth gate', () => {
  let server: Server | undefined;
  const realEnv = { ...process.env };

  beforeEach(() => {
    getUserMock.mockReset();
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
    vi.unstubAllEnvs();
    process.env = { ...realEnv };
  });

  const configure = () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  };

  it('passes unauthenticated requests through when Supabase is not configured (demo mode)', async () => {
    ({ server } = await boot());
    const port = (server!.address() as { port: number }).port;
    const res = await fetch(`http://127.0.0.1:${port}/api/datasets`);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(Array.isArray(body)).toBe(true);
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it('rejects requests with no token when Supabase is configured', async () => {
    configure();
    ({ server } = await boot());
    const port = (server!.address() as { port: number }).port;
    const res = await fetch(`http://127.0.0.1:${port}/api/datasets`);
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it('rejects requests with an invalid token when Supabase is configured', async () => {
    configure();
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'invalid JWT' } });
    ({ server } = await boot());
    const port = (server!.address() as { port: number }).port;
    const res = await fetch(`http://127.0.0.1:${port}/api/datasets`, {
      headers: { Authorization: 'Bearer bad-token' },
    });
    expect(res.status).toBe(401);
    expect(getUserMock).toHaveBeenCalledWith('bad-token');
  });

  it('allows requests with a valid token through, attaching the user', async () => {
    configure();
    getUserMock.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'op@vyom.aero' } },
      error: null,
    });
    ({ server } = await boot());
    const port = (server!.address() as { port: number }).port;
    const res = await fetch(`http://127.0.0.1:${port}/api/datasets`, {
      headers: { Authorization: 'Bearer good-token' },
    });
    expect(res.status).toBe(200);
    expect(getUserMock).toHaveBeenCalledWith('good-token');
  });

  it('rejects malformed authorization header as unauthenticated', async () => {
    configure();
    ({ server } = await boot());
    const port = (server!.address() as { port: number }).port;
    const res = await fetch(`http://127.0.0.1:${port}/api/datasets`, {
      headers: { Authorization: 'Token good-token' },
    });
    expect(res.status).toBe(401);
    expect(getUserMock).not.toHaveBeenCalled();
  });
});