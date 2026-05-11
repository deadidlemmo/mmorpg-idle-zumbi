"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const auth_module_1 = require("./modules/auth/auth.module");
const auto_combat_module_1 = require("./modules/auto-combat/auto-combat.module");
const characters_module_1 = require("./modules/characters/characters.module");
const combat_module_1 = require("./modules/combat/combat.module");
const consumables_module_1 = require("./modules/consumables/consumables.module");
const crafting_module_1 = require("./modules/crafting/crafting.module");
const equipment_module_1 = require("./modules/equipment/equipment.module");
const game_classes_module_1 = require("./modules/game-classes/game-classes.module");
const gathering_module_1 = require("./modules/gathering/gathering.module");
const infirmary_module_1 = require("./modules/infirmary/infirmary.module");
const inventory_module_1 = require("./modules/inventory/inventory.module");
const items_module_1 = require("./modules/items/items.module");
const maps_module_1 = require("./modules/maps/maps.module");
const mobs_module_1 = require("./modules/mobs/mobs.module");
const users_module_1 = require("./modules/users/users.module");
const prisma_module_1 = require("./prisma/prisma.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
            }),
            prisma_module_1.PrismaModule,
            game_classes_module_1.GameClassesModule,
            maps_module_1.MapsModule,
            mobs_module_1.MobsModule,
            items_module_1.ItemsModule,
            users_module_1.UsersModule,
            auth_module_1.AuthModule,
            characters_module_1.CharactersModule,
            combat_module_1.CombatModule,
            auto_combat_module_1.AutoCombatModule,
            inventory_module_1.InventoryModule,
            equipment_module_1.EquipmentModule,
            consumables_module_1.ConsumablesModule,
            infirmary_module_1.InfirmaryModule,
            crafting_module_1.CraftingModule,
            gathering_module_1.GatheringModule,
        ],
        controllers: [app_controller_1.AppController],
        providers: [app_service_1.AppService],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map