import { PrismaService } from '../prisma/prisma.service';
import { CustomersService } from './customers.service';
import { PersonalDataRetentionService } from './personal-data-retention.service';

describe('PersonalDataRetentionService', () => {
  afterEach(() => {
    jest.useRealTimers();
    delete process.env.PERSONAL_DATA_RETENTION_DAYS;
    delete process.env.PERSONAL_DATA_RETENTION_BATCH_SIZE;
  });

  function fixture(candidateIds = ['customer-1', 'customer-2']) {
    const customer = {
      count: jest.fn().mockResolvedValue(candidateIds.length),
      findMany: jest.fn().mockResolvedValue(candidateIds.map((id) => ({ id }))),
    };
    const customers = {
      anonymizeCustomerByRetention: jest.fn().mockResolvedValue(true),
    };
    return {
      service: new PersonalDataRetentionService(
        { customer } as unknown as PrismaService,
        customers as unknown as CustomersService,
      ),
      customer,
      customers,
    };
  }

  it('reports eligible records without changing them in dry-run mode', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-11T12:00:00.000Z'));
    process.env.PERSONAL_DATA_RETENTION_DAYS = '365';
    const { service, customer, customers } = fixture();

    await expect(service.run(true)).resolves.toMatchObject({
      cutoff: new Date('2025-09-11T12:00:00.000Z'),
      dryRun: true,
      eligible: 2,
      inspected: 2,
      anonymized: 0,
      skipped: 0,
    });
    expect(customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100, select: { id: true } }),
    );
    expect(customers.anonymizeCustomerByRetention).not.toHaveBeenCalled();
  });

  it('anonymizes only the bounded batch and reports concurrent skips', async () => {
    process.env.PERSONAL_DATA_RETENTION_BATCH_SIZE = '2';
    const { service, customers } = fixture(['customer-1', 'customer-2']);
    customers.anonymizeCustomerByRetention.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(service.run(false)).resolves.toMatchObject({
      dryRun: false,
      eligible: 2,
      inspected: 2,
      anonymized: 1,
      skipped: 1,
    });
    expect(customers.anonymizeCustomerByRetention).toHaveBeenCalledTimes(2);
  });
});
