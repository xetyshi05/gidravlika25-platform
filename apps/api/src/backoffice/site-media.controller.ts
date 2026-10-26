import { Controller, Get, Header } from '@nestjs/common';
import { SiteMedia } from './backoffice.response';
import { CatalogImagesService } from './catalog-images.service';

@Controller('site-media')
export class SiteMediaController {
  constructor(private readonly images: CatalogImagesService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=60')
  media(): Promise<SiteMedia[]> {
    return this.images.siteMedia(false);
  }
}
