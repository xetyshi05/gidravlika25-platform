import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsIn,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { MAX_PAGE } from '../../pagination';

/** Поле можно не передавать («не менять»), но `null` запрещён: колонка в БД обязательная. */
const OptionalNotNull = () => ValidateIf((_: object, value: unknown) => value !== undefined);
/** `undefined` — «не менять», `null` или пустая строка — «очистить». */
const Nullable = () =>
  ValidateIf((_: object, value: unknown) => value !== undefined && value !== null);
const emptyToNull = () =>
  Transform(({ value }: { value: unknown }) => (value === '' ? null : value));
/** Как `@Type(() => Number)`, но пустая строка становится `null`, а не `0`. */
const nullableNumber = () =>
  Transform(({ value }: { value: unknown }) =>
    value === '' ? null : typeof value === 'string' ? Number(value) : value,
  );
const MAX_MILLIMETERS = 100_000;
export const MAX_STOCK = 1_000_000_000;
/** Decimal(12, 2) в `Product.price`. */
const MAX_PRICE = 9_999_999_999.99;
/** Decimal(6, 2) в полях давления. */
const MAX_PRESSURE = 9_999.99;
const calendarDay = /^\d{4}-\d{2}-\d{2}$/;
const slugPattern = /^[a-zа-яё0-9]+(?:-[a-zа-яё0-9]+)*$/i;

