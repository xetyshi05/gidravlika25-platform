import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayMaxSize,
  Equals,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { DeliveryType, PaymentType } from '@prisma/client';

class CartRequestItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999)
  quantity!: number;
}

// Address suggestions (DaData) have null for missing parts; @IsOptional accepts them.
class DeliveryAddressDetailsDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  region?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  area?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  city?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  settlement?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  street?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  house?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  block?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  flat?: string | null;
}

export class CreateCartRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;

  // ALTCHA payload; checked by PublicRequestCaptchaService (SEC-03).
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  altcha?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  middleName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  phone!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  comment?: string;

  @IsEnum(DeliveryType)
  deliveryType!: DeliveryType;

  @ValidateIf((request: CreateCartRequestDto) => request.deliveryType === DeliveryType.DELIVERY)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  deliveryAddress?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => DeliveryAddressDetailsDto)
  deliveryAddressDetails?: DeliveryAddressDetailsDto;

  @IsEnum(PaymentType)
  paymentType!: PaymentType;

  @Equals(true)
  personalDataConsent!: true;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  documentVersion!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CartRequestItemDto)
  items!: CartRequestItemDto[];
}
