const MANAGED_ROOTS = new Set(['catalog', 'products', 'site']);

export function normalizeCatalogImageKey(value: string | null | undefined): string | null {
  if (
    !value ||
    value.startsWith('/') ||
    value.includes('\\') ||
    [...value].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127;
    })
  ) {
    return null;
  }

  const segments = value.split('/');
  if (
    segments.length < 2 ||
    !MANAGED_ROOTS.has(segments[0]) ||
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    return null;
  }

  return value;
}

/**
 * Public URL of an image object. Every version of an image is stored under a
 * new key (MEDIA-01, MEDIA-02), so the URL needs no cache-busting query: the
 * object is cached as immutable, and the Next.js image optimizer only accepts
 * URLs without a query string (WEB-07).
 */
export function catalogImagePublicUrl(
  imageKey: string | null | undefined,
  publicUrl: string | null | undefined,
): string | null {
  const normalizedKey = normalizeCatalogImageKey(imageKey);
  if (!normalizedKey || !publicUrl) return null;
  const encodedKey = normalizedKey.split('/').map(encodeURIComponent).join('/');
  return `${publicUrl.replace(/\/$/, '')}/${encodedKey}`;
}

export function resolveCatalogImagePath(
  imageKey: string | null,
  publicUrl: string | undefined,
): string | null {
  return catalogImagePublicUrl(imageKey, publicUrl);
}
