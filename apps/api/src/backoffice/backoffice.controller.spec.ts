import { BackofficeController } from './backoffice.controller';
import { BackofficeService } from './backoffice.service';
import { CatalogCacheInvalidationService } from './catalog-cache-invalidation.service';
import { CatalogImagesService } from './catalog-images.service';
import { ServerResourcesService } from './server-resources.service';
import { BackofficeActivityService } from './backoffice-activity.service';

const request = {
  backofficeUser: { id: 'admin-1', name: 'Admin', login: 'admin', role: 'ADMIN' as const },
};

function setup(backoffice: Record<string, jest.Mock>, images: Record<string, jest.Mock> = {}) {
  const catalogCache = { invalidate: jest.fn().mockResolvedValue(true) };
  const controller = new BackofficeController(
    backoffice as unknown as BackofficeService,
    {} as BackofficeActivityService,
    images as unknown as CatalogImagesService,
    catalogCache as unknown as CatalogCacheInvalidationService,
    {} as ServerResourcesService,
  );
  return { controller, catalogCache };
}

describe('BackofficeController catalog cache', () => {
  it('invalidates the public catalog cache after settings are committed with their audit', async () => {
    const settings = { lowStockThreshold: 3, showOutOfStock: false, showPrices: false };
    const updateSettings = jest.fn().mockResolvedValue(settings);
    const { controller, catalogCache } = setup({ updateSettings });

    await expect(controller.updateSettings(settings, request)).resolves.toEqual(settings);
    expect(updateSettings).toHaveBeenCalledWith(settings, 'admin-1');
    expect(catalogCache.invalidate).toHaveBeenCalledTimes(1);
    expect(updateSettings.mock.invocationCallOrder[0]).toBeLessThan(
      catalogCache.invalidate.mock.invocationCallOrder[0],
    );
  });

  it('keeps the cache when the mutation or its audit record fails', async () => {
    const failure = new Error('audit table unavailable');
    const { controller, catalogCache } = setup({
      adjustStock: jest.fn().mockRejectedValue(failure),
    });

    await expect(controller.stock('p-1', { delta: 1 }, request)).rejects.toBe(failure);
    expect(catalogCache.invalidate).not.toHaveBeenCalled();
  });
});

describe('BackofficeController product deletion', () => {
  const files = [
    { location: 'PUBLIC_BUCKET', key: 'catalog/p-1/a.webp' },
    { location: 'ORIGINALS', key: 'catalog/p-1/a.png' },
  ];

  it('removes queued files after the products are deleted without exposing them', async () => {
    const deleteProducts = jest.fn().mockResolvedValue({ deleted: 1, files });
    const catalogImages = { cleanUpAfterCommit: jest.fn().mockResolvedValue(undefined) };
    const { controller, catalogCache } = setup({ deleteProducts }, catalogImages);

    await expect(controller.deleteProduct('p-1', request)).resolves.toEqual({ deleted: 1 });
    await expect(controller.deleteProducts({ ids: ['p-1'] }, request)).resolves.toEqual({
      deleted: 1,
    });
    expect(deleteProducts).toHaveBeenCalledWith(['p-1'], 'admin-1');
    expect(catalogImages.cleanUpAfterCommit).toHaveBeenCalledTimes(2);
    expect(catalogImages.cleanUpAfterCommit).toHaveBeenCalledWith(files);
    expect(catalogCache.invalidate).toHaveBeenCalledTimes(2);
  });

  it('keeps stored images when the database deletion fails', async () => {
    const failure = new Error('foreign key violation');
    const catalogImages = { cleanUpAfterCommit: jest.fn() };
    const { controller } = setup(
      { deleteProducts: jest.fn().mockRejectedValue(failure) },
      catalogImages,
    );

    await expect(controller.deleteProduct('p-1', request)).rejects.toBe(failure);
    expect(catalogImages.cleanUpAfterCommit).not.toHaveBeenCalled();
  });
});
