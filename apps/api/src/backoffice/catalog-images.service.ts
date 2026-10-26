import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createHash, randomUUID } from 'node:crypto';
import { constants as fileAccess } from 'node:fs';
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  rmdir,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import sharp from 'sharp';
import { Prisma, SiteMedia as SiteMediaRecord, StoredFileLocation } from '@prisma/client';
import { catalogImagePublicUrl, normalizeCatalogImageKey } from '../catalog/catalog-image-path';
import { PrismaService } from '../prisma/prisma.service';
import {
  enqueueStorageCleanup,
  isGeneratedMediaKey,
  isPartialOriginal,
  productFiles,
  type StoredFile,
} from './storage-cleanup';

export const CATALOG_IMAGE_MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
export const CATALOG_IMAGE_MAX_INPUT_PIXELS = 25_000_000;
export const CATALOG_IMAGE_MAX_INPUT_DIMENSION = 8_000;
export const CATALOG_IMAGE_MAX_OUTPUT_DIMENSION = 2_400;
const CATALOG_IMAGE_MIN_PADDING = 8;
const CATALOG_IMAGE_PADDING_RATIO = 0.04;
const DEFAULT_S3_REQUEST_TIMEOUT_MS = 15_000;
const MAX_BACKGROUND_REMOVAL_OUTPUT_BYTES = 32 * 1024 * 1024;
const PREPARED_IMAGE_TTL_MS = 30 * 60_000;
const PREPARED_IMAGE_MAX_ENTRIES = 10;
/** Keys are never overwritten (a new version gets a new key), so objects never change. */
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const STORAGE_CLEANUP_BATCH_SIZE = 100;
const STORAGE_CLEANUP_MAX_BACKOFF_MS = 6 * 60 * 60_000;
/** Public objects managed by the API; anything else in the bucket is never touched. */
const MANAGED_PUBLIC_PREFIXES = ['catalog/', 'products/', 'site/'];

type SupportedImageFormat = 'jpeg' | 'png' | 'webp';
type CatalogImageStorage = {
  bucket: string;
  publicUrl: string;
  client: S3Client;
};
type SiteMediaKind = 'HERO' | 'GALLERY' | 'MAIN_GALLERY';
export type SiteMediaCrop = { x: number; y: number; width: number; height: number };
export type MediaStorageGroupStatus = {
  total: number;
  originalsPresent: number;
  publicImagesPresent: number;
  ready: number;
  missingOriginals: number;
  missingPublicImages: number;
};
export type MediaStorageStatus = {
  checkedAt: string;
  site: MediaStorageGroupStatus;
  catalog: MediaStorageGroupStatus;
};
export type SiteMediaOriginalsImportResult = {
  imported: number;
  alreadyPresent: number;
  notMatched: string[];
  ambiguous: string[];
  duplicates: string[];
};
export type OriginalsStorageSynchronizationResult = {
  linked: number;
  alreadyLinked: number;
  ambiguous: string[];
};
export type StorageCleanupReport = { removed: number; kept: number; failed: number };
export type StorageReconciliationReport = {
  dryRun: boolean;
  orphaned: { publicBucket: number; originals: number };
  /** Unreferenced SKU- or position-named files: kept for a manual synchronization. */
  unmanaged: { publicBucket: number; originals: number };
  missing: { publicBucket: number; originals: number };
  cleanup: StorageCleanupReport;
};
type StoredObject = { key: string; modifiedAt: Date | null };
type SiteMediaInput = { kind: string; alt: string; title?: string; crop?: SiteMediaCrop };
type SiteMediaUpdate = {
  isActive?: boolean;
  kind?: string;
  position?: number;
};

@Injectable()
export class CatalogImagesService implements OnModuleDestroy {
  private readonly logger = new Logger(CatalogImagesService.name);
  private storageInstance?: CatalogImageStorage;
  /** Preview results by SHA-256 of the source file, so saving does not run rembg twice. */
  private readonly preparedImages = new Map<string, { image: Buffer; expiresAt: number }>();

  constructor(private readonly prisma: PrismaService) {}

  onModuleDestroy() {
    this.storageInstance?.client.destroy();
  }

  async preview(file: Express.Multer.File) {
    this.validateFileSize(file);
    const sourceFormat = await this.validateImage(file.buffer);
    const image = await this.prepareCatalogImage(file.buffer, sourceFormat);
    this.rememberPreparedImage(file.buffer, image);
    return image;
  }

  async mediaStorageStatus(): Promise<MediaStorageStatus> {
    const storage = this.storage();
    const [siteMedia, catalogMedia, catalogKeys, siteKeys] = await Promise.all([
      this.prisma.siteMedia.findMany({ select: { imageKey: true, originalKey: true } }),
      this.prisma.product.findMany({
        where: { imageKey: { not: null } },
        select: { imageKey: true, imageOriginalKey: true },
      }),
      this.storageObjectKeys(storage, 'catalog/'),
      this.storageObjectKeys(storage, 'site/'),
    ]);
    const [site, catalog] = await Promise.all([
      this.storageGroupStatus(siteMedia, siteKeys),
      this.storageGroupStatus(
        catalogMedia.map((item) => ({
          imageKey: item.imageKey,
          originalKey: item.imageOriginalKey,
        })),
        catalogKeys,
      ),
    ]);
    return { checkedAt: new Date().toISOString(), site, catalog };
  }

  async importSiteMediaOriginals(
    files: Express.Multer.File[],
  ): Promise<SiteMediaOriginalsImportResult> {
    if (!files.length) throw new BadRequestException('Выберите хотя бы один файл.');
    const prepared = await Promise.all(
      files.map(async (file) => ({ file, format: await this.validateUploadedImage(file) })),
    );
    const media = await this.prisma.siteMedia.findMany({
      select: { id: true, kind: true, imageKey: true, originalKey: true, position: true },
    });
    const byFilename = new Map<string, typeof media>();
    for (const item of media) {
      const filename = this.imageFilename(item.imageKey);
      const matches = byFilename.get(filename) ?? [];
      matches.push(item);
      byFilename.set(filename, matches);
    }

    const result: SiteMediaOriginalsImportResult = {
      imported: 0,
      alreadyPresent: 0,
      notMatched: [],
      ambiguous: [],
      duplicates: [],
    };
    const processedIds = new Set<string>();
    for (const { file, format } of prepared) {
      const filename = this.imageFilename(file.originalname);
      const matches = byFilename.get(filename) ?? [];
      if (!matches.length) {
        result.notMatched.push(file.originalname);
        continue;
      }
      if (matches.length > 1) {
        result.ambiguous.push(file.originalname);
        continue;
      }
      const item = matches[0];
      if (!item || processedIds.has(item.id)) {
        result.duplicates.push(file.originalname);
        continue;
      }
      processedIds.add(item.id);

      if (await this.originalExists(item.originalKey)) {
        result.alreadyPresent += 1;
        continue;
      }
      const { originalKey } = this.newSiteMediaKeys(item.kind, format);
      await this.storeOriginal(originalKey, file.buffer);
      try {
        const updated = await this.prisma.siteMedia.updateMany({
          where: { id: item.id, originalKey: item.originalKey },
          data: { originalKey },
        });
        if (updated.count !== 1)
          throw new ConflictException(
            `Оригинал фото ${file.originalname} уже изменился. Обновите страницу и повторите импорт.`,
          );
      } catch (error) {
        await this.deleteOriginalAfterFailure(originalKey, 'site originals import rollback');
        throw error;
      }
      result.imported += 1;
    }
    return result;
  }

