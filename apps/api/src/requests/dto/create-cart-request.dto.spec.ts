import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCartRequestDto } from './create-cart-request.dto';
import { DEFAULT_PERSONAL_DATA_DOCUMENT_VERSION } from '../personal-data-document';

const baseRequest = {
  firstName: 'Иван',
  lastName: 'Иванов',
  middleName: 'Иванович',
  phone: '+7 999 123-45-67',
  email: 'ivanov@example.com',
  deliveryType: 'PICKUP',
  paymentType: 'ON_RECEIPT',
  personalDataConsent: true,
  documentVersion: DEFAULT_PERSONAL_DATA_DOCUMENT_VERSION,
};

describe('CreateCartRequestDto limits', () => {
  it('rejects more than 50 cart lines', async () => {
    const dto = plainToInstance(CreateCartRequestDto, {
      ...baseRequest,
      items: Array.from({ length: 51 }, (_, index) => ({
        productId: `product-${index}`,
        quantity: 1,
      })),
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'items')).toBe(true);
  });

  it('rejects a quantity above 999', async () => {
    const dto = plainToInstance(CreateCartRequestDto, {
      ...baseRequest,
      items: [{ productId: 'product-1', quantity: 1000 }],
    });

    const errors = await validate(dto);
    const itemErrors = errors.find((error) => error.property === 'items');

    expect(itemErrors?.children?.[0]?.children?.[0]?.property).toBe('quantity');
  });

  it('requires an address for delivery but not for pickup', async () => {
    const delivery = plainToInstance(CreateCartRequestDto, {
      ...baseRequest,
      deliveryType: 'DELIVERY',
      items: [{ productId: 'product-1', quantity: 1 }],
    });
    const pickup = plainToInstance(CreateCartRequestDto, {
      ...baseRequest,
      items: [{ productId: 'product-1', quantity: 1 }],
    });

    expect((await validate(delivery)).some((error) => error.property === 'deliveryAddress')).toBe(
      true,
    );
    expect((await validate(pickup)).some((error) => error.property === 'deliveryAddress')).toBe(
      false,
    );
  });

  it('requires a middle name and an email (owner decision D6)', async () => {
    const dto = plainToInstance(CreateCartRequestDto, {
      ...baseRequest,
      middleName: undefined,
      email: undefined,
      items: [{ productId: 'product-1', quantity: 1 }],
    });

    const properties = (await validate(dto)).map((error) => error.property);

    expect(properties).toEqual(expect.arrayContaining(['middleName', 'email']));
  });

  it('accepts null parts of a suggested delivery address', async () => {
    const dto = plainToInstance(CreateCartRequestDto, {
      ...baseRequest,
      deliveryType: 'DELIVERY',
      deliveryAddress: 'г Орёл, ул Ленина, д 1',
      deliveryAddressDetails: {
        city: 'Орёл',
        street: 'Ленина',
        house: '1',
        block: null,
        flat: null,
      },
      items: [{ productId: 'product-1', quantity: 1 }],
    });

    expect(await validate(dto)).toEqual([]);
  });
});
