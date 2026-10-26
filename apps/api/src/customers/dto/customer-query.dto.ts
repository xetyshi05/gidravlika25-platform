import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsIn, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { MAX_PAGE } from '../../pagination';

export class CustomerQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['name', 'company', 'phone', 'email', 'requestCount', 'lastActivity'])
  sortBy: 'name' | 'company' | 'phone' | 'email' | 'requestCount' | 'lastActivity' = 'lastActivity';

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE)
  page = 1;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
