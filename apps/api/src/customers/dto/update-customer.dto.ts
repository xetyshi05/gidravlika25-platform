import { IsEmail, IsISO8601, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCustomerDto {
  /** `updatedAt` карточки, открытой в форме: если он изменился, API отвечает 409. */
  @IsISO8601({ strict: true, strictSeparator: true })
  expectedUpdatedAt!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  middleName?: string | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  phone!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string | null;
}
