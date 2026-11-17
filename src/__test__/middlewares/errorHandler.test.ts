import { describe, it, expect, vi } from 'vitest';
import { ValidateError } from '@tsoa/runtime';
import type { NextFunction, Request, Response } from 'express';
import { errorHandler } from '../../middlewares/errorHandler';
import { AuthError, ForbiddenError, NotFoundError } from '../../errors';

const run = (err: unknown) => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  errorHandler(err, {} as Request, res as unknown as Response, vi.fn() as NextFunction);
  return { status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0] };
};

describe('errorHandler', () => {
  it('maps ValidateError to 422 with field details', () => {
    const fields = { 'body.title': { message: 'too short' } };
    expect(run(new ValidateError(fields, 'invalid'))).toEqual({
      status: 422,
      body: { message: 'Validation failed', details: fields },
    });
  });

  it('maps ForbiddenError to 403', () => {
    expect(run(new ForbiddenError('nope'))).toEqual({ status: 403, body: { message: 'nope' } });
  });

  it('maps NotFoundError to 404', () => {
    expect(run(new NotFoundError('User not found'))).toEqual({
      status: 404,
      body: { message: 'User not found' },
    });
  });

  it('maps AuthError to 401', () => {
    expect(run(new AuthError('bad token'))).toEqual({
      status: 401,
      body: { message: 'bad token' },
    });
  });

  it('maps other Errors to 400', () => {
    expect(run(new Error('boom'))).toEqual({ status: 400, body: { message: 'boom' } });
  });

  it('maps non-Error values to 500 without leaking them', () => {
    expect(run('secret detail')).toEqual({
      status: 500,
      body: { message: 'Internal server error' },
    });
  });
});
