import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type OperationalAlert = {
  code: string;
  severity: 'warning' | 'critical';
  message: string;
};

@Injectable()
export class OperationalAlertDispatcher {
  private readonly logger = new Logger(OperationalAlertDispatcher.name);

  constructor(private readonly configService: ConfigService) {}

  async dispatch(alert: OperationalAlert) {
    const webhookUrl = this.configService
      .get<string>('ALERT_WEBHOOK_URL')
      ?.trim();

    if (!webhookUrl) return;

    const timeoutMs = this.getPositiveConfig('ALERT_WEBHOOK_TIMEOUT_MS', 5_000);
    const token = this.configService.get<string>('ALERT_WEBHOOK_TOKEN')?.trim();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          application: 'dead-idle',
          environment:
            this.configService.get<string>('NODE_ENV')?.trim() || 'development',
          emittedAt: new Date().toISOString(),
          alert,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Webhook respondeu HTTP ${response.status}.`);
      }
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'operational_alert_delivery_failed',
          code: alert.code,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private getPositiveConfig(key: string, fallback: number) {
    const value = Number(this.configService.get<string>(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
