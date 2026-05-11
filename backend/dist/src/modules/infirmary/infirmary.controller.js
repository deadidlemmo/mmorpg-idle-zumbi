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
exports.InfirmaryController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const infirmary_service_1 = require("./infirmary.service");
let InfirmaryController = class InfirmaryController {
    infirmaryService;
    constructor(infirmaryService) {
        this.infirmaryService = infirmaryService;
    }
    getStatus(req, characterId) {
        const userId = req.user.id ?? req.user.sub;
        return this.infirmaryService.getStatus(userId, characterId);
    }
    heal(req, characterId) {
        const userId = req.user.id ?? req.user.sub;
        return this.infirmaryService.heal(userId, characterId);
    }
};
exports.InfirmaryController = InfirmaryController;
__decorate([
    (0, common_1.Get)(':characterId/status'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('characterId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], InfirmaryController.prototype, "getStatus", null);
__decorate([
    (0, common_1.Post)(':characterId/heal'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('characterId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], InfirmaryController.prototype, "heal", null);
exports.InfirmaryController = InfirmaryController = __decorate([
    (0, common_1.Controller)('infirmary'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [infirmary_service_1.InfirmaryService])
], InfirmaryController);
//# sourceMappingURL=infirmary.controller.js.map