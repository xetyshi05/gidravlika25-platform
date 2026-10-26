import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityQueryDto } from './dto/catalog.dto';
import { recordBackofficeActivity } from './backoffice-audit';

/**
 * Every action the API writes to the journal, by filter scope. A test checks
 * that this list and the actions recorded in the code stay the same.
 */
export const actionsByScope = {
  AUTH: [
    'AUTH_LOGIN_SUCCEEDED',
    'AUTH_LOGIN_FAILED',
    'AUTH_LOGIN_ACCOUNT_LOCKED',
    'AUTH_LOGIN_ADDRESS_RATE_LIMITED',
    'AUTH_LOGIN_APP_FORBIDDEN',
    'AUTH_TWO_FACTOR_ENABLED',
    'AUTH_TWO_FACTOR_FAILED',
    'AUTH_TWO_FACTOR_ACCOUNT_LOCKED',
    'AUTH_RECOVERY_CODE_USED',
    'AUTH_RECOVERY_CODES_REGENERATED',
    'AUTH_LOGOUT',
    'AUTH_EXPIRED_SESSIONS_CLEANED',
  ],
  CATALOG: [
    'PRODUCT_CREATED',
    'PRODUCT_UPDATED',
    'PRODUCT_IMAGE_UPDATED',
    'PRODUCTS_BULK_UPDATED',
    'PRODUCTS_DELETED',
    'STOCK_CHANGED',
    'STOCK_BULK_CHANGED',
    'CATEGORY_CREATED',
    'CATEGORY_UPDATED',
    'CATEGORIES_BULK_UPDATED',
    'CATEGORIES_DELETED',
    'SETTINGS_UPDATED',
  ],
  USERS: [
    'USER_CREATED',
    'USER_UPDATED',
    'USER_PASSWORD_CHANGED',
    'USER_TWO_FACTOR_RESET',
    'USER_SESSIONS_REVOKED',
    'USER_SESSION_REVOKED',
  ],
} as const;

@Injectable()
export class BackofficeActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ActivityQueryDto = {}) {
    const page = query.page ?? 0;
    const pageSize = Math.min(query.pageSize ?? 25, 100);
    const from = query.dateFrom ? new Date(`${query.dateFrom}T00:00:00.000Z`) : undefined;
    const to = query.dateTo ? new Date(`${query.dateTo}T23:59:59.999Z`) : undefined;
    const where: Prisma.BackofficeActivityWhereInput = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.action
        ? { action: query.action }
        : query.scope && query.scope !== 'ALL'
          ? { action: { in: [...actionsByScope[query.scope]] } }
          : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.backofficeActivity.findMany({
        where,
        skip: page * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true } } },
      }),
      this.prisma.backofficeActivity.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async record(userId: string, action: string, entity: string, details?: Record<string, unknown>) {
    return recordBackofficeActivity(this.prisma, userId, action, entity, details);
  }
}
