import { Request, Response, NextFunction } from 'express';
import { z, ZodTypeAny, ZodError } from 'zod';

export function validateRequest(schemas: {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (schemas.params) {
      const parsed = schemas.params.safeParse(req.params);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Invalid request parameters',
          code: 'VALIDATION_ERROR',
          details: formatZodError(parsed.error)
        });
        return;
      }
      req.params = parsed.data;
    }

    if (schemas.query) {
      const parsed = schemas.query.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Invalid query parameters',
          code: 'VALIDATION_ERROR',
          details: formatZodError(parsed.error)
        });
        return;
      }
      req.query = parsed.data;
    }

    if (schemas.body) {
      const parsed = schemas.body.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Invalid request body',
          code: 'VALIDATION_ERROR',
          details: formatZodError(parsed.error)
        });
        return;
      }
      req.body = parsed.data;
    }

    next();
  };
}

function formatZodError(err: ZodError): Record<string, string[]> {
  const issues = err.issues || [];
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = issue.path.join('.') || '_form';
    if (!fieldErrors[key]) {
      fieldErrors[key] = [];
    }
    fieldErrors[key].push(issue.message);
  }
  return fieldErrors;
}

// Reusable primitive validators
export const idParamSchema = z.object({
  id: z.string().min(1, 'ID parameter is required')
}).strict();

export const userRoleEnum = z.enum(['ADMIN', 'DIRECTOR', 'BRANCH_MANAGER', 'IT_SUPPORT', 'FINANCE', 'USER']);
export const userStatusEnum = z.enum(['INVITED', 'ACTIVE', 'SUSPENDED', 'DELETED']);
export const assetStatusEnum = z.enum(['ACTIVE', 'DAMAGED', 'REPAIR', 'DEPRECATED', 'SOLD', 'DISPOSED']);
export const assetConditionEnum = z.enum(['NEW', 'GOOD', 'FAIR', 'POOR']);
export const priorityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

