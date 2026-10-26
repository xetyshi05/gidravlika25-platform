import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { actionsByScope, BackofficeActivityService } from './backoffice-activity.service';

/** Action names written to the journal anywhere in the API sources. */
function recordedActions() {
  const root = join(__dirname, '..');
  const files = readdirSync(root, { recursive: true, encoding: 'utf8' }).filter(
    (file) =>
      file.endsWith('.ts') &&
      !file.endsWith('.spec.ts') &&
      !file.endsWith('backoffice-activity.service.ts'),
  );
  const actions = new Set<string>();
  for (const file of files) {
    const source = readFileSync(join(root, file), 'utf8');
    for (const [, action] of source.matchAll(
      /'((?:AUTH|USERS?|PRODUCTS?|STOCK|CATEGORY|CATEGORIES|SETTINGS)_[A-Z_]+)'/g,
    ))
      actions.add(action);
  }
  return [...actions].sort();
}

describe('BackofficeActivityService', () => {
  it('filters exactly the actions that the API records', () => {
    // A listed action that is never written is a dead filter entry (ARCH-02);
    // a written action that is not listed disappears from its scope filter.
    expect(Object.values(actionsByScope).flat().sort()).toEqual(recordedActions());
  });

  it('applies an activity scope and bounded pagination', async () => {
    const findMany = jest.fn();
    const count = jest.fn();
    const prisma = {
      backofficeActivity: { findMany, count },
      $transaction: jest.fn().mockResolvedValue([[], 0]),
    } as unknown as PrismaService;
    const service = new BackofficeActivityService(prisma);

    await expect(service.list({ scope: 'USERS', page: 2, pageSize: 500 })).resolves.toEqual({
      items: [],
      total: 0,
      page: 2,
      pageSize: 100,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 200,
        take: 100,
        where: {
          action: {
            in: [
              'USER_CREATED',
              'USER_UPDATED',
              'USER_PASSWORD_CHANGED',
              'USER_TWO_FACTOR_RESET',
              'USER_SESSIONS_REVOKED',
              'USER_SESSION_REVOKED',
            ],
          },
        },
      }),
    );
  });

  it('records structured activity details', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'activity-1' });
    const service = new BackofficeActivityService({
      backofficeActivity: { create },
    } as unknown as PrismaService);

    await service.record('admin-1', 'SETTINGS_UPDATED', 'settings', { changed: true });

    expect(create).toHaveBeenCalledWith({
      data: {
        userId: 'admin-1',
        action: 'SETTINGS_UPDATED',
        entity: 'settings',
        details: { changed: true },
      },
    });
  });
});