class ProductOptionalFieldsDto {
  @Nullable() @emptyToNull() @IsString() @MaxLength(10_000) description?: string | null;
  @Nullable() @emptyToNull() @IsString() @MaxLength(1_000) shortDescription?: string | null;
  @Nullable()
  @nullableNumber()
  @IsInt()
  @Min(0)
  @Max(MAX_MILLIMETERS)
  pistonDiameterMm?: number | null;
  @Nullable()
  @nullableNumber()
  @IsInt()
  @Min(0)
  @Max(MAX_MILLIMETERS)
  rodDiameterMm?: number | null;
  @Nullable() @nullableNumber() @IsInt() @Min(0) @Max(MAX_MILLIMETERS) strokeMm?: number | null;
  @Nullable()
  @nullableNumber()
  @IsInt()
  @Min(0)
  @Max(MAX_MILLIMETERS)
  collapsedLengthMm?: number | null;
  @Nullable()
  @nullableNumber()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_PRESSURE)
  maxPressureMpa?: number | null;
  @Nullable()
  @nullableNumber()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_PRESSURE)
  nominalPressureMpa?: number | null;
  @OptionalNotNull() @Type(() => Number) @IsInt() @Min(0) @Max(MAX_STOCK) stockQuantity?: number;
  @OptionalNotNull() @IsBoolean() isActive?: boolean;
  @OptionalNotNull() @IsBoolean() isFeatured?: boolean;
  @OptionalNotNull() @IsString() @MaxLength(200) @Matches(slugPattern) slug?: string;
}
export class ProductDto extends ProductOptionalFieldsDto {
  @IsString() @IsNotEmpty() @MaxLength(100) sku!: string;
  @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) categoryId!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_PRICE) price!: number;
}
/** PATCH товара: отсутствующее поле не меняется, `null` очищает необязательное поле. */
export class UpdateProductDto extends ProductOptionalFieldsDto {
  /** `updatedAt` товара, открытого в форме: если он изменился, API отвечает 409. */
  @IsISO8601({ strict: true, strictSeparator: true }) expectedUpdatedAt!: string;
  @OptionalNotNull() @IsString() @IsNotEmpty() @MaxLength(100) sku?: string;
  @OptionalNotNull() @IsString() @IsNotEmpty() @MaxLength(200) name?: string;
  @OptionalNotNull() @IsString() @IsNotEmpty() @MaxLength(100) categoryId?: string;
  @OptionalNotNull()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_PRICE)
  price?: number;
}
class CategoryOptionalFieldsDto {
  @Nullable() @emptyToNull() @IsString() @MaxLength(4_000) description?: string | null;
  @Nullable() @emptyToNull() @IsString() @MaxLength(100) parentId?: string | null;
  @OptionalNotNull() @IsBoolean() isActive?: boolean;
}
export class CategoryDto extends CategoryOptionalFieldsDto {
  @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @IsString() @IsNotEmpty() @MaxLength(200) @Matches(slugPattern) slug!: string;
}
/** PATCH категории: отсутствующее поле не меняется, `null` очищает описание или родителя. */
export class UpdateCategoryDto extends CategoryOptionalFieldsDto {
  @OptionalNotNull() @IsString() @IsNotEmpty() @MaxLength(200) name?: string;
  @OptionalNotNull()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Matches(slugPattern)
  slug?: string;
}
/** Изменение остатка на `delta`: сервер прибавляет его атомарно, итог не меньше 0. */
export class StockDto {
  // Explicit: the Swagger plugin drops a property whose limits are `-CONSTANT`.
  @ApiProperty({ type: 'integer', minimum: -MAX_STOCK, maximum: MAX_STOCK })
  @Type(() => Number)
  @IsInt()
  @Min(-MAX_STOCK)
  @Max(MAX_STOCK)
  delta!: number;
}
export class SettingsDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000_000) lowStockThreshold!: number;
  @IsBoolean() showOutOfStock!: boolean;
  @IsBoolean() showPrices!: boolean;
}
export class IdsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(100, { each: true })
  ids!: string[];
}
export class BulkStockDto extends IdsDto {
  @ApiProperty({ type: 'integer', minimum: -MAX_STOCK, maximum: MAX_STOCK })
  @Type(() => Number)
  @IsInt()
  @Min(-MAX_STOCK)
  @Max(MAX_STOCK)
  delta!: number;
}
export class BulkProductUpdateDto extends IdsDto {
  @OptionalNotNull() @IsBoolean() isActive?: boolean;
  @OptionalNotNull() @IsBoolean() isFeatured?: boolean;
  @IsOptional() @IsString() categoryId?: string;
}
export class BulkCategoryUpdateDto extends IdsDto {
  @IsBoolean() isActive!: boolean;
}
export class CreateUserDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9._-]+$/)
  login!: string;
  @IsString() @MinLength(12) @MaxLength(128) password!: string;
  @IsIn(['ADMIN', 'MANAGER']) role!: 'ADMIN' | 'MANAGER';
}
export class UpdateUserDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) name?: string;
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9._-]+$/)
  login?: string;
  @IsOptional() @IsIn(['ADMIN', 'MANAGER']) role?: 'ADMIN' | 'MANAGER';
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateUserPasswordDto {
  @IsString() @MinLength(12) @MaxLength(128) password!: string;
}
export class ActivityQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(MAX_PAGE - 1) page?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsIn(['ALL', 'AUTH', 'CATALOG', 'USERS']) scope?:
    'ALL' | 'AUTH' | 'CATALOG' | 'USERS';
  /** A calendar day `YYYY-MM-DD`; a date-time or an impossible date is a 400 (DATA-05). */
  @IsOptional() @Matches(calendarDay) @IsISO8601({ strict: true }) dateFrom?: string;
  @IsOptional() @Matches(calendarDay) @IsISO8601({ strict: true }) dateTo?: string;
}
export class ProductTableQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(MAX_PAGE - 1) page?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
  @IsOptional()
  @IsIn(['sku', 'name', 'category', 'price', 'active', 'stock'])
  sortBy?: string;
  @IsOptional() @IsIn(['asc', 'desc']) sortDir?: 'asc' | 'desc';
  /** JSON array: [{ id, value, mode }], kept in the URL to make table state shareable. */
  @IsOptional() @IsString() @MaxLength(20_000) filters?: string;
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  idsOnly?: boolean;
}
export class CategoryTableQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(MAX_PAGE - 1) page?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
  @IsOptional() @IsIn(['name', 'productCount', 'active']) sortBy?: string;
  @IsOptional() @IsIn(['asc', 'desc']) sortDir?: 'asc' | 'desc';
  @IsOptional() @IsString() @MaxLength(5_000) filters?: string;
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  idsOnly?: boolean;
}
