"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutoCombatModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const jwt_1 = require("@nestjs/jwt");
const activity_guard_module_1 = require("../../common/activity-guard/activity-guard.module");
const prisma_module_1 = require("../../prisma/prisma.module");
const auto_combat_controller_1 = require("./auto-combat.controller");
const auto_combat_gateway_1 = require("./auto-combat.gateway");
const auto_combat_service_1 = require("./auto-combat.service");
let AutoCombatModule = class AutoCombatModule {
};
exports.AutoCombatModule = AutoCombatModule;
exports.AutoCombatModule = AutoCombatModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            activity_guard_module_1.ActivityGuardModule,
            jwt_1.JwtModule.registerAsync({
                imports: [config_1.ConfigModule],
                inject: [config_1.ConfigService],
                useFactory: (configService) => ({
                    secret: configService.getOrThrow('JWT_SECRET'),
                }),
            }),
        ],
        controllers: [auto_combat_controller_1.AutoCombatController],
        providers: [auto_combat_service_1.AutoCombatService, auto_combat_gateway_1.AutoCombatGateway],
        exports: [auto_combat_service_1.AutoCombatService],
    })
], AutoCombatModule);
//# sourceMappingURL=auto-combat.module.js.map