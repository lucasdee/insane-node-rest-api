import { ValidateError } from '@tsoa/runtime';
import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): Response | void {
  // Validation errors from tsoa
  if (err instanceof ValidateError) {
    return res.status(422).json({
      message: 'Validation failed',
      details: err?.fields,
    });
  }

  // Manually thrown errors
  if (err instanceof Error) {
    return res.status(400).json({
      message: err.message,
    });
  }

  // Fallback for unexpected errors
  return res.status(500).json({
    message: 'Internal server error',
  });
}
