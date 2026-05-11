import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { AutoCombatModule } from './modules/auto-combat/auto-combat.module';
import { CharactersModule } from './modules/characters/characters.module';
import { CombatModule } from './modules/combat/combat.module';
import { ConsumablesModule } from './modules/consumables/consumables.module';
import { CraftingModule } from './modules/crafting/crafting.module';
import { EquipmentModule } from './modules/equipment/equipment.module';
import { GameClassesModule } from './modules/game-classes/game-classes.module';
import { GatheringModule } from './modules/gathering/gathering.module';
import { InfirmaryModule } from './modules/infirmary/infirmary.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ItemsModule } from './modules/items/items.module';
import { MapsModule } from './modules/maps/maps.module';
import { MobsModule } from './modules/mobs/mobs.module';
import { UsersModule } from './modules/users/users.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    PrismaModule,

    GameClassesModule,
    MapsModule,
    MobsModule,
    ItemsModule,

    UsersModule,
    AuthModule,

    CharactersModule,
    CombatModule,
    AutoCombatModule,

    InventoryModule,
    EquipmentModule,
    ConsumablesModule,
    InfirmaryModule,

    CraftingModule,
    GatheringModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}