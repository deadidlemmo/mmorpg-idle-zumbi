import { Module } from '@nestjs/common';
import { MembershipModule } from '../membership/membership.module';
import { TopIdleController } from './top-idle.controller';
import { TopIdleService } from './top-idle.service';
import { TopIdleWebhookController } from './top-idle-webhook.controller';

@Module({
  imports: [MembershipModule],
  controllers: [TopIdleController, TopIdleWebhookController],
  providers: [TopIdleService],
})
export class TopIdleModule {}
