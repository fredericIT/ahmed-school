import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { prisma } from './config/prisma';
import { startJobs } from './jobs';

async function main() {
  await prisma.$connect();
  const app = createApp();
  const onListening = () =>
    logger.info(`API listening on http://${env.HOST ?? 'localhost'}:${env.PORT} (docs: /api/docs)`);
  const server = env.HOST ? app.listen(env.PORT, env.HOST, onListening) : app.listen(env.PORT, onListening);
  if (!env.DISABLE_CRON) startJobs();

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
