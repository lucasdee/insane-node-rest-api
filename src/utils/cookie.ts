import { env } from '../config/env';

const COOKIE_NAME = 'refreshToken';
const COOKIE_PATH = '/auth';

export const buildRefreshCookie = (token: string, expiresOn: number): string => {
  const maxAge = Math.floor((expiresOn - Date.now()) / 1000);
  const secure = env.nodeEnv === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=${token}; HttpOnly${secure}; SameSite=Strict; Path=${COOKIE_PATH}; Max-Age=${maxAge}`;
};

export const clearRefreshCookie = (): string => {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=${COOKIE_PATH}; Max-Age=0`;
};
