import { BadRequestException, Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AddressService, type AddressSuggestion } from './address.service';

@Controller('address')
export class AddressController {
  constructor(private readonly addressService: AddressService) {}

  @Get('suggestions')
  suggest(@Query('query') query?: string, @Req() request?: Request): Promise<AddressSuggestion[]> {
    const normalizedQuery = query?.trim() ?? '';

    if (normalizedQuery.length < 3) {
      return Promise.resolve([]);
    }

    if (normalizedQuery.length > 300) {
      throw new BadRequestException('Адрес не должен превышать 300 символов.');
    }

    return this.addressService.suggest(normalizedQuery, request?.ip ?? 'unknown');
  }
}
