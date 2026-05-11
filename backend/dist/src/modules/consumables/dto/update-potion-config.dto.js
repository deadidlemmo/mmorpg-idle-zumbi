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
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdatePotionConfigDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
function toOptionalBoolean(value) {
    if (value === undefined || value === null || value === '') {
        return undefined;
    }
    if (value === true || value === 'true' || value === '1' || value === 1) {
        return true;
    }
    if (value === false || value === 'false' || value === '0' || value === 0) {
        return false;
    }
    return value;
}
function toOptionalNumber(value) {
    if (value === undefined || value === null || value === '') {
        return undefined;
    }
    return Number(value);
}
function toNullableUuid(value) {
    if (value === undefined ||
        value === null ||
        value === '' ||
        value === 'null') {
        return null;
    }
    return value;
}
class UpdatePotionConfigDto {
    enabled;
    potionItemId;
    hpThresholdPercent;
    useInManualCombat;
    useInAutoCombat;
}
exports.UpdatePotionConfigDto = UpdatePotionConfigDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => toOptionalBoolean(value)),
    (0, class_validator_1.IsBoolean)({
        message: 'O campo enabled precisa ser verdadeiro ou falso.',
    }),
    __metadata("design:type", Boolean)
], UpdatePotionConfigDto.prototype, "enabled", void 0);
__decorate([
    (0, class_transformer_1.Transform)(({ value }) => toNullableUuid(value)),
    (0, class_validator_1.ValidateIf)((_object, value) => value !== null && value !== undefined),
    (0, class_validator_1.IsUUID)('4', {
        message: 'O potionItemId precisa ser um UUID válido.',
    }),
    __metadata("design:type", Object)
], UpdatePotionConfigDto.prototype, "potionItemId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => toOptionalNumber(value)),
    (0, class_validator_1.IsInt)({
        message: 'A porcentagem de HP precisa ser um número inteiro.',
    }),
    (0, class_validator_1.Min)(1, {
        message: 'A porcentagem mínima é 1%.',
    }),
    (0, class_validator_1.Max)(100, {
        message: 'A porcentagem máxima é 100%.',
    }),
    __metadata("design:type", Number)
], UpdatePotionConfigDto.prototype, "hpThresholdPercent", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => toOptionalBoolean(value)),
    (0, class_validator_1.IsBoolean)({
        message: 'O campo useInManualCombat precisa ser verdadeiro ou falso.',
    }),
    __metadata("design:type", Boolean)
], UpdatePotionConfigDto.prototype, "useInManualCombat", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => toOptionalBoolean(value)),
    (0, class_validator_1.IsBoolean)({
        message: 'O campo useInAutoCombat precisa ser verdadeiro ou falso.',
    }),
    __metadata("design:type", Boolean)
], UpdatePotionConfigDto.prototype, "useInAutoCombat", void 0);
//# sourceMappingURL=update-potion-config.dto.js.map