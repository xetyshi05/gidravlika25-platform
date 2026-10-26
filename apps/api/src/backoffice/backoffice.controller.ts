import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Query,
  Req,
  Patch,
  Post,
  StreamableFile,
  Type,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiProduces,
  getSchemaPath,
} from '@nestjs/swagger';
import { BackofficeService } from './backoffice.service';
import {
  CATALOG_IMAGE_MAX_FILE_SIZE_BYTES,
  CatalogImagesService,
  type SiteMediaCrop,
} from './catalog-images.service';
import { AdminGuard } from './admin.guard';
import { CatalogCacheInvalidationService } from './catalog-cache-invalidation.service';
import { ServerResourcesService } from './server-resources.service';
import { BackofficeActivityService } from './backoffice-activity.service';
import {
  CategoryDto,
  CategoryTableQueryDto,
  ProductDto,
  SettingsDto,
  StockDto,
  IdsDto,
  BulkStockDto,
  BulkProductUpdateDto,
  BulkCategoryUpdateDto,
  ActivityQueryDto,
  CreateUserDto,
  ProductTableQueryDto,
  UpdateCategoryDto,
  UpdateProductDto,
  UpdateUserDto,
  UpdateUserPasswordDto,
} from './dto/catalog.dto';
import {
  CropSiteMediaDto,
  ImageFileDto,
  ImageFilesDto,
  ReplaceSiteMediaImageDto,
  UpdateSiteMediaDto,
  UploadSiteMediaDto,
} from './dto/media.dto';
import {
  BackofficeActivityPage,
  BackofficeCategory,
  BackofficeCategoryPage,
  BackofficeProduct,
  BackofficeProductPage,
  BackofficeUser,
  CatalogSettings,
  Category,
  DeletedCount,
  IdList,
  MediaStorageStatus,
  OriginalsImportResult,
  OriginalsSynchronizationResult,
  ProductImage,
  RevokedSession,
  RevokedSessions,
  ServerResources,
  SiteMedia,
  StaffSession,
  StaffUser,
  StaffUserWithSessions,
  StoredSiteMedia,
  UpdatedCount,
} from './backoffice.response';
import { OkResult } from '../auth/auth.response';

type BackofficeRequest = {
  backofficeUser: { id: string; name: string; login: string; role: string };
};

function siteMediaCrop(value: unknown): SiteMediaCrop | undefined {
  if (value === undefined || value === '') return undefined;
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new BadRequestException('Параметры кадрирования указаны некорректно.');
    }
  }
  if (!parsed || typeof parsed !== 'object')
    throw new BadRequestException('Параметры кадрирования указаны некорректно.');
  const crop = parsed as Record<string, unknown>;
  if (
    typeof crop.x !== 'number' ||
    typeof crop.y !== 'number' ||
    typeof crop.width !== 'number' ||
    typeof crop.height !== 'number'
  )
    throw new BadRequestException('Параметры кадрирования указаны некорректно.');
  return { x: crop.x, y: crop.y, width: crop.width, height: crop.height };
}

/** The list endpoints answer in one of three shapes, chosen by the query. */
function tableResponse(row: Type, page: Type) {
  return ApiOkResponse({
    description:
      'Without table parameters — every row; with `idsOnly=true` — the matching ids; otherwise one page.',
    schema: {
      oneOf: [
        { type: 'array', items: { $ref: getSchemaPath(row) } },
        { $ref: getSchemaPath(IdList) },
        { $ref: getSchemaPath(page) },
      ],
    },
  });
}

