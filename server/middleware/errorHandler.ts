import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Centralized error handling. `asyncHandler` forwards rejected promises from
 * async route handlers to the error middleware (Express 4 does not catch them
 * itself, and an unhandled rejection would crash the process). The error
 * middleware emits a JSON 500 and a 404 handler covers unknown routes — the
 * backend never dies from a bad request or a failing dependency (e.g. SMS).
 */

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ ok: false, error: 'not found' });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const status = typeof (err as { status?: unknown })?.status === 'number' ? (err as { status: number }).status : 500;
  const message = status >= 500 ? 'internal server error' : String((err as { message?: unknown })?.message ?? 'error');
  if (status >= 500) console.error('[vyom] error:', err);
  res.status(status).json({ ok: false, error: message });
}