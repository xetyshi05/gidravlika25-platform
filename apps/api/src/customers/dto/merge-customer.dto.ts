import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export enum MergeValueSource {
  TARGET = 'TARGET',
  SOURCE = 'SOURCE',
}

export class MergeCustomerDto {
  @IsString()
  @IsNotEmpty()
  sourceCustomerId!: string;

  @IsOptional()
  @IsEnum(MergeValueSource)
  firstNameSelection?: MergeValueSource;

  @IsOptional()
  @IsEnum(MergeValueSource)
  lastNameSelection?: MergeValueSource;

  @IsOptional()
  @IsEnum(MergeValueSource)
  middleNameSelection?: MergeValueSource;

  @IsOptional()
  @IsEnum(MergeValueSource)
  phoneSelection?: MergeValueSource;

  @IsOptional()
  @IsEnum(MergeValueSource)
  emailSelection?: MergeValueSource;

  @IsOptional()
  @IsEnum(MergeValueSource)
  companySelection?: MergeValueSource;
}
