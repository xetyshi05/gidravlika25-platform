import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9._-]+$/)
  login!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
