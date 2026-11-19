import { env } from '../config/env';
import { JWT_ALGORITHM } from '../config/jwt';
import jwt from 'jsonwebtoken';
import type { Request } from 'express';
import { AuthError } from '../errors';
import { userIdFromSubject } from '../utils/jwtSubject';

/** The authenticated caller. tsoa puts it on `req.user`. */
export interface AuthUser {
  userId: number;
}

export const expressAuthentication = async (
  req: Request,
  securityName: string,
): Promise<AuthUser> => {
  if (securityName !== 'jwt') {
    throw new AuthError('Unsupported security type');
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthError('No token provided');
  }

  const token = authHeader.substring(7);
  const secret = env.jwt.secret;

  let payload: string | jwt.JwtPayload;
  try {
    payload = jwt.verify(token, secret, { algorithms: [JWT_ALGORITHM] });
  } catch {
    throw new AuthError('Invalid token');
  }

  const userId = typeof payload === 'string' ? null : userIdFromSubject(payload.sub);
  if (userId === null) throw new AuthError('Invalid token');

  return { userId };
};
