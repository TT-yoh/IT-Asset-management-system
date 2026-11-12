import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Standardized HTTP Error class for expected API failure states.
 * - statusCode: HTTP response status (e.g. 400, 401, 403, 404, 409, 422, 500)
 * - code: Machine-readable error code string
 * - expose: Whether message is safe to expose in client JSON response
 */
export class HttpError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly expose: boolean;

  constructor(statusCode: number, message: string, code?: string, expose?: boolean) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code || (statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST');
    this.expose = expose !== undefined ? expose : statusCode < 500;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Wrapper for async route handlers and middlewares in Express 4.
 * Catches rejected promises and forwards them to next(err) so the central
 * error handling middleware can process them without unhandled promise rejections.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    return Promise.resolve(fn(req, res, next)).catch(next);
  };
}
