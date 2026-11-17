import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildRefreshCookie, clearRefreshCookie } from '../../utils/cookie';
import { env } from '../../config/env';

const NOW = new Date('2026-01-01T12:00:00.000Z').getTime();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  env.nodeEnv = 'test';
});

describe('buildRefreshCookie', () => {
  it('builds an HttpOnly, SameSite=Strict cookie scoped to /auth', () => {
    expect(buildRefreshCookie('abc', NOW + 60_000)).toBe(
      'refreshToken=abc; HttpOnly; SameSite=Strict; Path=/auth; Max-Age=60',
    );
  });

  it('sets Max-Age in whole seconds until expiry', () => {
    expect(buildRefreshCookie('abc', NOW + 7 * 24 * 60 * 60 * 1000 + 999)).toMatch(
      /; Max-Age=604800$/,
    );
  });

  it('adds Secure in production', () => {
    env.nodeEnv = 'production';

    expect(buildRefreshCookie('abc', NOW + 60_000)).toBe(
      'refreshToken=abc; HttpOnly; Secure; SameSite=Strict; Path=/auth; Max-Age=60',
    );
  });
});

describe('clearRefreshCookie', () => {
  it('expires the cookie immediately on the same path', () => {
    expect(clearRefreshCookie()).toBe(
      'refreshToken=; HttpOnly; SameSite=Strict; Path=/auth; Max-Age=0',
    );
  });
});