  async importCatalogImageOriginals(
    files: Express.Multer.File[],
  ): Promise<SiteMediaOriginalsImportResult> {
    if (!files.length) throw new BadRequestException('Выберите хотя бы один файл.');
    const prepared = await Promise.all(
      files.map(async (file) => ({ file, format: await this.validateUploadedImage(file) })),
    );
    const products = await this.prisma.product.findMany({
      where: { imageKey: { not: null } },
      select: { id: true, sku: true, imageOriginalKey: true },
    });
    const bySku = new Map<string, (typeof products)[number]>();
    const conflictingSkus = new Set<string>();
    for (const product of products) {
      const sku = product.sku.trim();
      if (bySku.has(sku)) conflictingSkus.add(sku);
      bySku.set(sku, product);
    }
    const caseInsensitiveSkus = new Set(
      products.map((product) => product.sku.trim().toLowerCase()),
    );
    const result: SiteMediaOriginalsImportResult = {
      imported: 0,
      alreadyPresent: 0,
      notMatched: [],
      ambiguous: [],
      duplicates: [],
    };
    const processedIds = new Set<string>();
    for (const { file, format } of prepared) {
      const sku = this.imageBasename(file.originalname);
      const product = conflictingSkus.has(sku) ? undefined : bySku.get(sku);
      if (!product) {
        // SKUs are case-sensitive: `ABC` and `abc` are different products, so a
        // name that only matches when ignoring case must be fixed by the admin.
        if (caseInsensitiveSkus.has(sku.toLowerCase())) result.ambiguous.push(file.originalname);
        else result.notMatched.push(file.originalname);
        continue;
      }
      if (processedIds.has(product.id)) {
        result.duplicates.push(file.originalname);
        continue;
      }
      processedIds.add(product.id);

      if (await this.originalExists(product.imageOriginalKey)) {
        result.alreadyPresent += 1;
        continue;
      }
      const originalKey = `catalog/${product.id}/${randomUUID()}.${format}`;
      await this.storeOriginal(originalKey, file.buffer);
      try {
        const updated = await this.prisma.product.updateMany({
          where: { id: product.id, imageOriginalKey: product.imageOriginalKey },
          data: { imageOriginalKey: originalKey },
        });
        if (updated.count !== 1)
          throw new ConflictException(
            `Оригинал товара ${product.sku} уже изменился. Обновите страницу и повторите импорт.`,
          );
      } catch (error) {
        await this.deleteOriginalAfterFailure(originalKey, 'catalog originals import rollback');
        throw error;
      }
      result.imported += 1;
    }
    return result;
  }

  /**
   * Links originals already copied to the private server directory (for example
   * via SFTP) with the database records. No public S3 object is changed here.
   */
  async synchronizeOriginalsFromStorage(): Promise<OriginalsStorageSynchronizationResult> {
    const storage = this.storage();
    await this.synchronizeExistingSiteMedia(storage);
    const [siteMedia, products] = await Promise.all([
      this.prisma.siteMedia.findMany({
        select: { id: true, kind: true, position: true, originalKey: true },
      }),
      this.prisma.product.findMany({
        where: { imageKey: { not: null } },
        select: { id: true, sku: true, imageOriginalKey: true },
      }),
    ]);
    const result: OriginalsStorageSynchronizationResult = {
      linked: 0,
      alreadyLinked: 0,
      ambiguous: [],
    };

    const linkedSiteOriginals = new Set(
      siteMedia.flatMap((media) => (media.originalKey ? [media.originalKey] : [])),
    );
    for (const media of siteMedia) {
      // Position-based names (main-1, about-N, gallery-N) only fill in missing
      // originals and never replace one that is already on disk.
      if (await this.originalExists(media.originalKey)) {
        result.alreadyLinked += 1;
        continue;
      }
      const kind = this.siteMediaKind(media.kind);
      const base = `${this.siteMediaDirectory(kind)}/${this.siteMediaFilename(kind, media.position)}`;
      const match = await this.findOriginalByBase(base);
      if (match.ambiguous || (match.key && linkedSiteOriginals.has(match.key))) {
        result.ambiguous.push(base);
        continue;
      }
      if (!match.key || (await this.queuedForCleanup(StoredFileLocation.ORIGINALS, match.key)))
        continue;
      const updated = await this.prisma.siteMedia.updateMany({
        where: { id: media.id, originalKey: media.originalKey },
        data: { originalKey: match.key },
      });
      if (updated.count !== 1) continue;
      linkedSiteOriginals.add(match.key);
      result.linked += 1;
    }

    const linkedOriginals = new Set(
      products.flatMap((product) => (product.imageOriginalKey ? [product.imageOriginalKey] : [])),
    );
    for (const product of products) {
      // A product whose original is already on disk keeps it: files named by SKU
      // only fill in missing originals and never replace an uploaded one.
      if (await this.originalExists(product.imageOriginalKey)) {
        result.alreadyLinked += 1;
        continue;
      }
      const sku = this.catalogFilenameSku(product.sku);
      if (!sku) continue;
      const base = `catalog/${sku}`;
      const match = await this.findOriginalByBase(base, true);
      if (match.ambiguous || (match.key && linkedOriginals.has(match.key))) {
        result.ambiguous.push(base);
        continue;
      }
      if (!match.key || (await this.queuedForCleanup(StoredFileLocation.ORIGINALS, match.key)))
        continue;
      const updated = await this.prisma.product.updateMany({
        where: { id: product.id, imageOriginalKey: product.imageOriginalKey },
        data: { imageOriginalKey: match.key },
      });
      if (updated.count !== 1) continue;
      linkedOriginals.add(match.key);
      result.linked += 1;
    }
    return result;
  }

  /** Reads only the database, so a public request never lists or writes S3. */
  async siteMedia(includeInactive = false) {
    const publicUrl = process.env.S3_PUBLIC_URL?.trim();
    const media = await this.prisma.siteMedia.findMany({
      where: includeInactive ? undefined : { isActive: true },
      select: {
        id: true,
        kind: true,
        imageKey: true,
        alt: true,
        title: true,
        position: true,
        isActive: true,
        originalKey: true,
      },
      orderBy: [{ kind: 'asc' }, { position: 'asc' }],
    });
    return media.flatMap(({ originalKey, ...item }) => {
      const imagePath = catalogImagePublicUrl(item.imageKey, publicUrl);
      return imagePath ? [{ ...item, hasOriginal: Boolean(originalKey), imagePath }] : [];
    });
  }

