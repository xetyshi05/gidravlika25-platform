import {
  catalogImagePublicUrl,
  normalizeCatalogImageKey,
  resolveCatalogImagePath,
} from './catalog-image-path';

describe('catalog image paths', () => {
  const publicUrl = 'https://s3.example/bucket';

  it('normalizes only managed, traversal-safe object keys', () => {
    expect(normalizeCatalogImageKey('catalog/100001.webp')).toBe('catalog/100001.webp');
    expect(normalizeCatalogImageKey('site/gallery/photo.webp')).toBe('site/gallery/photo.webp');
    expect(normalizeCatalogImageKey('products/product-1/image.webp')).toBe(
      'products/product-1/image.webp',
    );
    expect(normalizeCatalogImageKey('../catalog/image.webp')).toBeNull();
    expect(normalizeCatalogImageKey('catalog/../secret')).toBeNull();
    expect(normalizeCatalogImageKey('https://s3.example/image.webp')).toBeNull();
  });

  it('builds a public URL without storing the origin in the product', () => {
    expect(catalogImagePublicUrl('catalog/100001.webp', `${publicUrl}/`)).toBe(
      `${publicUrl}/catalog/100001.webp`,
    );
  });

  it('URL-encodes S3 object key segments', () => {
    expect(catalogImagePublicUrl('site/gallery/photo 01.webp', publicUrl)).toBe(
      'https://s3.example/bucket/site/gallery/photo%2001.webp',
    );
  });

  it('adds no cache-busting query: every image version has its own key', () => {
    // The Next.js image optimizer rejects remote URLs with a query string (WEB-07).
    expect(catalogImagePublicUrl('catalog/p-1/3f1c.webp', publicUrl)).toBe(
      'https://s3.example/bucket/catalog/p-1/3f1c.webp',
    );
  });

  it('supports non-Latin article numbers without allowing traversal', () => {
    expect(normalizeCatalogImageKey('catalog/ГЦ 50-200.webp')).toBe('catalog/ГЦ 50-200.webp');
    expect(catalogImagePublicUrl('catalog/ГЦ 50-200.webp', publicUrl)).toBe(
      'https://s3.example/bucket/catalog/%D0%93%D0%A6%2050-200.webp',
    );
  });

  it('serves product images only from the configured S3 public URL', () => {
    expect(resolveCatalogImagePath('catalog/100001.webp', publicUrl)).toBe(
      `${publicUrl}/catalog/100001.webp`,
    );
    expect(resolveCatalogImagePath('products/product-1/image.webp', publicUrl)).toBe(
      `${publicUrl}/products/product-1/image.webp`,
    );
    expect(resolveCatalogImagePath(null, publicUrl)).toBeNull();
  });
});
