import { createHash } from 'node:crypto';
import { PrismaService } from './prisma.service';

/**
 * Atomically counts one event for `key` in the shared `PublicRequestRateLimit`
 * table, so every API replica sees the same total. Expired rows are removed by
 * `PublicRequestSecurityService`.
 */
export async function incrementRateLimitCounter(
  prisma: Pick<PrismaService, 'publicRequestRateLimit'>,
  key: string,
  expiresAt: number,
) {
  const keyHash = rateLimitKeyHash(key);
  const counter = await prisma.publicRequestRateLimit.upsert({
    where: { keyHash },
    create: { keyHash, requestCount: 1, expiresAt: new Date(expiresAt) },
    update: { requestCount: { increment: 1 } },
    select: { requestCount: true },
  });
  return counter.requestCount;
}

/** Current value of a counter without changing it. */
export async function readRateLimitCounter(
  prisma: Pick<PrismaService, 'publicRequestRateLimit'>,
  key: string,
) {
  const counter = await prisma.publicRequestRateLimit.findUnique({
    where: { keyHash: rateLimitKeyHash(key) },
    select: { requestCount: true, expiresAt: true },
  });
  return counter && counter.expiresAt.getTime() > Date.now() ? counter.requestCount : 0;
}

export function rateLimitKeyHash(key: string) {
  return createHash('sha256').update(key).digest('hex');
}
