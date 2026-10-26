import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CategoryDto,
  IdsDto,
  BulkStockDto,
  ProductDto,
  StockDto,
  UpdateCategoryDto,
  UpdateProductDto,
} from './catalog.dto';

describe('Back Office catalog DTO limits', () => {
  it('rejects invalid slugs and empty product identity fields', async () => {
    const product = plainToInstance(ProductDto, {
      sku: '',
      name: '',
      slug: 'Broken / slug',
      categoryId: '',
      price: 100,
    });

    const properties = (await validate(product)).map((error) => error.property);

    expect(properties).toEqual(expect.arrayContaining(['sku', 'name', 'slug', 'categoryId']));
  });

  it('accepts a normalized category slug', async () => {
    const category = plainToInstance(CategoryDto, {
      name: 'Гидроцилиндры',
      slug: 'gidrocilindry-50',
      isActive: true,
    });

    await expect(validate(category)).resolves.toHaveLength(0);
  });

  it('rejects empty and oversized bulk selections', async () => {
    const empty = plainToInstance(IdsDto, { ids: [] });
    const oversized = plainToInstance(IdsDto, {
      ids: Array.from({ length: 501 }, (_, index) => `product-${index}`),
    });

    expect(await validate(empty)).not.toHaveLength(0);
    expect(await validate(oversized)).not.toHaveLength(0);
  });

  it('turns empty optional product fields into null and keeps omitted ones undefined', async () => {
    const update = plainToInstance(UpdateProductDto, {
      expectedUpdatedAt: '2026-09-24T10:00:00.000Z',
      description: '',
      shortDescription: null,
      pistonDiameterMm: '',
      maxPressureMpa: null,
      strokeMm: '250',
    });

    await expect(validate(update)).resolves.toHaveLength(0);
    expect(update).toMatchObject({
      description: null,
      shortDescription: null,
      pistonDiameterMm: null,
      maxPressureMpa: null,
      strokeMm: 250,
    });
    expect(update.name).toBeUndefined();
    expect(update.price).toBeUndefined();
  });

  it('rejects null for required product columns and out-of-range numbers', async () => {
    const update = plainToInstance(UpdateProductDto, {
      expectedUpdatedAt: '2026-09-24T10:00:00.000Z',
      name: null,
      sku: null,
      categoryId: null,
      price: null,
      stockQuantity: null,
      isActive: null,
      maxPressureMpa: 10_000,
      nominalPressureMpa: 1.005,
      strokeMm: 100_001,
    });
    const product = plainToInstance(ProductDto, {
      sku: 'SKU',
      name: 'Name',
      categoryId: 'category',
      price: 10_000_000_000,
    });

    expect((await validate(update)).map((error) => error.property).sort()).toEqual(
      [
        'categoryId',
        'isActive',
        'maxPressureMpa',
        'name',
        'nominalPressureMpa',
        'price',
        'sku',
        'stockQuantity',
        'strokeMm',
      ].sort(),
    );
    expect((await validate(product)).map((error) => error.property)).toEqual(['price']);
  });

  it('requires the version of the edited product', async () => {
    const missing = plainToInstance(UpdateProductDto, { name: 'Новое' });
    const malformed = plainToInstance(UpdateProductDto, {
      name: 'Новое',
      expectedUpdatedAt: 'вчера',
    });

    expect((await validate(missing)).map((error) => error.property)).toEqual(['expectedUpdatedAt']);
    expect((await validate(malformed)).map((error) => error.property)).toEqual([
      'expectedUpdatedAt',
    ]);
  });

  it('bounds stock deltas so the database column cannot overflow', async () => {
    const valid = plainToInstance(StockDto, { delta: -5 });
    const absolute = plainToInstance(StockDto, { stockQuantity: 5 });
    const huge = plainToInstance(BulkStockDto, { ids: ['p-1'], delta: 3_000_000_000 });

    await expect(validate(valid)).resolves.toHaveLength(0);
    expect((await validate(absolute)).map((error) => error.property)).toEqual(['delta']);
    expect((await validate(huge)).map((error) => error.property)).toEqual(['delta']);
  });

  it('allows a partial category update that clears the parent', async () => {
    const update = plainToInstance(UpdateCategoryDto, { parentId: null, description: '' });
    const renamed = plainToInstance(UpdateCategoryDto, { name: null });

    await expect(validate(update)).resolves.toHaveLength(0);
    expect(update).toMatchObject({ parentId: null, description: null });
    expect(update.name).toBeUndefined();
    expect((await validate(renamed)).map((error) => error.property)).toEqual(['name']);
  });
});
