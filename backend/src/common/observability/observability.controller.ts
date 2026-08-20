import {
  Controller,
  Get,
  Header,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ObservabilityService } from './observability.service';
import { MetricsTokenGuard } from './metrics-token.guard';

@Controller()
export class ObservabilityController {
  constructor(private readonly observability: ObservabilityService) {}

  @Get('health')
  getHealth() {
    return this.observability.getHealth();
  }

  @Get('health/ready')
  async getReadiness() {
    const health = await this.observability.getHealth();

    if (!health.ready) {
      throw new ServiceUnavailableException(health);
    }

    return health;
  }

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @UseGuards(MetricsTokenGuard)
  getMetrics() {
    return this.observability.renderPrometheusMetrics();
  }
}
