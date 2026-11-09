import { Request, Response, NextFunction } from 'express';
import config from '../config';

const SENSITIVE_KEY_REGEX = /(?:password|secret|token|credential|key|auth|code)/i;

export function redactSensitiveObject(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(redactSensitiveObject);
  }
  const sanitized: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      sanitized[key] = redactSensitiveObject(val);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  if (config.isTest) {
    return next();
  }

  const start = Date.now();
  const reqId = (req as any).id || (req.headers['x-request-id'] as string) || '-';

  res.on('finish', () => {
    const duration = Date.now() - start;
    const ip = req.ip || req.socket.remoteAddress || '-';
    console.log(
      `[HTTP] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms - IP: ${ip} - ReqId: ${reqId}`
    );
  });

  next();
}
