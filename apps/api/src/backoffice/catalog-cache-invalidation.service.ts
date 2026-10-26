import { Injectable, Logger } from '@nestjs/common';

const DEFAULT_TIMEOUT_MS = 5_000;

@Injectable()
export class CatalogCacheInvalidationService {
  private readonly logger = new Logger(CatalogCacheInvalidationService.name);

  async invalidate(): Promise<boolean> {
    const url = process.env.CATALOG_REVALIDATION_URL?.trim();
    const secret = process.env.CATALOG_REVALIDATION_SECRET?.trim();
    if (!url || !secret) return false;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(this.requestTimeout()),
      });
      if (!response.ok) {
        throw new Error(`revalidation endpoint returned ${response.status}`);
      }
      return true;
    } catch (error) {
      this.logger.warn(`Catalog cache invalidation failed: ${this.errorMessage(error)}`);
      return false;
    }
  }

  private requestTimeout() {
    const configured = Number(process.env.CATALOG_REVALIDATION_TIMEOUT_MS);
    return Number.isSafeInteger(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'unknown error';
  }
}
