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
exports.GameClassesController = void 0;
const common_1 = require("@nestjs/common");
const game_classes_service_1 = require("./game-classes.service");
let GameClassesController = class GameClassesController {
    gameClassesService;
    constructor(gameClassesService) {
        this.gameClassesService = gameClassesService;
    }
    findAll() {
        return this.gameClassesService.findAll();
    }
    findOne(id) {
        return this.gameClassesService.findOne(id);
    }
};
exports.GameClassesController = GameClassesController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], GameClassesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], GameClassesController.prototype, "findOne", null);
exports.GameClassesController = GameClassesController = __decorate([
    (0, common_1.Controller)('game-classes'),
    __metadata("design:paramtypes", [game_classes_service_1.GameClassesService])
], GameClassesController);
//# sourceMappingURL=game-classes.controller.js.map