import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../lib/http-error.js';

/** Unknown routes under /api answer with JSON instead of Express's HTML page. */
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found` });
}

/**
 * Last stop for every error thrown in a route.
 * Express recognises it as an error handler because it takes four arguments.
 */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Invalid request',
      details: err.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  // Malformed JSON, body too large, etc. (errors raised by express.json())
  if (
    err instanceof Error &&
    'status' in err &&
    typeof err.status === 'number' &&
    err.status < 500
  ) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
