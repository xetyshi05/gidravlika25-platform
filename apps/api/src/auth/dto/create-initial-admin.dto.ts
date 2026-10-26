import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateInitialAdminDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9._-]+$/)
  login!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}
