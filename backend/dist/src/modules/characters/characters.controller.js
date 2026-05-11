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
exports.CharactersController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const characters_service_1 = require("./characters.service");
const create_character_dto_1 = require("./dto/create-character.dto");
let CharactersController = class CharactersController {
    charactersService;
    constructor(charactersService) {
        this.charactersService = charactersService;
    }
    create(request, createCharacterDto) {
        return this.charactersService.create(request.user.id, createCharacterDto);
    }
    findMine(request) {
        return this.charactersService.findMine(request.user.id);
    }
    getStatus(request, id) {
        return this.charactersService.getStatus(request.user.id, id);
    }
    getOverview(request, id) {
        return this.charactersService.getOverview(request.user.id, id);
    }
    findOneMine(request, id) {
        return this.charactersService.findOneMine(request.user.id, id);
    }
    deleteMine(request, id) {
        return this.charactersService.deleteMine(request.user.id, id);
    }
};
exports.CharactersController = CharactersController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_character_dto_1.CreateCharacterDto]),
    __metadata("design:returntype", void 0)
], CharactersController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('me'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CharactersController.prototype, "findMine", null);
__decorate([
    (0, common_1.Get)(':id/status'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], CharactersController.prototype, "getStatus", null);
__decorate([
    (0, common_1.Get)(':id/overview'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], CharactersController.prototype, "getOverview", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], CharactersController.prototype, "findOneMine", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], CharactersController.prototype, "deleteMine", null);
exports.CharactersController = CharactersController = __decorate([
    (0, common_1.Controller)('characters'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [characters_service_1.CharactersService])
], CharactersController);
//# sourceMappingURL=characters.controller.js.map