import { env } from './config/env';
import { prisma } from './config/db';
import app from './app';
import { createShutdown } from './shutdown';

const PORT = env.port;

const server = app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});

const shutdown = createShutdown({ server, disconnect: () => prisma.$disconnect() });

process.on('SIGTERM', (signal) => void shutdown(signal));
process.on('SIGINT', (signal) => void shutdown(signal));