@Controller('backoffice')
@UseGuards(AdminGuard)
@ApiBearerAuth()
@ApiExtraModels(
  IdList,
  BackofficeProduct,
  BackofficeProductPage,
  BackofficeCategory,
  BackofficeCategoryPage,
)
export class BackofficeController {
  constructor(
    private readonly backoffice: BackofficeService,
    private readonly activityLog: BackofficeActivityService,
    private readonly images: CatalogImagesService,
    private readonly catalogCache: CatalogCacheInvalidationService,
    private readonly serverResources: ServerResourcesService,
  ) {}
  @Get('me') me(@Req() request: BackofficeRequest): BackofficeUser {
    return request.backofficeUser;
  }
  @Get('server-resources')
  @Header('Cache-Control', 'no-store')
  serverResourceStatus(): Promise<ServerResources> {
    return this.serverResources.status();
  }
  @Get('media') media(): Promise<SiteMedia[]> {
    return this.images.siteMedia(true);
  }
  @Get('media/storage-status')
  @Header('Cache-Control', 'no-store')
  mediaStorageStatus(): Promise<MediaStorageStatus> {
    return this.images.mediaStorageStatus();
  }
  @Post('media/originals/import')
  @UseInterceptors(
    FilesInterceptor('files', 50, {
      limits: { fileSize: CATALOG_IMAGE_MAX_FILE_SIZE_BYTES, files: 50 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: ImageFilesDto })
  async importMediaOriginals(
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<OriginalsImportResult> {
    return this.images.importSiteMediaOriginals(files ?? []);
  }
  @Post('media/originals/import-catalog')
  @UseInterceptors(
    FilesInterceptor('files', 50, {
      limits: { fileSize: CATALOG_IMAGE_MAX_FILE_SIZE_BYTES, files: 50 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: ImageFilesDto })
  async importCatalogOriginals(
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<OriginalsImportResult> {
    return this.images.importCatalogImageOriginals(files ?? []);
  }
  @Post('media/originals/synchronize')
  async synchronizeOriginalsFromStorage(): Promise<OriginalsSynchronizationResult> {
    return this.images.synchronizeOriginalsFromStorage();
  }
  @Get('media/:id/image-source')
  @Header('Cache-Control', 'no-store')
  @ApiProduces('image/jpeg', 'image/png', 'image/webp')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async mediaSource(@Param('id') id: string) {
    const source = await this.images.siteMediaSource(id);
    return new StreamableFile(source.buffer, { type: source.contentType, disposition: 'inline' });
  }
  @Post('media')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: CATALOG_IMAGE_MAX_FILE_SIZE_BYTES, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadSiteMediaDto })
  async uploadMedia(
    @Body() body: { kind?: unknown; alt?: unknown; title?: unknown; crop?: unknown },
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<StoredSiteMedia> {
    if (!file) throw new BadRequestException('Файл изображения обязателен.');
    const media = await this.images.uploadSiteMedia(file, {
      kind: typeof body.kind === 'string' ? body.kind : '',
      alt: typeof body.alt === 'string' ? body.alt : '',
      title: typeof body.title === 'string' ? body.title : undefined,
      crop: siteMediaCrop(body.crop),
    });
    await this.catalogCache.invalidate();
    return media;
  }
  @Delete('media/:id') async deleteMedia(@Param('id') id: string): Promise<OkResult> {
    const result = await this.images.deleteSiteMedia(id);
    await this.catalogCache.invalidate();
    return result;
  }
  @Post('media/:id/image')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: CATALOG_IMAGE_MAX_FILE_SIZE_BYTES, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: ReplaceSiteMediaImageDto })
  async replaceMedia(
    @Param('id') id: string,
    @Body() body: { crop?: unknown },
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<StoredSiteMedia> {
    if (!file) throw new BadRequestException('Файл изображения обязателен.');
    const media = await this.images.replaceSiteMedia(id, file, siteMediaCrop(body.crop));
    await this.catalogCache.invalidate();
    return media;
  }
  @Post('media/:id/crop')
  @ApiBody({ type: CropSiteMediaDto })
  async cropMedia(
    @Param('id') id: string,
    @Body() body: { crop?: unknown },
  ): Promise<StoredSiteMedia> {
    const crop = siteMediaCrop(body.crop);
    if (!crop) throw new BadRequestException('Параметры кадрирования обязательны.');
    const media = await this.images.cropSiteMedia(id, crop);
    await this.catalogCache.invalidate();
    return media;
  }
  @Patch('media/:id')
  @ApiBody({ type: UpdateSiteMediaDto })
  async updateMedia(
    @Param('id') id: string,
    @Body()
    body: { isActive?: unknown; kind?: unknown; position?: unknown },
  ): Promise<SiteMedia[]> {
    if (body.isActive !== undefined && typeof body.isActive !== 'boolean')
      throw new BadRequestException('Статус изображения указан некорректно.');
    if (body.kind !== undefined && typeof body.kind !== 'string')
      throw new BadRequestException('Раздел изображения указан некорректно.');
    const position = body.position === undefined ? undefined : Number(body.position);
    if (position !== undefined && (!Number.isInteger(position) || position < 0))
      throw new BadRequestException('Позиция изображения указана некорректно.');
    const media = await this.images.updateSiteMedia(id, {
      isActive: body.isActive,
      kind: body.kind,
      position,
    });
    await this.catalogCache.invalidate();
    return media;
  }
  @Get('activities') activities(@Query() query: ActivityQueryDto): Promise<BackofficeActivityPage> {
    return this.activityLog.list(query);
  }
  @Get('users') users(): Promise<StaffUserWithSessions[]> {
    return this.backoffice.users();
  }
  @Post('users') createUser(
    @Body() dto: CreateUserDto,
    @Req() request: BackofficeRequest,
  ): Promise<StaffUser> {
    return this.backoffice.createUser(dto, request.backofficeUser.id);
  }
  @Patch('users/:id') updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Req() request: BackofficeRequest,
  ): Promise<StaffUser> {
    return this.backoffice.updateUser(id, dto, request.backofficeUser.id);
  }
  @Patch('users/:id/password') updateUserPassword(
    @Param('id') id: string,
    @Body() dto: UpdateUserPasswordDto,
    @Req() request: BackofficeRequest,
  ): Promise<OkResult> {
    return this.backoffice.updateUserPassword(id, dto.password, request.backofficeUser.id);
  }
  @Post('users/:id/reset-two-factor') resetUserTwoFactor(
    @Param('id') id: string,
    @Req() request: BackofficeRequest,
  ): Promise<OkResult> {
    return this.backoffice.resetUserTwoFactor(id, request.backofficeUser.id);
  }
  @Post('users/:id/revoke-sessions') revokeUserSessions(
    @Param('id') id: string,
    @Req() request: BackofficeRequest,
  ): Promise<RevokedSessions> {
    return this.backoffice.revokeUserSessions(id, request.backofficeUser.id);
  }
  @Get('users/:id/sessions') userSessions(@Param('id') id: string): Promise<StaffSession[]> {
    return this.backoffice.userSessions(id);
  }
  @Post('users/:id/sessions/:sessionId/revoke') revokeUserSession(
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
    @Req() request: BackofficeRequest,
  ): Promise<RevokedSession> {
    return this.backoffice.revokeUserSession(id, sessionId, request.backofficeUser.id);
  }
  @Get('products')
  @tableResponse(BackofficeProduct, BackofficeProductPage)
  products(
    @Query() query: ProductTableQueryDto,
  ): Promise<BackofficeProduct[] | IdList | BackofficeProductPage> {
    return this.backoffice.products(query);
  }
  @Get('products/:id') product(@Param('id') id: string): Promise<BackofficeProduct> {
    return this.backoffice.productById(id);
  }
  // Catalog mutations commit the change together with its audit record; the
  // public cache is invalidated only after that commit.
  @Post('products') async createProduct(
    @Body() dto: ProductDto,
    @Req() request: BackofficeRequest,
  ): Promise<BackofficeProduct> {
    return this.afterCommit(this.backoffice.createProduct(dto, request.backofficeUser.id));
  }
  @Patch('products/bulk/stock') async bulkStock(
    @Body() dto: BulkStockDto,
    @Req() request: BackofficeRequest,
  ): Promise<UpdatedCount> {
    return this.afterCommit(
      this.backoffice.bulkStock(dto.ids, dto.delta, request.backofficeUser.id),
    );
  }
  @Patch('products/bulk') async bulkUpdateProducts(
    @Body() dto: BulkProductUpdateDto,
    @Req() request: BackofficeRequest,
  ): Promise<UpdatedCount> {
    return this.afterCommit(this.backoffice.bulkUpdateProducts(dto, request.backofficeUser.id));
  }
  @Patch('products/:id') async updateProduct(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @Req() request: BackofficeRequest,
  ): Promise<BackofficeProduct> {
    return this.afterCommit(this.backoffice.updateProduct(id, dto, request.backofficeUser.id));
  }
  @Patch('products/:id/stock') async stock(
    @Param('id') id: string,
    @Body() dto: StockDto,
    @Req() request: BackofficeRequest,
  ): Promise<BackofficeProduct> {
    return this.afterCommit(this.backoffice.adjustStock(id, dto.delta, request.backofficeUser.id));
  }
  @Delete('products/:id') async deleteProduct(
    @Param('id') id: string,
    @Req() request: BackofficeRequest,
  ): Promise<DeletedCount> {
    return this.removeProducts([id], request);
  }
  @Delete('products') async deleteProducts(
    @Body() dto: IdsDto,
    @Req() request: BackofficeRequest,
  ): Promise<DeletedCount> {
    return this.removeProducts(dto.ids, request);
  }
  @Post('products/image-preview')
  @Header('Cache-Control', 'no-store')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: CATALOG_IMAGE_MAX_FILE_SIZE_BYTES, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: ImageFileDto })
  // A POST without @HttpCode answers 201.
  @ApiCreatedResponse({
    content: { 'image/webp': { schema: { type: 'string', format: 'binary' } } },
  })
  async previewImage(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Файл изображения обязателен.');
    return new StreamableFile(await this.images.preview(file), {
      type: 'image/webp',
      disposition: 'inline',
    });
  }
  @Post('products/:id/image')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: CATALOG_IMAGE_MAX_FILE_SIZE_BYTES, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: ImageFileDto })
  async uploadImage(
    @Param('id') id: string,
    @Req() request: BackofficeRequest,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<ProductImage> {
    if (!file) throw new BadRequestException('Файл изображения обязателен.');
    return this.afterCommit(
      this.images.uploadMain(id, file, (tx) =>
        this.backoffice.recordProductImageUpdated(tx, id, file, request.backofficeUser.id),
      ),
    );
  }
  @Get('categories')
  @tableResponse(BackofficeCategory, BackofficeCategoryPage)
  categories(
    @Query() query: CategoryTableQueryDto,
  ): Promise<BackofficeCategory[] | IdList | BackofficeCategoryPage> {
    return this.backoffice.categories(query);
  }
  @Post('categories') async createCategory(
    @Body() dto: CategoryDto,
    @Req() request: BackofficeRequest,
  ): Promise<Category> {
    return this.afterCommit(this.backoffice.createCategory(dto, request.backofficeUser.id));
  }
  @Patch('categories/bulk') async bulkUpdateCategories(
    @Body() dto: BulkCategoryUpdateDto,
    @Req() request: BackofficeRequest,
  ): Promise<UpdatedCount> {
    return this.afterCommit(
      this.backoffice.bulkUpdateCategories(dto.ids, dto.isActive, request.backofficeUser.id),
    );
  }
  @Patch('categories/:id') async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @Req() request: BackofficeRequest,
  ): Promise<Category> {
    return this.afterCommit(this.backoffice.updateCategory(id, dto, request.backofficeUser.id));
  }
  @Delete('categories/:id') async deleteCategory(
    @Param('id') id: string,
    @Req() request: BackofficeRequest,
  ): Promise<DeletedCount> {
    return this.afterCommit(this.backoffice.deleteCategories([id], request.backofficeUser.id));
  }
  @Delete('categories') async deleteCategories(
    @Body() dto: IdsDto,
    @Req() request: BackofficeRequest,
  ): Promise<DeletedCount> {
    return this.afterCommit(this.backoffice.deleteCategories(dto.ids, request.backofficeUser.id));
  }
  @Get('settings') settings(): Promise<CatalogSettings> {
    return this.backoffice.settings();
  }
  @Patch('settings') async updateSettings(
    @Body() dto: SettingsDto,
    @Req() request: BackofficeRequest,
  ): Promise<CatalogSettings> {
    return this.afterCommit(this.backoffice.updateSettings(dto, request.backofficeUser.id));
  }
  private async removeProducts(ids: string[], request: BackofficeRequest) {
    const { files, ...result } = await this.backoffice.deleteProducts(
      ids,
      request.backofficeUser.id,
    );
    await this.images.cleanUpAfterCommit(files);
    await this.catalogCache.invalidate();
    return result;
  }
  /** Invalidation never throws: a stale cache must not turn a committed change into an error. */
  private async afterCommit<T>(mutation: Promise<T>) {
    const result = await mutation;
    await this.catalogCache.invalidate();
    return result;
  }
}
