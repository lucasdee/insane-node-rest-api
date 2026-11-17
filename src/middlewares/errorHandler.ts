import { ValidateError } from '@tsoa/runtime';
import { Request, Response, NextFunction } from 'express';
import { Prisma } from '../generated/prisma/client';
import { AuthError, ConflictError, ForbiddenError, NotFoundError } from '../errors';

/**
 * Client-safe responses for Prisma errors caused by the request's data.
 * Prisma's own messages name tables, columns and constraints, so they are
 * logged on the server and never sent to the client.
 */
const prismaErrorResponses: Record<string, { status: number; message: string }> = {
  P2000: { status: 400, message: 'A provided value is too long' },
  P2002: { status: 409, message: 'A resource with the same unique value already exists' },
  P2003: { status: 400, message: 'A referenced resource does not exist' },
  P2025: { status: 404, message: 'Resource not found' },
};

/** Errors from http-errors (e.g. express.json body parsing) that are safe to expose. */
const isExposableHttpError = (err: unknown): err is { status: number; message: string } =>
  typeof err === 'object' &&
  err !== null &&
  (err as { expose?: unknown }).expose === true &&
  typeof (err as { status?: unknown }).status === 'number' &&
  typeof (err as { message?: unknown }).message === 'string';

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

  // Insufficient permissions errors
  if (err instanceof ForbiddenError) {
    return res.status(403).json({
      message: err.message,
    });
  }

  // Missing resources
  if (err instanceof NotFoundError) {
    return res.status(404).json({
      message: err.message,
    });
  }

  // Conflicts with existing resources
  if (err instanceof ConflictError) {
    return res.status(409).json({
      message: err.message,
    });
  }

  // Authentication errors
  if (err instanceof AuthError) {
    return res.status(401).json({
      message: err.message,
    });
  }

  // Database errors caused by the request's data, with a generic message
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const known = prismaErrorResponses[err.code];
    if (known) {
      console.warn(`Prisma ${err.code}: ${err.message}`);
      return res.status(known.status).json({ message: known.message });
    }
  }

  // Client errors raised by Express middleware, e.g. malformed JSON bodies
  if (isExposableHttpError(err)) {
    return res.status(err.status).json({
      message: err.message,
    });
  }

  // Anything else is unexpected: log it, but never leak its details
  console.error(err);
  return res.status(500).json({
    message: 'Internal server error',
  });
}
