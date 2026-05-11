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
exports.ConsumablesController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const consumables_service_1 = require("./consumables.service");
const update_potion_config_dto_1 = require("./dto/update-potion-config.dto");
const use_consumable_dto_1 = require("./dto/use-consumable.dto");
const UUID_V4_PIPE = new common_1.ParseUUIDPipe({
    version: '4',
    errorHttpStatusCode: 400,
});
let ConsumablesController = class ConsumablesController {
    consumablesService;
    constructor(consumablesService) {
        this.consumablesService = consumablesService;
    }
    getUserId(request) {
        const userId = request.user?.id ?? request.user?.userId ?? request.user?.sub;
        if (!userId) {
            throw new common_1.UnauthorizedException('Usuário não autenticado.');
        }
        return userId;
    }
    use(request, useConsumableDto) {
        return this.consumablesService.use(this.getUserId(request), useConsumableDto);
    }
    getPotionConfig(request, characterId) {
        return this.consumablesService.getPotionConfig(this.getUserId(request), characterId);
    }
    updatePotionConfig(request, characterId, updatePotionConfigDto) {
        return this.consumablesService.updatePotionConfig(this.getUserId(request), characterId, updatePotionConfigDto);
    }
};
exports.ConsumablesController = ConsumablesController;
__decorate([
    (0, common_1.Post)('use'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, use_consumable_dto_1.UseConsumableDto]),
    __metadata("design:returntype", void 0)
], ConsumablesController.prototype, "use", null);
__decorate([
    (0, common_1.Get)(':characterId/config'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('characterId', UUID_V4_PIPE)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ConsumablesController.prototype, "getPotionConfig", null);
__decorate([
    (0, common_1.Patch)(':characterId/config'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('characterId', UUID_V4_PIPE)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, update_potion_config_dto_1.UpdatePotionConfigDto]),
    __metadata("design:returntype", void 0)
], ConsumablesController.prototype, "updatePotionConfig", null);
exports.ConsumablesController = ConsumablesController = __decorate([
    (0, common_1.Controller)('consumables'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [consumables_service_1.ConsumablesService])
], ConsumablesController);
//# sourceMappingURL=consumables.controller.js.map