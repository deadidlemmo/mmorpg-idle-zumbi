import { Module } from '@nestjs/common';
import { RedisCoordinationModule } from '../../common/redis/redis-coordination.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';

@Module({
  imports: [PrismaModule, AuthModule, RedisCoordinationModule],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway],
})
export class ChatModule {}