  async uploadSiteMedia(file: Express.Multer.File, input: SiteMediaInput) {
    this.validateFileSize(file);
    const kind = this.siteMediaKind(input.kind);
    const alt = input.alt.trim();
    if (!alt || alt.length > 160)
      throw new BadRequestException('Укажите описание изображения до 160 символов.');
    const title = input.title?.trim() || null;
    if (title && title.length > 120)
      throw new BadRequestException('Название изображения не должно превышать 120 символов.');
    const sourceFormat = await this.validateImage(file.buffer);
    const storage = this.storage();
    const { imageKey, originalKey } = this.newSiteMediaKeys(kind, sourceFormat);

    let uploadStarted = false;
    let committed: { media: SiteMediaRecord; replaced: SiteMediaRecord[] };
    try {
      await this.storeOriginal(originalKey, file.buffer);
      const image = await this.toSiteWebp(
        input.crop ? await this.cropSiteImage(file.buffer, input.crop) : file.buffer,
        kind,
      );
      uploadStarted = true;
      await this.putSiteImage(storage, imageKey, image);
      committed = await this.withSiteMediaLock(kind, async (tx) => {
        if (kind === 'HERO') {
          // The site shows exactly one hero: replace the current one and drop
          // any duplicates left by older versions.
          const [current, ...duplicates] = await tx.siteMedia.findMany({
            where: { kind: 'HERO' },
            orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
          });
          if (current) {
            if (duplicates.length)
              await tx.siteMedia.deleteMany({
                where: { id: { in: duplicates.map((item) => item.id) } },
              });
            const media = await tx.siteMedia.update({
              where: { id: current.id },
              data: { imageKey, originalKey, alt, title, position: 0, isActive: true },
            });
            return { media, replaced: [current, ...duplicates] };
          }
        }
        const last = await tx.siteMedia.aggregate({ where: { kind }, _max: { position: true } });
        const position = kind === 'HERO' ? 0 : (last._max.position ?? -1) + 1;
        const media = await tx.siteMedia.create({
          data: { kind, imageKey, originalKey, alt, title, position },
        });
        return { media, replaced: [] };
      });
    } catch (error) {
      if (uploadStarted)
        await this.deleteAfterFailure(storage, imageKey, 'new site image rollback');
      await this.deleteOriginalAfterFailure(originalKey, 'new site original rollback');
      throw error;
    }

    for (const previous of committed.replaced)
      await this.deleteUnreferencedSiteFiles(storage, previous, 'replaced hero cleanup');
    return this.siteMediaResponse(committed.media, storage);
  }

  async deleteSiteMedia(id: string) {
    const media = await this.prisma.siteMedia.findUnique({ where: { id } });
    if (!media) throw new NotFoundException('Изображение не найдено.');
    if (media.kind === 'HERO')
      throw new BadRequestException(
        'Главное фото нельзя удалить. Замените его новым изображением.',
      );
    const storage = this.storage();
    await this.withSiteMediaLock(media.kind, async (tx) => {
      const deleted = await tx.siteMedia.deleteMany({ where: { id } });
      if (deleted.count !== 1) throw new NotFoundException('Изображение не найдено.');
      await this.applySiteMediaOrder(
        tx,
        await tx.siteMedia.findMany({
          where: { kind: media.kind },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        }),
      );
    });
    await this.deleteUnreferencedSiteFiles(storage, media, 'site image deletion');
    return { ok: true };
  }

  async replaceSiteMedia(id: string, file: Express.Multer.File, crop?: SiteMediaCrop) {
    this.validateFileSize(file);
    const media = await this.prisma.siteMedia.findUnique({ where: { id } });
    if (!media) throw new NotFoundException('Изображение не найдено.');
    const sourceFormat = await this.validateImage(file.buffer);
    const storage = this.storage();
    const { imageKey, originalKey } = this.newSiteMediaKeys(media.kind, sourceFormat);

    let uploadStarted = false;
    let updated: SiteMediaRecord;
    try {
      await this.storeOriginal(originalKey, file.buffer);
      const image = await this.toSiteWebp(
        crop ? await this.cropSiteImage(file.buffer, crop) : file.buffer,
        media.kind,
      );
      uploadStarted = true;
      await this.putSiteImage(storage, imageKey, image);
      updated = await this.commitSiteMediaVersion(media, { imageKey, originalKey });
    } catch (error) {
      if (uploadStarted)
        await this.deleteAfterFailure(storage, imageKey, 'new site image rollback');
      await this.deleteOriginalAfterFailure(originalKey, 'new site original rollback');
      throw error;
    }

    await this.deleteUnreferencedSiteFiles(storage, media, 'replaced site image cleanup');
    return this.siteMediaResponse(updated, storage);
  }

  async updateSiteMedia(id: string, input: SiteMediaUpdate) {
    const media = await this.prisma.siteMedia.findUnique({ where: { id } });
    if (!media) throw new NotFoundException('Изображение не найдено.');
    if (media.kind === 'HERO')
      throw new BadRequestException('Главное фото можно только заменить новым изображением.');
    const kind = input.kind ? this.siteMediaKind(input.kind) : media.kind;
    if (kind !== media.kind)
      throw new BadRequestException('Фото нельзя переносить между разделами.');

    // Positions live only in the database, so a reorder never renames objects.
    await this.withSiteMediaLock(media.kind, async (tx) => {
      const current = await tx.siteMedia.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Изображение не найдено.');
      if (input.isActive !== undefined && input.isActive !== current.isActive)
        await tx.siteMedia.update({ where: { id }, data: { isActive: input.isActive } });
      const ordered = await tx.siteMedia.findMany({
        where: { kind: current.kind, id: { not: id } },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      });
      const requested = input.position ?? current.position;
      ordered.splice(Math.min(Math.max(requested, 0), ordered.length), 0, current);
      await this.applySiteMediaOrder(tx, ordered);
    });
    return this.siteMedia(true);
  }

  async cropSiteMedia(id: string, crop: SiteMediaCrop) {
    const media = await this.prisma.siteMedia.findUnique({ where: { id } });
    if (!media) throw new NotFoundException('Изображение не найдено.');
    const storage = this.storage();
    const source = await this.siteMediaSourceBuffer(media);
    const { imageKey } = this.newSiteMediaKeys(media.kind, 'webp');

    let uploadStarted = false;
    let updated: SiteMediaRecord;
    try {
      const image = await this.toSiteWebp(await this.cropSiteImage(source, crop), media.kind);
      uploadStarted = true;
      await this.putSiteImage(storage, imageKey, image);
      updated = await this.commitSiteMediaVersion(media, {
        imageKey,
        originalKey: media.originalKey,
      });
    } catch (error) {
      if (uploadStarted)
        await this.deleteAfterFailure(storage, imageKey, 'cropped site image rollback');
      throw error;
    }

    await this.deleteUnreferencedSiteFiles(
      storage,
      { imageKey: media.imageKey, originalKey: null },
      'cropped site image cleanup',
    );
    return this.siteMediaResponse(updated, storage);
  }

