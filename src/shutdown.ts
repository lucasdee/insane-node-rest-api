import type { Server } from 'http';

export interface ShutdownOptions {
  server: Pick<Server, 'close'>;
  /** Closes the database pool once no request needs it any more. */
  disconnect: () => Promise<void>;
  /** After this long, exit with code 1 even if requests or the pool haven't finished. */
  timeoutMs?: number;
  exit?: (code: number) => void;
}

/**
 * Returns the handler for SIGTERM and SIGINT. It stops accepting connections, lets
 * requests in progress finish, closes the database pool, and exits with 0, or with 1
 * on an error or when `timeoutMs` passes first. A second signal exits at once.
 */
export const createShutdown = ({
  server,
  disconnect,
  timeoutMs = 10_000,
  exit = (code) => process.exit(code),
}: ShutdownOptions) => {
  let shuttingDown = false;

  return async (signal: string): Promise<void> => {
    if (shuttingDown) {
      console.warn(`${signal} received again, exiting without waiting`);
      exit(1);
      return;
    }
    shuttingDown = true;
    console.log(`${signal} received, shutting down`);

    const timer = setTimeout(() => {
      console.error(`Shutdown did not finish within ${timeoutMs} ms, exiting`);
      exit(1);
    }, timeoutMs);
    // The timer alone must not keep the process running.
    timer.unref();

    try {
      // Closes idle keep-alive connections, and waits for the active ones to finish.
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
      await disconnect();
      clearTimeout(timer);
      exit(0);
    } catch (err) {
      clearTimeout(timer);
      console.error('Shutdown failed:', err);
      exit(1);
    }
  };
};
