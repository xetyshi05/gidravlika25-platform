// Documentation-only bodies of the media and image uploads (ARCH-01). The
// controller validates these requests by hand and must keep plain @Body()
// types: with a class here ValidationPipe would strip every undecorated field.
import { ApiProperty } from '@nestjs/swagger';
import type { SiteMediaKind } from '@prisma/client';

export class SiteMediaCropDto {
  x!: number;
  y!: number;
  width!: number;
  height!: number;
}

export class ImageFileDto {
  @ApiProperty({ type: 'string', format: 'binary' }) file!: unknown;
}

export class ImageFilesDto {
  @ApiProperty({ type: 'array', items: { type: 'string', format: 'binary' } }) files!: unknown[];
}

export class UploadSiteMediaDto extends ImageFileDto {
  kind!: SiteMediaKind;
  alt!: string;
  title?: string;
  /** SiteMediaCropDto as JSON. */
  crop?: string;
}

export class ReplaceSiteMediaImageDto extends ImageFileDto {
  /** SiteMediaCropDto as JSON. */
  crop?: string;
}

export class CropSiteMediaDto {
  crop!: SiteMediaCropDto;
}

export class UpdateSiteMediaDto {
  isActive?: boolean;
  kind?: SiteMediaKind;
  position?: number;
}
