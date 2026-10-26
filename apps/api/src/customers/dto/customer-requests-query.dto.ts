import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_PAGE } from '../../pagination';

export class CustomerRequestsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['number', 'type', 'status', 'createdAt'])
  sortBy: 'number' | 'type' | 'status' | 'createdAt' = 'createdAt';

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
