import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestsService } from './requests.service';

describe('RequestsService read state', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-06T20:30:00.000Z'));
  });

  afterEach(() => jest.useRealTimers());

  it('marks a request as read for the current CRM user', async () => {
    const readAt = new Date('2026-09-06T20:00:00.000Z');
    const prismaMock = {
      request: {
        findUnique: jest.fn().mockResolvedValue({ id: 'request-1' }),
      },
      requestReadState: {
        upsert: jest.fn().mockResolvedValue({ readAt }),
      },
    };
    const service = new RequestsService(prismaMock as unknown as PrismaService);

    await expect(service.markRequestRead('request-1', 'user-1')).resolves.toEqual({ readAt });
    expect(prismaMock.requestReadState.upsert).toHaveBeenCalledWith({
      where: {
        requestId_userId: { requestId: 'request-1', userId: 'user-1' },
      },
      create: { requestId: 'request-1', userId: 'user-1' },
      update: { readAt: new Date('2026-09-06T20:30:00.000Z') },
      select: { readAt: true },
    });
  });

  it('does not create a read state for a missing request', async () => {
    const prismaMock = {
      request: { findUnique: jest.fn().mockResolvedValue(null) },
      requestReadState: { upsert: jest.fn() },
    };
    const service = new RequestsService(prismaMock as unknown as PrismaService);

    await expect(service.markRequestRead('missing-request', 'user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prismaMock.requestReadState.upsert).not.toHaveBeenCalled();
  });
});
