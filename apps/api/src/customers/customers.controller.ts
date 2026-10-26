import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { AuthenticatedGuard } from '../auth/authenticated.guard';
import { CrmAdminGuard } from '../auth/crm-admin.guard';
import { AnonymizeCustomerDto } from './dto/anonymize-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { CustomerRequestsQueryDto } from './dto/customer-requests-query.dto';
import { CustomersService } from './customers.service';
import { MergeCustomerDto } from './dto/merge-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import {
  CustomerAnonymization,
  CustomerDetails,
  CustomerList,
  CustomerPersonalDataExport,
} from './customers.response';

@Controller('customers')
@UseGuards(AuthenticatedGuard)
@ApiBearerAuth()
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  getCustomers(@Query() query: CustomerQueryDto): Promise<CustomerList> {
    return this.customersService.getCustomers(query);
  }

  @Get(':id')
  getCustomer(
    @Param('id') id: string,
    @Query() query: CustomerRequestsQueryDto,
  ): Promise<CustomerDetails> {
    return this.customersService.getCustomer(id, query);
  }

  @Get(':id/personal-data')
  @UseGuards(CrmAdminGuard)
  getCustomerPersonalData(@Param('id') id: string): Promise<CustomerPersonalDataExport> {
    return this.customersService.getCustomerPersonalData(id);
  }

  @Patch(':id')
  updateCustomer(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<CustomerDetails> {
    // The guard has already loaded the user (PERF-02).
    return this.customersService.updateCustomer(id, dto, request.currentUser.id);
  }

  @Post(':id/merge')
  mergeCustomer(
    @Param('id') id: string,
    @Body() dto: MergeCustomerDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<CustomerDetails> {
    return this.customersService.mergeCustomer(id, dto, request.currentUser.id);
  }

  @Post(':id/anonymize')
  @UseGuards(CrmAdminGuard)
  anonymizeCustomer(
    @Param('id') id: string,
    @Body() dto: AnonymizeCustomerDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<CustomerAnonymization> {
    return this.customersService.anonymizeCustomer(id, dto, request.currentUser.id);
  }
}

type AuthenticatedRequest = {
  currentUser: { id: string; name: string; role: string };
};
