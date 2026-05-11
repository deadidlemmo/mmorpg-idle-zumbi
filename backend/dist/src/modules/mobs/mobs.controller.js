"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MobsController = void 0;
const common_1 = require("@nestjs/common");
const mobs_service_1 = require("./mobs.service");
let MobsController = class MobsController {
    mobsService;
    constructor(mobsService) {
        this.mobsService = mobsService;
    }
    findAll() {
        return this.mobsService.findAll();
    }
    findOne(id) {
        return this.mobsService.findOne(id);
    }
};
exports.MobsController = MobsController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], MobsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], MobsController.prototype, "findOne", null);
exports.MobsController = MobsController = __decorate([
    (0, common_1.Controller)('mobs'),
    __metadata("design:paramtypes", [mobs_service_1.MobsService])
], MobsController);
//# sourceMappingURL=mobs.controller.js.map