import { Equals, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AnonymizeCustomerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @Equals('ОБЕЗЛИЧИТЬ')
  confirmation!: 'ОБЕЗЛИЧИТЬ';
}
