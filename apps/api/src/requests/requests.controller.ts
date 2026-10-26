import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Ip,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { AuthenticatedGuard } from '../auth/authenticated.guard';
import { CreateRequestCommentDto } from './dto/create-request-comment.dto';
import { CreateCartRequestDto } from './dto/create-cart-request.dto';
import { CreateCustomRequestDto } from './dto/create-custom-request.dto';
import { CreateWholesaleRequestDto } from './dto/create-wholesale-request.dto';
import { RequestQueryDto } from './dto/request-query.dto';
import { RequestHistoryQueryDto } from './dto/request-history-query.dto';
import { UpdateRequestStatusDto } from './dto/update-request-status.dto';
import { RequestsService } from './requests.service';
import { PublicRequestSecurityService } from './public-request-security.service';
import { PublicRequestCaptchaService } from './public-request-captcha.service';
import type { RequestType } from '@prisma/client';
import {
  PublicRequestReceipt,
  RequestDetails,
  RequestList,
  RequestReadMark,
  RequestStats,
} from './requests.response';

type PublicRequestDto = {
  website?: string;
  altcha?: string;
  phone: string;
  email?: string;
};

@Controller('requests')
export class RequestsController {
  constructor(
    private readonly requestsService: RequestsService,
    private readonly publicRequestSecurity: PublicRequestSecurityService,
    private readonly captcha: PublicRequestCaptchaService,
  ) {}

  // Public: the ALTCHA widget fetches a fresh signed challenge per form.
  @Get('challenge')
  @Header('Cache-Control', 'no-store')
  // Read only by the ALTCHA widget, so its fields are not part of the contract.
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  challenge() {
    return this.captcha.createChallenge();
  }

  @Post('cart')
  async createCartRequest(
    @Body() dto: CreateCartRequestDto,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Ip() ipAddress?: string,
  ): Promise<PublicRequestReceipt> {
    const receipt = await this.checkPublicRequest('CART', dto, idempotencyKey, ipAddress);
    if (receipt) return receipt;
    return this.requestsService.createCartRequest(dto, idempotencyKey);
  }

  @Post('custom')
  async createCustomRequest(
    @Body() dto: CreateCustomRequestDto,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Ip() ipAddress?: string,
  ): Promise<PublicRequestReceipt> {
    const receipt = await this.checkPublicRequest('CUSTOM', dto, idempotencyKey, ipAddress);
    if (receipt) return receipt;
    return this.requestsService.createCustomRequest(dto, idempotencyKey);
  }

  @Post('wholesale')
  async createWholesaleRequest(
    @Body() dto: CreateWholesaleRequestDto,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Ip() ipAddress?: string,
  ): Promise<PublicRequestReceipt> {
    const receipt = await this.checkPublicRequest('WHOLESALE', dto, idempotencyKey, ipAddress);
    if (receipt) return receipt;
    return this.requestsService.createWholesaleRequest(dto, idempotencyKey);
  }

  @Get('stats')
  @UseGuards(AuthenticatedGuard)
  @ApiBearerAuth()
  getStats(@Req() request: AuthenticatedRequest): Promise<RequestStats> {
    return this.requestsService.getStats(request.currentUser.id);
  }

  @Get()
  @UseGuards(AuthenticatedGuard)
  @ApiBearerAuth()
  getRequests(
    @Query() query: RequestQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<RequestList> {
    return this.requestsService.getRequests(query, request.currentUser.id);
  }

  @Post(':id/read')
  @UseGuards(AuthenticatedGuard)
  @ApiBearerAuth()
  markRequestRead(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<RequestReadMark> {
    return this.requestsService.markRequestRead(id, request.currentUser.id);
  }

  @Patch(':id/status')
  @UseGuards(AuthenticatedGuard)
  @ApiBearerAuth()
  updateRequestStatus(
    @Param('id') id: string,
    @Body() dto: UpdateRequestStatusDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<RequestDetails> {
    // The guard has already loaded the user (PERF-02).
    return this.requestsService.updateRequestStatus(id, dto, request.currentUser.id);
  }

  @Post(':id/comments')
  @UseGuards(AuthenticatedGuard)
  @ApiBearerAuth()
  createRequestComment(
    @Param('id') id: string,
    @Body() dto: CreateRequestCommentDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<RequestDetails> {
    return this.requestsService.createRequestComment(id, dto, request.currentUser.id);
  }

  @Get(':id')
  @UseGuards(AuthenticatedGuard)
  @ApiBearerAuth()
  getRequest(
    @Param('id') id: string,
    @Query() query: RequestHistoryQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<RequestDetails> {
    return this.requestsService.getRequest(id, request.currentUser.id, query);
  }

  /**
   * Anti-spam checks shared by the public forms (SEC-03), cheapest first.
   * Returns a receipt when the submission must not create anything new.
   * Nothing is stored for a request that fails the CAPTCHA; the contact and
   * global budgets are spent only by requests that solved it.
   */
  private async checkPublicRequest(
    type: RequestType,
    dto: PublicRequestDto,
    idempotencyKey: string | undefined,
    ipAddress: string | undefined,
  ) {
    const honeypotReceipt = this.publicRequestSecurity.getHoneypotReceipt(dto.website);
    if (honeypotReceipt) return honeypotReceipt;
    await this.publicRequestSecurity.consume(ipAddress);
    const existing = await this.requestsService.findPublicReceipt(type, idempotencyKey, dto);
    if (existing) return existing;
    await this.captcha.verify(dto.altcha);
    await this.publicRequestSecurity.consumeContactBudget(dto);
    return null;
  }
}

type AuthenticatedRequest = {
  currentUser: { id: string; name: string; role: string };
};
