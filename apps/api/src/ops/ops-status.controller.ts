import {
  Controller,
  Get,
  Header,
  Headers,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { createHash, timingSafeEqual } from 'node:crypto';
import { OpsStatusService } from './ops-status.service';

/**
 * Reachable through the public API host so that the external monitor can call
 * it; protected by `OPS_STATUS_TOKEN` and absent (404) without one.
 */
@Controller('ops')
@ApiExcludeController()
export class OpsStatusController {
  constructor(private readonly ops: OpsStatusService) {}

  @Get('status')
  @Header('Cache-Control', 'no-store')
  status(@Headers('authorization') authorization?: string) {
    const token = process.env.OPS_STATUS_TOKEN?.trim();
    if (!token) throw new NotFoundException();
    if (!sameSecret(authorization ?? '', `Bearer ${token}`)) throw new UnauthorizedException();
    return this.ops.status();
  }
}

function sameSecret(received: string, expected: string) {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(received), digest(expected));
}
