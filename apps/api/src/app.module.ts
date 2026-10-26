import { Module } from '@nestjs/common';
import { AddressModule } from './address/address.module';
import { CatalogModule } from './catalog/catalog.module';
import { PrismaModule } from './prisma/prisma.module';
import { RequestsModule } from './requests/requests.module';
import { CustomersModule } from './customers/customers.module';
import { AuthModule } from './auth/auth.module';
import { BackofficeModule } from './backoffice/backoffice.module';
import { HealthController } from './health/health.controller';
import { ObservabilityModule } from './observability/observability.module';
import { OpsModule } from './ops/ops.module';

@Module({
  imports: [
    ObservabilityModule,
    PrismaModule,
    CatalogModule,
    AddressModule,
    RequestsModule,
    CustomersModule,
    AuthModule,
    BackofficeModule,
    OpsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
