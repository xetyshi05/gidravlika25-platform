import { Global, Module } from '@nestjs/common';
import { HttpMetricsService } from './http-metrics.service';

@Global()
@Module({
  providers: [HttpMetricsService],
  exports: [HttpMetricsService],
})
export class ObservabilityModule {}
