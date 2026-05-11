"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InfirmaryModule = void 0;
const common_1 = require("@nestjs/common");
const activity_guard_module_1 = require("../../common/activity-guard/activity-guard.module");
const prisma_module_1 = require("../../prisma/prisma.module");
const infirmary_controller_1 = require("./infirmary.controller");
const infirmary_service_1 = require("./infirmary.service");
let InfirmaryModule = class InfirmaryModule {
};
exports.InfirmaryModule = InfirmaryModule;
exports.InfirmaryModule = InfirmaryModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule, activity_guard_module_1.ActivityGuardModule],
        controllers: [infirmary_controller_1.InfirmaryController],
        providers: [infirmary_service_1.InfirmaryService],
        exports: [infirmary_service_1.InfirmaryService],
    })
], InfirmaryModule);
//# sourceMappingURL=infirmary.module.js.map