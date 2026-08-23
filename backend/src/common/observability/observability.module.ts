import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ObservabilityController } from './observability.controller';
import { ObservabilityInterceptor } from './observability.interceptor';
import { ObservabilityService } from './observability.service';
import { MetricsTokenGuard } from './metrics-token.guard';
import { BackupStatusService } from './backup-status.service';
import { OperationalAlertDispatcher } from './operational-alert-dispatcher.service';

@Global()
@Module({
  controllers: [ObservabilityController],
  providers: [
    ObservabilityService,
    BackupStatusService,
    OperationalAlertDispatcher,
    MetricsTokenGuard,
    {
      provide: APP_INTERCEPTOR,
      useClass: ObservabilityInterceptor,
    },
  ],
  exports: [ObservabilityService, BackupStatusService],
})
export class ObservabilityModule {}
