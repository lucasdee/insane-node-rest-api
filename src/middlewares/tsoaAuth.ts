import { env } from '../config/env';
import { JWT_ALGORITHM } from '../config/jwt';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import type { Request } from 'express';
import { AuthError } from '../errors';

export const expressAuthentication = async (
  req: Request,
  securityName: string,
): Promise<JwtPayload> => {
  if (securityName !== 'jwt') {
    throw new AuthError('Unsupported security type');
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthError('No token provided');
  }

  const token = authHeader.substring(7);
  const secret = env.jwt.secret;

  try {
    const decoded = jwt.verify(token, secret, { algorithms: [JWT_ALGORITHM] }) as JwtPayload;
    return decoded;
  } catch {
    throw new AuthError('Invalid token');
  }
};
