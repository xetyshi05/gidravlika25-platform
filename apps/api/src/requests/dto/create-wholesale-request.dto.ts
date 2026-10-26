import { Equals, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateWholesaleRequestDto {
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

  @Equals(true)
  personalDataConsent!: true;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  documentVersion!: string;
}
