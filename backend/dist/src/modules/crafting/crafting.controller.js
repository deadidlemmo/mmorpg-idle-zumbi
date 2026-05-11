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
exports.CraftingController = void 0;
const common_1 = require("@nestjs/common");
const crafting_service_1 = require("./crafting.service");
const craft_item_dto_1 = require("./dto/craft-item.dto");
let CraftingController = class CraftingController {
    craftingService;
    constructor(craftingService) {
        this.craftingService = craftingService;
    }
    listCharacterRecipes(characterId, tier, slot, craftableOnly) {
        return this.craftingService.listCharacterRecipes({
            characterId,
            tier: tier ? Number(tier) : undefined,
            slot: slot ? slot : undefined,
            craftableOnly: craftableOnly === 'true',
        });
    }
    getRecipe(itemId) {
        return this.craftingService.getRecipeByOutputItemId(itemId);
    }
    craft(dto) {
        return this.craftingService.craft(dto);
    }
};
exports.CraftingController = CraftingController;
__decorate([
    (0, common_1.Get)('character/:characterId/recipes'),
    __param(0, (0, common_1.Param)('characterId')),
    __param(1, (0, common_1.Query)('tier')),
    __param(2, (0, common_1.Query)('slot')),
    __param(3, (0, common_1.Query)('craftableOnly')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", void 0)
], CraftingController.prototype, "listCharacterRecipes", null);
__decorate([
    (0, common_1.Get)(':itemId/recipe'),
    __param(0, (0, common_1.Param)('itemId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CraftingController.prototype, "getRecipe", null);
__decorate([
    (0, common_1.Post)('craft'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [craft_item_dto_1.CraftItemDto]),
    __metadata("design:returntype", void 0)
], CraftingController.prototype, "craft", null);
exports.CraftingController = CraftingController = __decorate([
    (0, common_1.Controller)('crafting'),
    __metadata("design:paramtypes", [crafting_service_1.CraftingService])
], CraftingController);
//# sourceMappingURL=crafting.controller.js.map