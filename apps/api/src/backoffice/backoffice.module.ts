import { Module } from '@nestjs/common';
import { BackofficeController } from './backoffice.controller';
import { BackofficeService } from './backoffice.service';
import { CatalogImagesService } from './catalog-images.service';
import { AuthModule } from '../auth/auth.module';
import { AdminGuard } from './admin.guard';
import { CatalogCacheInvalidationService } from './catalog-cache-invalidation.service';
import { ServerResourcesService } from './server-resources.service';
import { BackofficeActivityService } from './backoffice-activity.service';
import { SiteMediaController } from './site-media.controller';
import { StorageCleanupScheduler } from './storage-cleanup.scheduler';
@Module({
  imports: [AuthModule],
  controllers: [BackofficeController, SiteMediaController],
  providers: [
    BackofficeService,
    CatalogImagesService,
    CatalogCacheInvalidationService,
    ServerResourcesService,
    BackofficeActivityService,
    AdminGuard,
    StorageCleanupScheduler,
  ],
  exports: [CatalogImagesService],
})
export class BackofficeModule {}
