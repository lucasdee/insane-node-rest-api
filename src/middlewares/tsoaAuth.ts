import { env } from '../config/env.js';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import type { Request } from 'express';

export const expressAuthentication = async (
  req: Request,
  securityName: string,
): Promise<JwtPayload> => {
  if (securityName !== 'jwt') {
    throw new Error('Unsupported security type');
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('No token provided');
  }

  const token = authHeader.substring(7);
  const secret = env.jwtSecret;

  try {
    const decoded = jwt.verify(token, secret) as JwtPayload;
    return decoded;
  } catch {
    throw new Error('Invalid token');
  }
};
