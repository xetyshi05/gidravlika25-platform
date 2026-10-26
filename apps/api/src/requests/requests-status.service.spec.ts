import { ConflictException } from '@nestjs/common';
import { RequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestsService } from './requests.service';

describe('RequestsService status transitions', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-06T20:30:00.000Z'));
  });

  afterEach(() => jest.useRealTimers());

  function createFixture(updatedCount: number) {
    const requestFindUnique = jest
      .fn()
      .mockResolvedValueOnce({ status: RequestStatus.NEW })
      .mockResolvedValueOnce({
        id: 'request-1',
        status: RequestStatus.IN_PROGRESS,
        responseDueAt: new Date('2026-09-06T21:00:00.000Z'),
        createdAt: new Date('2026-09-06T20:00:00.000Z'),
        readStates: [{ id: 'read-1' }],
        comments: [],
        activities: [],
        consents: [],
        _count: { comments: 0, activities: 2, consents: 0 },
      });
    const tx = {
      request: {
        updateMany: jest.fn().mockResolvedValue({ count: updatedCount }),
      },
      requestActivity: { create: jest.fn().mockResolvedValue({}) },
      requestReadState: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prismaMock = {
      request: { findUnique: requestFindUnique },
      $transaction: jest.fn((callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };

    return {
      service: new RequestsService(prismaMock as unknown as PrismaService),
      tx,
    };
  }

  it('changes the status only when the previously read status still matches', async () => {
    const { service, tx } = createFixture(1);

    await service.updateRequestStatus('request-1', { status: RequestStatus.IN_PROGRESS }, 'user-1');

    expect(tx.request.updateMany).toHaveBeenCalledWith({
      where: { id: 'request-1', status: RequestStatus.NEW },
      data: {
        status: RequestStatus.IN_PROGRESS,
        firstRespondedAt: new Date('2026-09-06T20:30:00.000Z'),
      },
    });
    expect(tx.requestActivity.create).toHaveBeenCalledWith({
      data: {
        requestId: 'request-1',
        userId: 'user-1',
        type: 'STATUS_CHANGED',
        data: {
          from: RequestStatus.NEW,
          to: RequestStatus.IN_PROGRESS,
        },
      },
    });
  });

  it('rejects a stale concurrent update and writes no false history entry', async () => {
    const { service, tx } = createFixture(0);

    await expect(
      service.updateRequestStatus('request-1', { status: RequestStatus.IN_PROGRESS }, 'user-1'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.requestActivity.create).not.toHaveBeenCalled();
    expect(tx.requestReadState.deleteMany).not.toHaveBeenCalled();
  });
});
