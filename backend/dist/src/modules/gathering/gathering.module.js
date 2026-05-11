"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GatheringModule = void 0;
const common_1 = require("@nestjs/common");
const activity_guard_module_1 = require("../../common/activity-guard/activity-guard.module");
const prisma_module_1 = require("../../prisma/prisma.module");
const gathering_controller_1 = require("./gathering.controller");
const gathering_gateway_1 = require("./gathering.gateway");
const gathering_service_1 = require("./gathering.service");
let GatheringModule = class GatheringModule {
};
exports.GatheringModule = GatheringModule;
exports.GatheringModule = GatheringModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule, activity_guard_module_1.ActivityGuardModule],
        controllers: [gathering_controller_1.GatheringController],
        providers: [gathering_service_1.GatheringService, gathering_gateway_1.GatheringGateway],
        exports: [gathering_service_1.GatheringService],
    })
], GatheringModule);
//# sourceMappingURL=gathering.module.js.map