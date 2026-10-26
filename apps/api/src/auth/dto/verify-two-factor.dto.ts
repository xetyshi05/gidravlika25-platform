import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class VerifyTwoFactorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code!: string;
}
