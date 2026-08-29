import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { AdminModule } from './modules/admin/admin.module';
import { AutoCombatModule } from './modules/auto-combat/auto-combat.module';
import { CharactersModule } from './modules/characters/characters.module';
import { CombatModule } from './modules/combat/combat.module';
import { ConsumablesModule } from './modules/consumables/consumables.module';
import { CraftingModule } from './modules/crafting/crafting.module';
import { EquipmentModule } from './modules/equipment/equipment.module';
import { EconomyModule } from './modules/economy/economy.module';
import { GameClassesModule } from './modules/game-classes/game-classes.module';
import { GatheringModule } from './modules/gathering/gathering.module';
import { InfirmaryModule } from './modules/infirmary/infirmary.module';
import { IncursionsModule } from './modules/incursions/incursions.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ItemsModule } from './modules/items/items.module';
import { MapsModule } from './modules/maps/maps.module';
import { MobsModule } from './modules/mobs/mobs.module';
import { UsersModule } from './modules/users/users.module';
import { VendorModule } from './modules/vendor/vendor.module';
import { WorldBossesModule } from './modules/world-bosses/world-bosses.module';
import { ProgressionModule } from './modules/progression/progression.module';
import { PetsModule } from './modules/pets/pets.module';
import { SocialModule } from './modules/social/social.module';
import { ChatModule } from './modules/chat/chat.module';
import { CosmeticsModule } from './modules/cosmetics/cosmetics.module';
import { StorefrontModule } from './modules/storefront/storefront.module';
import { MarketplaceModule } from './modules/marketplace/marketplace.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisCoordinationModule } from './common/redis/redis-coordination.module';
import { AuditModule } from './common/audit/audit.module';
import { MailModule } from './common/mail/mail.module';
import { ObservabilityModule } from './common/observability/observability.module';
import { REDIS_COORDINATION_CLIENT } from './common/redis/redis.constants';
import { RedisThrottlerStorage } from './common/redis/redis-throttler.storage';
import { isConfigEnabled } from './common/redis/redis-client.factory';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    PrismaModule,
    RedisCoordinationModule,
    ThrottlerModule.forRootAsync({
      imports: [RedisCoordinationModule],
      inject: [REDIS_COORDINATION_CLIENT, ConfigService],
      useFactory: (redis: Redis | null, configService: ConfigService) => {
        const disableRateLimitForE2e =
          configService.get<string>('NODE_ENV')?.trim().toLowerCase() ===
            'test' && isConfigEnabled(configService, 'E2E_RATE_LIMIT_DISABLED');

        return {
          throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
          skipIf: () => disableRateLimitForE2e,
          ...(redis ? { storage: new RedisThrottlerStorage(redis) } : {}),
        };
      },
    }),
    AuditModule,
    MailModule,
    ObservabilityModule,

    GameClassesModule,
    MapsModule,
    MobsModule,
    ItemsModule,

    UsersModule,
    AuthModule,
    AdminModule,
    EconomyModule,

    CharactersModule,
    CosmeticsModule,
    StorefrontModule,
    MarketplaceModule,
    CombatModule,
    AutoCombatModule,

    InventoryModule,
    EquipmentModule,
    ConsumablesModule,
    InfirmaryModule,

    CraftingModule,
    GatheringModule,
    IncursionsModule,
    VendorModule,
    WorldBossesModule,
    PetsModule,
    ProgressionModule,
    SocialModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
