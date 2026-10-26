import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsIn, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { RequestStatus, RequestType } from '@prisma/client';
import { MAX_PAGE } from '../../pagination';

export class RequestQueryDto {
  @IsOptional()
  @IsEnum(RequestType)
  type?: RequestType;

  @IsOptional()
  @IsEnum(RequestStatus)
  status?: RequestStatus;

  @IsOptional()
  @IsIn(['unread', 'overdue'])
  attention?: 'unread' | 'overdue';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['number', 'customer', 'type', 'phone', 'company', 'status', 'createdAt'])
  sortBy: 'number' | 'customer' | 'type' | 'phone' | 'company' | 'status' | 'createdAt' =
    'createdAt';

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
