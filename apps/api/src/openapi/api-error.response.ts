import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Error body written by ApiExceptionFilter for every 4xx and 5xx answer. */
export class ApiError {
  statusCode!: number;
  /** Text for the user; an array lists validation errors of the request body. */
  @ApiProperty({ oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] })
  message!: string | string[];
  /** Machine-readable reason, e.g. TWO_FACTOR_ACCOUNT_LOCKED or CAPTCHA_INVALID. */
  code?: string;
  error?: string;
  status?: string;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  checks?: Record<string, unknown>;
  requestId!: string;
}
