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
exports.CreateCharacterDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const AVAILABLE_CLASSES = ['Lutador', 'Assassino', 'Atirador', 'Médico'];
const AVAILABLE_AVATAR_KEYS = [
    'lutador-01',
    'lutador-02',
    'lutador-03',
    'lutador-04',
    'lutador-05',
    'lutador-06',
    'lutador-07',
    'lutador-08',
    'assassino-01',
    'assassino-02',
    'assassino-03',
    'assassino-04',
    'assassino-05',
    'assassino-06',
    'assassino-07',
    'assassino-08',
    'atirador-01',
    'atirador-02',
    'atirador-03',
    'atirador-04',
    'atirador-05',
    'atirador-06',
    'atirador-07',
    'atirador-08',
    'medico-01',
    'medico-02',
    'medico-03',
    'medico-04',
    'medico-05',
    'medico-06',
    'medico-07',
    'medico-08',
];
class CreateCharacterDto {
    name;
    className;
    avatarKey;
}
exports.CreateCharacterDto = CreateCharacterDto;
__decorate([
    (0, class_validator_1.IsString)({ message: 'O nome do personagem deve ser um texto.' }),
    (0, class_validator_1.IsNotEmpty)({ message: 'Informe o nome do personagem.' }),
    (0, class_validator_1.MinLength)(3, { message: 'O nome deve ter pelo menos 3 caracteres.' }),
    (0, class_validator_1.MaxLength)(24, { message: 'O nome deve ter no máximo 24 caracteres.' }),
    (0, class_validator_1.Matches)(/^[A-Za-zÀ-ÖØ-öø-ÿ0-9 ]+$/, {
        message: 'O nome do personagem pode conter apenas letras, números e espaços.',
    }),
    (0, class_transformer_1.Transform)(({ value }) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value),
    __metadata("design:type", String)
], CreateCharacterDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsString)({ message: 'A classe deve ser um texto.' }),
    (0, class_validator_1.IsNotEmpty)({ message: 'Informe a classe do personagem.' }),
    (0, class_validator_1.IsIn)(AVAILABLE_CLASSES, {
        message: 'Classe inválida. Escolha: Lutador, Assassino, Atirador ou Médico.',
    }),
    (0, class_transformer_1.Transform)(({ value }) => (typeof value === 'string' ? value.trim() : value)),
    __metadata("design:type", String)
], CreateCharacterDto.prototype, "className", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)({ message: 'O avatar deve ser um texto.' }),
    (0, class_validator_1.MaxLength)(40, { message: 'O avatar deve ter no máximo 40 caracteres.' }),
    (0, class_validator_1.Matches)(/^[a-z0-9-]+$/, {
        message: 'O avatar deve conter apenas letras minúsculas, números e hífen.',
    }),
    (0, class_validator_1.IsIn)(AVAILABLE_AVATAR_KEYS, {
        message: 'Avatar inválido.',
    }),
    (0, class_transformer_1.Transform)(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value),
    __metadata("design:type", String)
], CreateCharacterDto.prototype, "avatarKey", void 0);
//# sourceMappingURL=create-character.dto.js.map