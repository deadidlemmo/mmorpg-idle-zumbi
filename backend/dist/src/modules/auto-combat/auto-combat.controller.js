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
exports.AutoCombatController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const auto_combat_service_1 = require("./auto-combat.service");
const preview_auto_combat_dto_1 = require("./dto/preview-auto-combat.dto");
const start_auto_combat_dto_1 = require("./dto/start-auto-combat.dto");
let AutoCombatController = class AutoCombatController {
    autoCombatService;
    constructor(autoCombatService) {
        this.autoCombatService = autoCombatService;
    }
    start(request, startAutoCombatDto) {
        return this.autoCombatService.start(request.user.id, startAutoCombatDto);
    }
    preview(request, previewAutoCombatDto) {
        return this.autoCombatService.preview(request.user.id, previewAutoCombatDto);
    }
    getStatus(request, characterId) {
        return this.autoCombatService.getStatus(request.user.id, characterId);
    }
    getRecentEvents(request, characterId) {
        return this.autoCombatService.getRecentEvents(request.user.id, characterId);
    }
    stop(request, characterId) {
        return this.autoCombatService.stop(request.user.id, characterId);
    }
};
exports.AutoCombatController = AutoCombatController;
__decorate([
    (0, common_1.Post)('start'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, start_auto_combat_dto_1.StartAutoCombatDto]),
    __metadata("design:returntype", void 0)
], AutoCombatController.prototype, "start", null);
__decorate([
    (0, common_1.Post)('preview'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, preview_auto_combat_dto_1.PreviewAutoCombatDto]),
    __metadata("design:returntype", void 0)
], AutoCombatController.prototype, "preview", null);
__decorate([
    (0, common_1.Get)(':characterId/status'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('characterId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AutoCombatController.prototype, "getStatus", null);
__decorate([
    (0, common_1.Get)(':characterId/recent-events'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('characterId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AutoCombatController.prototype, "getRecentEvents", null);
__decorate([
    (0, common_1.Post)(':characterId/stop'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('characterId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AutoCombatController.prototype, "stop", null);
exports.AutoCombatController = AutoCombatController = __decorate([
    (0, common_1.Controller)('auto-combat'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [auto_combat_service_1.AutoCombatService])
], AutoCombatController);
//# sourceMappingURL=auto-combat.controller.js.map