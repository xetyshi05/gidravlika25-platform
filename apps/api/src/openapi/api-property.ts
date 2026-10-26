import { ApiProperty } from '@nestjs/swagger';

/** Prisma Decimal: serialized to JSON as a string such as "12500.00". */
export function DecimalString(options: { nullable?: boolean } = {}) {
  return ApiProperty({ type: 'string', example: '12500.00', nullable: options.nullable });
}

/** A Prisma Json column: an arbitrary JSON object (or null) chosen by the writer. */
export function JsonObject(options: { nullable?: boolean } = {}) {
  return ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: options.nullable,
  });
}
