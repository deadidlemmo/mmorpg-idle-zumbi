"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MobsModule = void 0;
const common_1 = require("@nestjs/common");
const mobs_controller_1 = require("./mobs.controller");
const mobs_service_1 = require("./mobs.service");
let MobsModule = class MobsModule {
};
exports.MobsModule = MobsModule;
exports.MobsModule = MobsModule = __decorate([
    (0, common_1.Module)({
        controllers: [mobs_controller_1.MobsController],
        providers: [mobs_service_1.MobsService]
    })
], MobsModule);
//# sourceMappingURL=mobs.module.js.map