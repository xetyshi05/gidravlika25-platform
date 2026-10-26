import { Module } from '@nestjs/common';
import { AddressModule } from '../address/address.module';
import { BackofficeModule } from '../backoffice/backoffice.module';
import { OpsStatusController } from './ops-status.controller';
import { OpsStatusService } from './ops-status.service';

@Module({
  imports: [AddressModule, BackofficeModule],
  controllers: [OpsStatusController],
  providers: [OpsStatusService],
})
export class OpsModule {}