  async siteMediaSource(id: string) {
    const media = await this.prisma.siteMedia.findUnique({ where: { id } });
    if (!media) throw new NotFoundException('Изображение не найдено.');
    const buffer = await this.siteMediaSourceBuffer(media);
    const metadata = await sharp(buffer).metadata();
    const format = metadata.format === 'png' ? 'png' : metadata.format === 'webp' ? 'webp' : 'jpeg';
    return { buffer, contentType: `image/${format}` };
  }

  /** `onCommit` runs in the transaction that switches the image keys (the audit record). */
  async uploadMain(
    productId: string,
    file: Express.Multer.File,
    onCommit?: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ) {
    this.validateFileSize(file);
    const sourceFormat = await this.validateImage(file.buffer);
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, imageKey: true, imageOriginalKey: true },
    });
    if (!product) throw new NotFoundException('Товар не найден.');

    // Every version gets its own keys, so a failed attempt can only ever remove
    // objects it created itself and never the image that is currently published.
    const version = randomUUID();
    const key = `catalog/${product.id}/${version}.webp`;
    const originalKey = `catalog/${product.id}/${version}.${sourceFormat}`;
    const storage = this.storage();
    const imagePath = catalogImagePublicUrl(key, storage.publicUrl);
    if (!imagePath) throw new Error('Could not construct the catalog image URL.');
    const replaced = productFiles([product]);

    let uploadStarted = false;
    try {
      await this.storeOriginal(originalKey, file.buffer);
      const image =
        this.preparedImage(file.buffer) ??
        (await this.prepareCatalogImage(file.buffer, sourceFormat));
      uploadStarted = true;
      await storage.client.send(
        new PutObjectCommand({
          Bucket: storage.bucket,
          Key: key,
          Body: image,
          ContentType: 'image/webp',
          ContentDisposition: 'inline',
          CacheControl: IMMUTABLE_CACHE_CONTROL,
        }),
        { abortSignal: AbortSignal.timeout(this.requestTimeout()) },
      );
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.product.updateMany({
          where: {
            id: product.id,
            imageKey: product.imageKey,
            imageOriginalKey: product.imageOriginalKey,
          },
          data: { imageKey: key, imageOriginalKey: originalKey },
        });
        if (updated.count !== 1)
          throw new ConflictException(
            'Изображение товара уже изменилось. Обновите страницу и повторите попытку.',
          );
        await onCommit?.(tx);
        await enqueueStorageCleanup(tx, replaced, 'replaced product image');
      });
    } catch (error) {
      if (uploadStarted) await this.deleteAfterFailure(storage, key, 'new image rollback');
      await this.deleteOriginalAfterFailure(originalKey, 'new original rollback');
      throw error;
    }

    await this.cleanUpAfterCommit(replaced);

    return { imageKey: key, imagePath };
  }

  /** Reachability of the public bucket and the private originals directory (REL-03). */
  async probeStorage() {
    const [bucket, originals] = await Promise.allSettled([
      this.storage().client.send(
        new ListObjectsV2Command({
          Bucket: this.storage().bucket,
          Prefix: 'catalog/',
          MaxKeys: 1,
        }),
        { abortSignal: AbortSignal.timeout(Math.min(this.requestTimeout(), 5_000)) },
      ),
      access(this.originalsRoot(), fileAccess.W_OK),
    ]);
    return {
      bucket: bucket.status === 'fulfilled' ? null : this.errorMessage(bucket.reason),
      originals: originals.status === 'fulfilled' ? null : this.errorMessage(originals.reason),
    };
  }

  /**
   * Deletes files right after the commit that queued them. Never throws: the
   * queue rows stay, and the periodic cleanup retries what failed here.
   */
  async cleanUpAfterCommit(files: StoredFile[]) {
    try {
      await this.processStorageCleanup(files);
    } catch (error) {
      this.logger.error(`Deferred storage cleanup: ${this.errorMessage(error)}`);
    }
  }

  /**
   * Deletes files queued in `StorageCleanup` (all due rows, or only `files`
   * right after the commit that queued them). A file that a record references
   * again is kept; a failed deletion stays queued with a growing delay.
   */
  async processStorageCleanup(files?: StoredFile[]): Promise<StorageCleanupReport> {
    const report: StorageCleanupReport = { removed: 0, kept: 0, failed: 0 };
    if (files && !files.length) return report;
    const queued = await this.prisma.storageCleanup.findMany({
      where: files
        ? { OR: files.map(({ location, key }) => ({ location, key })) }
        : { nextAttemptAt: { lte: new Date() } },
      orderBy: { nextAttemptAt: 'asc' },
      take: STORAGE_CLEANUP_BATCH_SIZE,
    });
    for (const item of queued) {
      try {
        if (await this.isStoredFileReferenced(item)) report.kept += 1;
        else {
          await this.removeStoredFile(item);
          report.removed += 1;
        }
        await this.prisma.storageCleanup.deleteMany({
          where: { id: item.id, attempts: item.attempts },
        });
      } catch (error) {
        report.failed += 1;
        const message = this.errorMessage(error);
        this.logger.error(`Could not delete stored file ${item.location} ${item.key}: ${message}`);
        await this.prisma.storageCleanup.updateMany({
          where: { id: item.id },
          data: {
            attempts: { increment: 1 },
            lastError: message.slice(0, 500),
            nextAttemptAt: new Date(
              Date.now() + Math.min(60_000 * 2 ** item.attempts, STORAGE_CLEANUP_MAX_BACKOFF_MS),
            ),
          },
        });
      }
    }
    return report;
  }

  /**
   * Finds files that no record references and that are older than `graceMs`
   * (an upload in progress writes its files before the commit). Only keys the
   * API generated itself are queued for deletion; the rest is reported.
   */
  async reconcileStorage({
    dryRun,
    graceMs,
  }: {
    dryRun: boolean;
    graceMs: number;
  }): Promise<StorageReconciliationReport> {
    const storage = this.storage();
    const listed = await Promise.all(
      MANAGED_PUBLIC_PREFIXES.map((prefix) => this.storageObjects(storage, prefix)),
    );
    const publicObjects = listed.flat();
    const originals = await this.originalFiles();
    const [products, siteMedia, queued] = await Promise.all([
      this.prisma.product.findMany({ select: { imageKey: true, imageOriginalKey: true } }),
      this.prisma.siteMedia.findMany({ select: { imageKey: true, originalKey: true } }),
      this.prisma.storageCleanup.findMany({ select: { location: true, key: true } }),
    ]);
    const referencedPublic = new Set(
      [...products.map((item) => item.imageKey), ...siteMedia.map((item) => item.imageKey)].filter(
        (key): key is string => Boolean(key),
      ),
    );
    const referencedOriginals = new Set(
      [
        ...products.map((item) => item.imageOriginalKey),
        ...siteMedia.map((item) => item.originalKey),
      ].filter((key): key is string => Boolean(key)),
    );
    const alreadyQueued = new Set(queued.map((item) => `${item.location}:${item.key}`));
    const cutoff = Date.now() - graceMs;
    const orphans: StoredFile[] = [];
    const report: StorageReconciliationReport = {
      dryRun,
      orphaned: { publicBucket: 0, originals: 0 },
      unmanaged: { publicBucket: 0, originals: 0 },
      missing: { publicBucket: 0, originals: 0 },
      cleanup: { removed: 0, kept: 0, failed: 0 },
    };
    const classify = (
      location: StoredFileLocation,
      objects: StoredObject[],
      referenced: Set<string>,
      counter: 'publicBucket' | 'originals',
    ) => {
      for (const { key, modifiedAt } of objects) {
        if (referenced.has(key) || alreadyQueued.has(`${location}:${key}`)) continue;
        if (!modifiedAt || modifiedAt.getTime() > cutoff) continue;
        const removable =
          isGeneratedMediaKey(key) ||
          (location === StoredFileLocation.ORIGINALS && isPartialOriginal(key));
        if (!removable) {
          report.unmanaged[counter] += 1;
          continue;
        }
        report.orphaned[counter] += 1;
        orphans.push({ location, key });
      }
      const present = new Set(objects.map((item) => item.key));
      report.missing[counter] = [...referenced].filter((key) => !present.has(key)).length;
    };
    classify(StoredFileLocation.PUBLIC_BUCKET, publicObjects, referencedPublic, 'publicBucket');
    classify(StoredFileLocation.ORIGINALS, originals, referencedOriginals, 'originals');

    if (!dryRun && orphans.length) {
      await enqueueStorageCleanup(this.prisma, orphans, 'storage reconciliation');
      // Processed in batches; whatever is left is picked up by the regular cleanup.
      report.cleanup = await this.processStorageCleanup(
        orphans.slice(0, STORAGE_CLEANUP_BATCH_SIZE),
      );
    }
    return report;
  }

  private async isStoredFileReferenced({ location, key }: StoredFile) {
    const [products, siteMedia] =
      location === StoredFileLocation.PUBLIC_BUCKET
        ? await Promise.all([
            this.prisma.product.count({ where: { imageKey: key } }),
            this.prisma.siteMedia.count({ where: { imageKey: key } }),
          ])
        : await Promise.all([
            this.prisma.product.count({ where: { imageOriginalKey: key } }),
            this.prisma.siteMedia.count({ where: { originalKey: key } }),
          ]);
    return products + siteMedia > 0;
  }

  private async removeStoredFile({ location, key }: StoredFile) {
    if (location === StoredFileLocation.PUBLIC_BUCKET) {
      // Never delete outside the managed prefixes, whatever ended up in the queue.
      if (normalizeCatalogImageKey(key) !== key) {
        this.logger.warn(`Skipped cleanup of an unmanaged public key: ${key}`);
        return;
      }
      await this.deleteObject(this.storage(), key);
      return;
    }
    let path: string;
    try {
      path = this.originalFilePath(key);
    } catch {
      this.logger.warn(`Skipped cleanup of an invalid original key: ${key}`);
      return;
    }
    await rm(path, { force: true });
    if (isGeneratedMediaKey(key) && key.startsWith('catalog/')) {
      // `catalog/<product id>/` stays empty after the last version of a deleted product.
      await rmdir(dirname(path)).catch(() => undefined);
    }
  }

  /** True while a file waits for deletion, so a synchronization must not link it again. */
  private async queuedForCleanup(location: StoredFileLocation, key: string) {
    return (await this.prisma.storageCleanup.count({ where: { location, key } })) > 0;
  }

  private async originalFiles(): Promise<StoredObject[]> {
    const root = this.originalsRoot();
    const files: StoredObject[] = [];
    const walk = async (directory: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(directory, { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
      }
      for (const entry of entries) {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) await walk(path);
        else if (entry.isFile())
          files.push({
            key: relative(root, path).split(sep).join('/'),
            modifiedAt: (await stat(path)).mtime,
          });
      }
    };
    await walk(root);
    return files;
  }

  private async prepareCatalogImage(buffer: Buffer, format: SupportedImageFormat) {
    return this.toCatalogWebp(await this.removeBackground(buffer, format));
  }

  private rememberPreparedImage(source: Buffer, image: Buffer) {
    const now = Date.now();
    for (const [key, entry] of this.preparedImages)
      if (entry.expiresAt <= now) this.preparedImages.delete(key);
    const key = this.sourceHash(source);
    this.preparedImages.delete(key);
    this.preparedImages.set(key, { image, expiresAt: now + PREPARED_IMAGE_TTL_MS });
    while (this.preparedImages.size > PREPARED_IMAGE_MAX_ENTRIES) {
      const oldest = this.preparedImages.keys().next().value;
      if (oldest === undefined) break;
      this.preparedImages.delete(oldest);
    }
  }

  private preparedImage(source: Buffer) {
    const key = this.sourceHash(source);
    const entry = this.preparedImages.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.preparedImages.delete(key);
      return null;
    }
    return entry.image;
  }

  private sourceHash(source: Buffer) {
    return createHash('sha256').update(source).digest('hex');
  }

  private validateFileSize(file: Express.Multer.File) {
    if (!file.buffer?.length) throw new BadRequestException('Файл изображения пуст.');
    if (
      file.size > CATALOG_IMAGE_MAX_FILE_SIZE_BYTES ||
      file.buffer.length > CATALOG_IMAGE_MAX_FILE_SIZE_BYTES
    )
      throw new BadRequestException('Размер изображения не должен превышать 8 МБ.');
  }

  private async validateUploadedImage(file: Express.Multer.File) {
    this.validateFileSize(file);
    return this.validateImage(file.buffer);
  }

  private async validateImage(buffer: Buffer): Promise<SupportedImageFormat> {
    const signatureFormat = this.signatureFormat(buffer);
    if (!signatureFormat)
      throw new BadRequestException(
        'Содержимое файла не является изображением JPEG, PNG или WebP.',
      );

    try {
      const pipeline = sharp(buffer, {
        failOn: 'warning',
        limitInputPixels: CATALOG_IMAGE_MAX_INPUT_PIXELS,
        pages: 1,
      });
      const metadata = await pipeline.metadata();
      if (metadata.format !== signatureFormat)
        throw new BadRequestException('Формат изображения не соответствует содержимому файла.');
      if (!metadata.width || !metadata.height)
        throw new BadRequestException('Не удалось определить размеры изображения.');
      if (
        metadata.width > CATALOG_IMAGE_MAX_INPUT_DIMENSION ||
        metadata.height > CATALOG_IMAGE_MAX_INPUT_DIMENSION
      )
        throw new BadRequestException(
          'Ширина и высота изображения не должны превышать 8000 пикселей.',
        );
      if ((metadata.pages ?? 1) > 1)
        throw new BadRequestException('Анимированные изображения не поддерживаются.');

      return signatureFormat;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Изображение повреждено или превышает допустимое разрешение.');
    }
  }

  private async removeBackground(buffer: Buffer, format: SupportedImageFormat) {
    const workerUrl = this.backgroundRemovalUrl();
    let response: Response;
    try {
      response = await fetch(new URL('remove-background', workerUrl), {
        method: 'POST',
        headers: { 'Content-Type': `image/${format}` },
        body: new Uint8Array(buffer),
        signal: AbortSignal.timeout(this.requestTimeout() * 4),
      });
    } catch {
      throw new ServiceUnavailableException(
        'Сервис удаления фона недоступен. Повторите попытку через несколько минут.',
      );
    }
    if (!response.ok) {
      throw new ServiceUnavailableException('Сервис удаления фона не смог обработать изображение.');
    }
    const contentType = response.headers.get('content-type')?.split(';', 1)[0];
    if (contentType !== 'image/png') {
      throw new ServiceUnavailableException(
        'Сервис удаления фона вернул неподдерживаемый результат.',
      );
    }
    const result = Buffer.from(await response.arrayBuffer());
    if (!result.length || result.length > MAX_BACKGROUND_REMOVAL_OUTPUT_BYTES) {
      throw new ServiceUnavailableException(
        'Сервис удаления фона вернул слишком большой результат.',
      );
    }
    return result;
  }

  private async toCatalogWebp(buffer: Buffer): Promise<Buffer> {
    try {
      const pipeline = sharp(buffer, {
        failOn: 'warning',
        limitInputPixels: CATALOG_IMAGE_MAX_INPUT_PIXELS,
        pages: 1,
      }).rotate();
      const metadata = await pipeline.metadata();
      if (metadata.format !== 'png' || !metadata.width || !metadata.height)
        throw new BadRequestException('Сервис удаления фона вернул некорректное изображение.');
      if (
        metadata.width > CATALOG_IMAGE_MAX_INPUT_DIMENSION ||
        metadata.height > CATALOG_IMAGE_MAX_INPUT_DIMENSION
      )
        throw new BadRequestException(
          'Сервис удаления фона вернул изображение слишком большого размера.',
        );

      const trimmed = await pipeline
        .ensureAlpha()
        .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 10 })
        .toBuffer();
      const trimmedMetadata = await sharp(trimmed).metadata();
      if (!trimmedMetadata.width || !trimmedMetadata.height)
        throw new BadRequestException('После удаления фона объект не найден.');
      const horizontalPadding = Math.max(
        CATALOG_IMAGE_MIN_PADDING,
        Math.ceil(trimmedMetadata.width * CATALOG_IMAGE_PADDING_RATIO),
      );
      const verticalPadding = Math.max(
        CATALOG_IMAGE_MIN_PADDING,
        Math.ceil(trimmedMetadata.height * CATALOG_IMAGE_PADDING_RATIO),
      );
      const scale = Math.min(
        1,
        CATALOG_IMAGE_MAX_OUTPUT_DIMENSION /
          Math.max(
            trimmedMetadata.width + horizontalPadding * 2,
            trimmedMetadata.height + verticalPadding * 2,
          ),
      );
      const resizedWidth = Math.max(1, Math.round(trimmedMetadata.width * scale));
      const resizedHeight = Math.max(1, Math.round(trimmedMetadata.height * scale));
      const resizedHorizontalPadding = Math.max(1, Math.round(horizontalPadding * scale));
      const resizedVerticalPadding = Math.max(1, Math.round(verticalPadding * scale));

      return await sharp(trimmed)
        .resize({ width: resizedWidth, height: resizedHeight, fit: 'fill' })
        .extend({
          top: resizedVerticalPadding,
          bottom: resizedVerticalPadding,
          left: resizedHorizontalPadding,
          right: resizedHorizontalPadding,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .toColourspace('srgb')
        .webp({ quality: 88, alphaQuality: 90, effort: 6, smartSubsample: true })
        .toBuffer();
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Не удалось подготовить изображение товара.');
    }
  }

  private async cropSiteImage(buffer: Buffer, crop: SiteMediaCrop): Promise<Buffer> {
    const normalized = this.siteMediaCrop(crop);
    try {
      const rotated = await sharp(buffer, {
        failOn: 'warning',
        limitInputPixels: CATALOG_IMAGE_MAX_INPUT_PIXELS,
        pages: 1,
      })
        .rotate()
        .toBuffer();
      const metadata = await sharp(rotated).metadata();
      if (!metadata.width || !metadata.height)
        throw new BadRequestException('Не удалось определить размеры изображения.');
      const left = Math.floor(normalized.x * metadata.width);
      const top = Math.floor(normalized.y * metadata.height);
      const width = Math.max(1, Math.floor(normalized.width * metadata.width));
      const height = Math.max(1, Math.floor(normalized.height * metadata.height));
      if (left + width > metadata.width || top + height > metadata.height)
        throw new BadRequestException('Область кадрирования выходит за границы изображения.');
      return sharp(rotated).extract({ left, top, width, height }).toBuffer();
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Не удалось кадрировать изображение.');
    }
  }

  private siteMediaCrop(value: SiteMediaCrop): SiteMediaCrop {
    const values = [value.x, value.y, value.width, value.height];
    if (!values.every((item) => Number.isFinite(item)))
      throw new BadRequestException('Параметры кадрирования указаны некорректно.');
    if (
      value.x < 0 ||
      value.y < 0 ||
      value.width < 0.05 ||
      value.height < 0.05 ||
      value.x + value.width > 1.000001 ||
      value.y + value.height > 1.000001
    )
      throw new BadRequestException('Область кадрирования выходит за границы изображения.');
    return {
      x: Math.max(0, value.x),
      y: Math.max(0, value.y),
      width: Math.min(value.width, 1 - Math.max(0, value.x)),
      height: Math.min(value.height, 1 - Math.max(0, value.y)),
    };
  }

  private async siteMediaSourceBuffer(media: { originalKey: string | null }): Promise<Buffer> {
    if (!media.originalKey)
      throw new BadRequestException(
        'Для этого фото нет сохранённого оригинала. Замените его новым изображением.',
      );
    try {
      return await readFile(this.originalFilePath(media.originalKey));
    } catch (error) {
      this.logger.error(
        `Could not read site media original ${media.originalKey}: ${this.errorMessage(error)}`,
      );
      throw new ServiceUnavailableException(
        'Не удалось прочитать сохранённый оригинал. Загрузите исходный файл заново.',
      );
    }
  }

  private async toSiteWebp(buffer: Buffer, kind: SiteMediaKind): Promise<Buffer> {
    const [width, height] =
      kind === 'HERO' ? [1920, 900] : kind === 'MAIN_GALLERY' ? [1800, 1200] : [1600, 1200];
    try {
      return await sharp(buffer, {
        failOn: 'warning',
        limitInputPixels: CATALOG_IMAGE_MAX_INPUT_PIXELS,
        pages: 1,
      })
        .rotate()
        .resize({ width, height, fit: 'cover', position: 'attention', withoutEnlargement: false })
        .toColourspace('srgb')
        .webp({ quality: 84, effort: 6, smartSubsample: true })
        .toBuffer();
    } catch {
      throw new BadRequestException('Не удалось подготовить изображение для сайта.');
    }
  }

  private async storeOriginal(key: string, buffer: Buffer) {
    const target = this.originalFilePath(key);
    const temporary = `${target}.${randomUUID()}.part`;
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    try {
      await writeFile(temporary, buffer, { flag: 'wx', mode: 0o600 });
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  private async deleteOriginalAfterFailure(key: string | null | undefined, reason: string) {
    if (!key) return;
    try {
      await rm(this.originalFilePath(key), { force: true });
    } catch (error) {
      this.logger.error(
        `Could not delete catalog original after ${reason} (${key}): ${this.errorMessage(error)}`,
      );
    }
  }

  private originalsRoot() {
    return resolve(
      process.env.MEDIA_ORIGINALS_DIR?.trim() ||
        resolve(process.cwd(), '.local', 'media', 'originals'),
    );
  }

  private originalFilePath(key: string) {
    const root = this.originalsRoot();
    const target = resolve(root, key);
    if (!target.startsWith(`${root}${sep}`))
      throw new BadRequestException('Недопустимый ключ оригинала изображения.');
    return target;
  }

  private backgroundRemovalUrl() {
    const configured = process.env.BACKGROUND_REMOVAL_URL?.trim();
    if (!configured) throw new ServiceUnavailableException('Сервис удаления фона не настроен.');
    try {
      const url = new URL(`${configured.replace(/\/$/, '')}/`);
      if (url.protocol !== 'http:' && url.protocol !== 'https:')
        throw new Error('Invalid protocol');
      return url;
    } catch {
      throw new ServiceUnavailableException('Адрес сервиса удаления фона настроен некорректно.');
    }
  }

  private siteMediaKind(value: string): SiteMediaKind {
    if (value === 'HERO' || value === 'GALLERY' || value === 'MAIN_GALLERY') return value;
    throw new BadRequestException('Выберите назначение изображения.');
  }

  /** SKU usable as a file name for originals copied to the server, or null. */
  private catalogFilenameSku(value: string) {
    const sku = value.trim();
    if (
      !sku ||
      sku === '.' ||
      sku === '..' ||
      sku.includes('/') ||
      sku.includes('\\') ||
      [...sku].some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint <= 31 || codePoint === 127;
      })
    )
      return null;
    return sku;
  }

  private imageFilename(value: string) {
    return this.imageBasename(value).toLowerCase();
  }

  private imageBasename(value: string) {
    let filename = value.split('/').at(-1) ?? value;
    try {
      filename = decodeURIComponent(filename);
    } catch {
      // Preserve the raw name if an old S3 key contains a malformed escape sequence.
    }
    return filename.replace(/\.[^.]+$/, '').trim();
  }

  private siteMediaDirectory(kind: SiteMediaKind) {
    if (kind === 'HERO') return 'site/hero';
    if (kind === 'MAIN_GALLERY') return 'site/main-gallery';
    return 'site/gallery';
  }

  private siteMediaFilename(kind: SiteMediaKind, position: number) {
    if (kind === 'HERO') return 'main-1';
    if (kind === 'MAIN_GALLERY') return `about-${position + 1}`;
    return `gallery-${position + 1}`;
  }

  /** Immutable keys for one version of a site image; positions never affect them. */
  private newSiteMediaKeys(kind: SiteMediaKind, format: SupportedImageFormat) {
    const base = `${this.siteMediaDirectory(kind)}/${randomUUID()}`;
    return { imageKey: `${base}.webp`, originalKey: `${base}.${format}` };
  }

  private withSiteMediaLock<T>(
    kind: SiteMediaKind,
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`site-media:${kind}`}))`;
      return callback(tx);
    });
  }

  private async applySiteMediaOrder(
    tx: Prisma.TransactionClient,
    ordered: Array<{ id: string; position: number }>,
  ) {
    for (const [index, item] of ordered.entries()) {
      if (item.position !== index)
        await tx.siteMedia.update({ where: { id: item.id }, data: { position: index } });
    }
  }

  private async commitSiteMediaVersion(
    media: SiteMediaRecord,
    data: { imageKey: string; originalKey: string | null },
  ) {
    const updated = await this.prisma.siteMedia.updateMany({
      where: { id: media.id, imageKey: media.imageKey, originalKey: media.originalKey },
      data,
    });
    const current =
      updated.count === 1
        ? await this.prisma.siteMedia.findUnique({ where: { id: media.id } })
        : null;
    if (!current)
      throw new ConflictException(
        'Изображение уже изменилось. Обновите страницу и повторите попытку.',
      );
    return current;
  }

  private async putSiteImage(storage: CatalogImageStorage, key: string, image: Buffer) {
    await storage.client.send(
      new PutObjectCommand({
        Bucket: storage.bucket,
        Key: key,
        Body: image,
        ContentType: 'image/webp',
        ContentDisposition: 'inline',
        CacheControl: IMMUTABLE_CACHE_CONTROL,
      }),
      { abortSignal: AbortSignal.timeout(this.requestTimeout()) },
    );
  }

  /** Removes files of a replaced or deleted version unless a record still uses them. */
  private async deleteUnreferencedSiteFiles(
    storage: CatalogImageStorage,
    previous: { imageKey: string; originalKey: string | null },
    reason: string,
  ) {
    if (!(await this.prisma.siteMedia.count({ where: { imageKey: previous.imageKey } })))
      await this.deleteAfterFailure(storage, previous.imageKey, reason);
    if (
      previous.originalKey &&
      !(await this.prisma.siteMedia.count({ where: { originalKey: previous.originalKey } }))
    )
      await this.deleteOriginalAfterFailure(previous.originalKey, reason);
  }

  private siteMediaResponse(media: SiteMediaRecord, storage: CatalogImageStorage) {
    return {
      ...media,
      imagePath: catalogImagePublicUrl(media.imageKey, storage.publicUrl),
    };
  }

  private async findOriginalByBase(
    base: string,
    caseSensitive = false,
  ): Promise<{ key: string | null; ambiguous: boolean }> {
    const slash = base.lastIndexOf('/');
    const directory = base.slice(0, slash);
    const normalize = (value: string) => (caseSensitive ? value : value.toLowerCase());
    const filename = normalize(base.slice(slash + 1));
    try {
      const entries = await readdir(this.originalFilePath(directory), { withFileTypes: true });
      const present = entries
        .filter((entry) => {
          if (!entry.isFile()) return false;
          const [name = '', extension] = entry.name.split(/\.(?=[^.]+$)/);
          return (
            normalize(name) === filename &&
            ['jpeg', 'jpg', 'png', 'webp'].includes(extension?.toLowerCase() ?? '')
          );
        })
        .map((entry) => `${directory}/${entry.name}`);
      return {
        key: present.length === 1 ? (present[0] ?? null) : null,
        ambiguous: present.length > 1,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return { key: null, ambiguous: false };
      throw error;
    }
  }

  /**
   * Manual admin operation: registers WebP objects that exist in S3 but not in
   * the database. They are added hidden and after the existing photos, so an
   * object whose deletion failed never reappears on the site by itself.
   */
  private async synchronizeExistingSiteMedia(storage: CatalogImageStorage) {
    const directories: Array<{ kind: SiteMediaKind; prefix: string }> = [
      { kind: 'HERO', prefix: 'site/hero/' },
      { kind: 'GALLERY', prefix: 'site/gallery/' },
      { kind: 'MAIN_GALLERY', prefix: 'site/main-gallery/' },
    ];
    for (const { kind, prefix } of directories) {
      let keys: string[];
      try {
        keys = [...(await this.storageObjectKeys(storage, prefix))].filter((key) =>
          key.endsWith('.webp'),
        );
      } catch (error) {
        this.logger.warn(
          `Could not list existing site media in ${prefix}: ${this.errorMessage(error)}`,
        );
        continue;
      }
      if (!keys.length) continue;
      await this.withSiteMediaLock(kind, async (tx) => {
        const existing = await tx.siteMedia.findMany({
          where: { kind },
          select: { imageKey: true, position: true },
        });
        const registered = new Set(existing.map((item) => item.imageKey));
        let position = Math.max(-1, ...existing.map((item) => item.position));
        for (const key of keys) {
          if (registered.has(key)) continue;
          if (kind === 'HERO' && existing.length) break;
          if (await tx.siteMedia.count({ where: { imageKey: key } })) continue;
          // A deleted photo whose object is still queued for removal must not come back.
          if (
            await tx.storageCleanup.count({
              where: { location: StoredFileLocation.PUBLIC_BUCKET, key },
            })
          )
            continue;
          position += 1;
          let alt = key.split('/').at(-1) ?? 'Изображение';
          try {
            alt = decodeURIComponent(alt);
          } catch {
            // Keep the raw name for keys with malformed escape sequences.
          }
          await tx.siteMedia.create({
            data: {
              kind,
              imageKey: key,
              originalKey: null,
              alt: alt.replace(/\.webp$/i, '').slice(0, 160) || 'Изображение',
              title: null,
              position: kind === 'HERO' ? 0 : position,
              isActive: kind === 'HERO',
            },
          });
          if (kind === 'HERO') break;
        }
      });
    }
  }

  private async storageGroupStatus(
    items: Array<{ imageKey: string | null; originalKey: string | null }>,
    publicKeys: Set<string>,
  ): Promise<MediaStorageGroupStatus> {
    const originals = await Promise.all(items.map((item) => this.originalExists(item.originalKey)));
    let originalsPresent = 0;
    let publicImagesPresent = 0;
    let ready = 0;
    for (let index = 0; index < items.length; index += 1) {
      const originalPresent = originals[index] ?? false;
      const imageKey = items[index]?.imageKey;
      const publicPresent = Boolean(imageKey && publicKeys.has(imageKey));
      if (originalPresent) originalsPresent += 1;
      if (publicPresent) publicImagesPresent += 1;
      if (originalPresent && publicPresent) ready += 1;
    }
    return {
      total: items.length,
      originalsPresent,
      publicImagesPresent,
      ready,
      missingOriginals: items.length - originalsPresent,
      missingPublicImages: items.length - publicImagesPresent,
    };
  }

  private async originalExists(key: string | null) {
    if (!key) return false;
    try {
      await access(this.originalFilePath(key));
      return true;
    } catch {
      return false;
    }
  }

  private async storageObjectKeys(storage: CatalogImageStorage, prefix: string) {
    return new Set((await this.storageObjects(storage, prefix)).map((item) => item.key));
  }

  private async storageObjects(storage: CatalogImageStorage, prefix: string) {
    const objects: StoredObject[] = [];
    let continuationToken: string | undefined;
    try {
      do {
        const response = await storage.client.send(
          new ListObjectsV2Command({
            Bucket: storage.bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }),
          { abortSignal: AbortSignal.timeout(this.requestTimeout()) },
        );
        for (const item of response.Contents ?? []) {
          if (item.Key) objects.push({ key: item.Key, modifiedAt: item.LastModified ?? null });
        }
        continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
      } while (continuationToken);
      return objects;
    } catch (error) {
      this.logger.error(`Could not list S3 objects in ${prefix}: ${this.errorMessage(error)}`);
      throw new ServiceUnavailableException(
        'Не удалось проверить изображения в S3. Повторите попытку позже.',
      );
    }
  }

  private signatureFormat(buffer: Buffer): SupportedImageFormat | null {
    if (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      return 'png';
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
      return 'jpeg';
    if (
      buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    )
      return 'webp';
    return null;
  }

  private async deleteObject(storage: CatalogImageStorage, key: string) {
    await storage.client.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(this.requestTimeout()),
    });
  }

  private async deleteAfterFailure(storage: CatalogImageStorage, key: string, reason: string) {
    try {
      await this.deleteObject(storage, key);
    } catch (error) {
      this.logger.error(
        `Could not delete catalog image after ${reason} (${key}): ${this.errorMessage(error)}`,
      );
    }
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  private storage(): CatalogImageStorage {
    if (this.storageInstance) return this.storageInstance;

    const bucket = this.required('S3_BUCKET');
    const publicUrl = this.required('S3_PUBLIC_URL').replace(/\/$/, '');
    this.storageInstance = {
      bucket,
      publicUrl,
      client: new S3Client({
        region: this.required('S3_REGION'),
        endpoint: process.env.S3_ENDPOINT,
        forcePathStyle: Boolean(process.env.S3_ENDPOINT),
        credentials: {
          accessKeyId: this.required('S3_ACCESS_KEY_ID'),
          secretAccessKey: this.required('S3_SECRET_ACCESS_KEY'),
        },
      }),
    };
    return this.storageInstance;
  }

  private required(name: string) {
    const value = process.env[name];
    if (!value) throw new Error(`${name} must be configured for catalog image storage.`);
    return value;
  }

  private requestTimeout() {
    const configured = Number(process.env.S3_REQUEST_TIMEOUT_MS);
    return Number.isSafeInteger(configured) && configured > 0
      ? configured
      : DEFAULT_S3_REQUEST_TIMEOUT_MS;
  }
}
