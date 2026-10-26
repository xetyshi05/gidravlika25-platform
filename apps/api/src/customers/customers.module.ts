import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CrmAdminGuard } from '../auth/crm-admin.guard';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { PersonalDataRetentionService } from './personal-data-retention.service';

@Module({
  imports: [AuthModule],
  controllers: [CustomersController],
  providers: [CustomersService, CrmAdminGuard, PersonalDataRetentionService],
})
export class CustomersModule {}
