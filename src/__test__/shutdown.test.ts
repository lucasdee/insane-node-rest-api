import http from 'http';
import type { AddressInfo } from 'net';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createShutdown } from '../shutdown';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** A server whose /slow requests wait until `finishSlow` is called. */
const startServer = async () => {
  let finishSlow = () => {};
  let started = () => {};
  const slowStarted = new Promise<void>((resolve) => (started = resolve));
  const server = http.createServer((req, res) => {
    if (req.url === '/slow') {
      finishSlow = () => res.end('slow done');
      started();
    } else {
      res.end('ok');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const get = (path: string) =>
    new Promise<string>((resolve, reject) => {
      http
        .get({ host: '127.0.0.1', port, path, agent: false }, (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => resolve(body));
        })
        .on('error', reject);
    });
  return { server, get, slowStarted, finishSlow: () => finishSlow() };
};

describe('createShutdown', () => {
  it('lets a request in progress finish, then closes the pool and exits with 0', async () => {
    const { server, get, slowStarted, finishSlow } = await startServer();
    const order: string[] = [];
    const disconnect = vi.fn(async () => {
      order.push('disconnect');
    });
    const exit = vi.fn((code: number) => {
      order.push(`exit ${code}`);
    });
    const shutdown = createShutdown({ server, disconnect, exit });

    const slow = get('/slow');
    await slowStarted;
    const done = shutdown('SIGTERM');

    // New connections are refused while the slow request is still running.
    await expect(get('/')).rejects.toThrow(/ECONNREFUSED/);
    expect(disconnect).not.toHaveBeenCalled();

    finishSlow();
    expect(await slow).toBe('slow done');
    await done;

    expect(order).toEqual(['disconnect', 'exit 0']);
  });

  it('exits with 1 when closing the database pool fails', async () => {
    const { server } = await startServer();
    const exit = vi.fn();
    const shutdown = createShutdown({
      server,
      disconnect: () => Promise.reject(new Error('pool error')),
      exit,
    });

    await shutdown('SIGTERM');

    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('exits with 1 when the server does not close in time', async () => {
    vi.useFakeTimers();
    const server = { close: vi.fn() }; // Never calls back, like a request that hangs.
    const disconnect = vi.fn(async () => {});
    const exit = vi.fn();
    const shutdown = createShutdown({ server, disconnect, exit, timeoutMs: 10_000 });

    void shutdown('SIGTERM');
    vi.advanceTimersByTime(9_999);
    expect(exit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('exits at once on a second signal', async () => {
    const server = { close: vi.fn() };
    const exit = vi.fn();
    const shutdown = createShutdown({ server, disconnect: vi.fn(), exit });

    void shutdown('SIGINT');
    expect(exit).not.toHaveBeenCalled();

    await shutdown('SIGINT');
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(server.close).toHaveBeenCalledTimes(1);
  });
});
