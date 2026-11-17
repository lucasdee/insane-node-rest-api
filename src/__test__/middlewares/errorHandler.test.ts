import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ValidateError } from '@tsoa/runtime';
import type { NextFunction, Request, Response } from 'express';
import { errorHandler } from '../../middlewares/errorHandler';
import { AuthError, ForbiddenError, NotFoundError } from '../../errors';
import { Prisma } from '../../generated/prisma/client';

const run = (err: unknown) => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  errorHandler(err, {} as Request, res as unknown as Response, vi.fn() as NextFunction);
  return { status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0] };
};

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError(
    `Invalid prisma.user.create() invocation: constraint \`users_email_key\` failed (${code})`,
    { code, clientVersion: '7.4.2' },
  );

const INTERNAL = { status: 500, body: { message: 'Internal server error' } };

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

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

  describe('Prisma errors', () => {
    it.each([
      ['P2000', 400, 'A provided value is too long'],
      ['P2002', 409, 'A resource with the same unique value already exists'],
      ['P2003', 400, 'A referenced resource does not exist'],
      ['P2025', 404, 'Resource not found'],
    ])('maps %s to %i with a generic message', (code, status, message) => {
      expect(run(prismaError(code))).toEqual({ status, body: { message } });
    });

    it('maps unknown Prisma codes to 500 without leaking the message', () => {
      expect(run(prismaError('P2034'))).toEqual(INTERNAL);
      expect(console.error).toHaveBeenCalled();
    });

    it('maps other Prisma errors to 500 without leaking the message', () => {
      const err = new Prisma.PrismaClientValidationError('Argument `email` is missing.', {
        clientVersion: '7.4.2',
      });
      expect(run(err)).toEqual(INTERNAL);
    });
  });

  it('passes through exposable client errors from Express middleware', () => {
    const err = Object.assign(new SyntaxError('Unexpected token } in JSON'), {
      status: 400,
      expose: true,
    });
    expect(run(err)).toEqual({ status: 400, body: { message: 'Unexpected token } in JSON' } });
  });

  it('does not expose http errors marked as not exposable', () => {
    const err = Object.assign(new Error('socket hang up'), { status: 500, expose: false });
    expect(run(err)).toEqual(INTERNAL);
  });

  it('maps unexpected Errors to 500 without leaking the message', () => {
    expect(run(new TypeError("Cannot read properties of undefined (reading 'id')"))).toEqual(
      INTERNAL,
    );
    expect(console.error).toHaveBeenCalled();
  });

  it('maps non-Error values to 500 without leaking them', () => {
    expect(run('secret detail')).toEqual(INTERNAL);
  });
});
