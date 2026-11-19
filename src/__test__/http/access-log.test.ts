import fs from 'fs';
import os from 'os';
import path from 'path';
import { Writable } from 'stream';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

/**
 * app.ts sets up logging when it is imported, so each test sets the environment and
 * then imports a fresh copy. The log file stream is replaced by one that collects the
 * lines in memory, and morgan is wrapped to record which formats are used.
 */
const { logLines, createStream, morganFormats } = vi.hoisted(() => {
  const logLines: string[] = [];
  return { logLines, createStream: vi.fn(), morganFormats: [] as unknown[] };
});

vi.mock('rotating-file-stream', () => ({ createStream }));

vi.mock('morgan', async (importOriginal) => {
  const actual = (await importOriginal<{ default: (...args: unknown[]) => unknown }>()).default;
  return {
    default: (format: unknown, ...rest: unknown[]) => {
      morganFormats.push(format);
      return actual(format, ...rest);
    },
  };
});

vi.mock('../../config/db', () => ({ prisma: {} }));

const loadApp = async (settings: Record<string, string>) => {
  Object.entries(settings).forEach(([name, value]) => vi.stubEnv(name, value));
  return (await import('../../app')).default as Express;
};

let tempDir: string;

beforeEach(() => {
  vi.resetModules();
  logLines.length = 0;
  morganFormats.length = 0;
  createStream.mockReset();
  createStream.mockImplementation(
    () =>
      new Writable({
        write(chunk, _encoding, callback) {
          logLines.push(chunk.toString());
          callback();
        },
      }),
  );
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'access-log-test-'));
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('access log file', () => {
  it('is off in tests by default, and no log directory is created', async () => {
    const logDir = path.join(tempDir, 'logs');
    const app = await loadApp({ ACCESS_LOG_ENABLED: '', ACCESS_LOG_DIR: logDir });

    await request(app).get('/does-not-exist');

    expect(createStream).not.toHaveBeenCalled();
    expect(fs.existsSync(logDir)).toBe(false);
  });

  it('writes combined-format lines to a daily rotated file in the configured directory', async () => {
    const logDir = path.join(tempDir, 'nested', 'logs');
    const app = await loadApp({ ACCESS_LOG_ENABLED: 'true', ACCESS_LOG_DIR: logDir });

    await request(app).get('/does-not-exist').set('User-Agent', 'access-log-test');

    expect(fs.statSync(logDir).isDirectory()).toBe(true);
    expect(createStream).toHaveBeenCalledWith('access.log', { interval: '1d', path: logDir });
    await vi.waitFor(() => expect(logLines).toHaveLength(1));
    expect(logLines[0]).toMatch(/"GET \/does-not-exist HTTP\/1\.1" 404 .*"access-log-test"/);
  });
});

describe('console request log', () => {
  it.each([
    ['development', true],
    ['production', false],
    ['test', false],
  ])('NODE_ENV=%s: on is %s', async (nodeEnv, expected) => {
    await loadApp({ NODE_ENV: nodeEnv, ACCESS_LOG_ENABLED: 'false', DOCS_ENABLED: 'false' });

    expect(morganFormats.includes('dev')).toBe(expected);
  });

  it('leaves only the file log in production', async () => {
    await loadApp({ NODE_ENV: 'production', ACCESS_LOG_DIR: tempDir });

    expect(morganFormats).toEqual(['combined']);
  });
});
