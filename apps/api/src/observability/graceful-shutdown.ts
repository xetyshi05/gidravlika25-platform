import { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { StructuredLogger } from './structured-logger';

const signals = ['SIGTERM', 'SIGINT'] as const;
const DEFAULT_DRAIN_TIMEOUT_MS = 50_000;

/**
 * REL-03: on SIGTERM (docker stop, deploy) the API first stops accepting
 * connections and waits for requests in flight, and only then closes the
 * application. Nest's own `enableShutdownHooks` runs onModuleDestroy (Prisma,
 * S3 client) before it closes the HTTP server, so a request that is still
 * running would lose its database connection. Compose waits
 * `stop_grace_period` (longer than the drain timeout) before killing.
 */
export function enableGracefulShutdown(
  app: INestApplication,
  logger: StructuredLogger,
  exit: (code: number) => void = (code) => process.exit(code),
) {
  let stopping: Promise<void> | undefined;
  const stop = (signal: string) => {
    stopping ??= (async () => {
      logger.info('application.shutdown_started', { signal });
      const server = app.getHttpServer() as Server;
      const drained = new Promise<boolean>((resolve) => server.close(() => resolve(true)));
      // A keep-alive connection becomes idle once its response is sent; close
      // it then instead of waiting for the client's keep-alive timeout.
      server.closeIdleConnections();
      const idleSweep = setInterval(() => server.closeIdleConnections(), 100);
      const timeoutMs = drainTimeout();
      let timer: NodeJS.Timeout | undefined;
      const finished = await Promise.race([
        drained,
        new Promise<boolean>((resolve) => (timer = setTimeout(() => resolve(false), timeoutMs))),
      ]);
      clearTimeout(timer);
      clearInterval(idleSweep);
      if (!finished) {
        logger.event('warn', 'application.shutdown_drain_timeout', { timeoutMs });
        server.closeAllConnections();
      }
      await app.close();
      logger.info('application.shutdown_completed', { signal });
    })();
    return stopping;
  };
  for (const signal of signals)
    process.once(signal, () => {
      void stop(signal).then(
        () => exit(0),
        (error: unknown) => {
          logger.event('error', 'application.shutdown_failed', { signal, error });
          exit(1);
        },
      );
    });
}

function drainTimeout() {
  const configured = Number.parseInt(process.env.SHUTDOWN_DRAIN_TIMEOUT_MS ?? '', 10);
  return Number.isSafeInteger(configured) && configured > 0 ? configured : DEFAULT_DRAIN_TIMEOUT_MS;
}
