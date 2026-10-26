import { Prisma, StoredFileLocation } from '@prisma/client';

export type StoredFile = { location: StoredFileLocation; key: string };

/**
 * Keys the API generates itself: `catalog/<product id>/<uuid>.<ext>` and
 * `site/<section>/<uuid>.<ext>`. Only such files may be removed by the
 * reconciler; SKU- or position-named files may be waiting for a manual
 * synchronization and are only reported.
 */
const GENERATED_KEY =
  /^(?:catalog\/[A-Za-z0-9_-]+|site\/(?:hero|gallery|main-gallery))\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:webp|png|jpe?g)$/;
/** Temporary file of an interrupted atomic write of an original (`<key>.<uuid>.part`). */
const PARTIAL_ORIGINAL = /\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.part$/;

export function isGeneratedMediaKey(key: string) {
  return GENERATED_KEY.test(key);
}

export function isPartialOriginal(key: string) {
  return PARTIAL_ORIGINAL.test(key);
}

export function productFiles(
  images: Array<{ imageKey: string | null; imageOriginalKey: string | null }>,
): StoredFile[] {
  return images.flatMap(({ imageKey, imageOriginalKey }) => [
    ...(imageKey ? [{ location: StoredFileLocation.PUBLIC_BUCKET, key: imageKey }] : []),
    ...(imageOriginalKey
      ? [{ location: StoredFileLocation.ORIGINALS, key: imageOriginalKey }]
      : []),
  ]);
}

/**
 * Records files that the current transaction stops referencing. The rows
 * commit or roll back together with the change, so a file is never forgotten
 * when the post-commit deletion fails or the process stops before it.
 */
export async function enqueueStorageCleanup(
  tx: Pick<Prisma.TransactionClient, 'storageCleanup'>,
  files: StoredFile[],
  reason: string,
) {
  if (!files.length) return;
  await tx.storageCleanup.createMany({
    data: files.map((file) => ({ ...file, reason })),
    skipDuplicates: true,
  });
}
