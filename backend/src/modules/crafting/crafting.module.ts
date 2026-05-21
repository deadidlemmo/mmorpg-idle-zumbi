import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ActivityGuardModule } from '../../common/activity-guard/activity-guard.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { CraftingController } from './crafting.controller';
import { CraftingGateway } from './crafting.gateway';
import { CraftingService } from './crafting.service';

@Module({
  imports: [
    PrismaModule,
    ActivityGuardModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [CraftingController],
  providers: [CraftingService, CraftingGateway],
  exports: [CraftingService],
})
export class CraftingModule {}
