import type { ConfigService } from '@nestjs/config';

export const TOP_IDLE_GAME_URL = 'https://topidle.com/jogo/dead-idle-8c0924';
export const TOP_IDLE_REWARD_PREMIUM_DAYS = 1;
export const TOP_IDLE_REWARD_COOLDOWN_HOURS = 24;
export const TOP_IDLE_WEBHOOK_MAX_AGE_SECONDS = 300;

export function getTopIdleSettings(configService: ConfigService) {
  const webhookSecret =
    configService.get<string>('TOPIDLE_WEBHOOK_SECRET')?.trim() ?? '';
  const rewardsRequested =
    configService
      .get<string>('TOPIDLE_REWARDS_ENABLED')
      ?.trim()
      .toLowerCase() === 'true';

  return {
    webhookSecret,
    rewardsRequested,
    rewardsEnabled: rewardsRequested && webhookSecret.length > 0,
  };
}
