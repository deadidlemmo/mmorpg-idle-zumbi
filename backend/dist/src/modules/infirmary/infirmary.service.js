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
exports.InfirmaryService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const activity_guard_service_1 = require("../../common/activity-guard/activity-guard.service");
const stats_util_1 = require("../../common/utils/stats.util");
const prisma_service_1 = require("../../prisma/prisma.service");
let InfirmaryService = class InfirmaryService {
    prisma;
    activityGuard;
    constructor(prisma, activityGuard) {
        this.prisma = prisma;
        this.activityGuard = activityGuard;
    }
    async getStatus(userId, characterId) {
        const character = await this.findCharacterWithStats(userId, characterId);
        const activityState = await this.activityGuard.getCharacterActivityState({
            characterId: character.id,
            userId,
        });
        const maxHp = this.calculateCharacterMaxHp(character);
        const currentHp = this.clampHp(character.currentHp ?? maxHp, maxHp);
        const missingHp = Math.max(0, maxHp - currentHp);
        let canHeal = true;
        let reason = 'Personagem pode ser curado na enfermaria.';
        if (activityState.hasActiveAutoCombat) {
            canHeal = false;
            reason = 'Não é possível usar a enfermaria durante auto-combate ativo.';
        }
        else if (activityState.hasActiveGathering) {
            canHeal = false;
            reason =
                'Não é possível usar a enfermaria durante gathering. Encerre o gathering antes de curar.';
        }
        else if (character.status === client_1.CharacterStatus.BLOCKED) {
            canHeal = false;
            reason = 'Personagem bloqueado não pode usar a enfermaria.';
        }
        else if (missingHp <= 0) {
            canHeal = false;
            reason = 'Personagem já está com HP cheio.';
        }
        return {
            character: {
                id: character.id,
                name: character.name,
                status: character.status,
                level: character.level,
                xp: character.xp,
                currentHp,
                maxHp,
            },
            infirmary: {
                canHeal,
                reason,
                currentHp,
                maxHp,
                missingHp,
                hasActiveAutoCombat: activityState.hasActiveAutoCombat,
                hasActiveGathering: activityState.hasActiveGathering,
                activeAutoCombatSession: activityState.activeAutoCombatSession,
                activeGatheringSession: activityState.activeGatheringSession,
                cost: {
                    type: 'FREE_MVP',
                    amount: 0,
                },
            },
        };
    }
    async heal(userId, characterId) {
        const character = await this.findCharacterWithStats(userId, characterId);
        await this.activityGuard.ensureCanUseInfirmary({
            characterId: character.id,
            userId,
        });
        const maxHp = this.calculateCharacterMaxHp(character);
        const oldHp = this.clampHp(character.currentHp ?? maxHp, maxHp);
        if (oldHp >= maxHp) {
            throw new common_1.BadRequestException('Personagem já está com HP cheio.');
        }
        const healedCharacter = await this.prisma.character.update({
            where: {
                id: character.id,
            },
            data: {
                currentHp: maxHp,
                maxHp,
                status: character.status === client_1.CharacterStatus.DEAD
                    ? client_1.CharacterStatus.ACTIVE
                    : character.status,
            },
        });
        return {
            message: 'Personagem curado na enfermaria com sucesso.',
            character: {
                id: healedCharacter.id,
                name: healedCharacter.name,
                status: healedCharacter.status,
                level: healedCharacter.level,
                xp: healedCharacter.xp,
                currentHp: healedCharacter.currentHp,
                maxHp: healedCharacter.maxHp,
            },
            healing: {
                oldHp,
                newHp: maxHp,
                maxHp,
                healedAmount: maxHp - oldHp,
            },
            cost: {
                type: 'FREE_MVP',
                amount: 0,
            },
        };
    }
    async findCharacterWithStats(userId, characterId) {
        const character = await this.prisma.character.findFirst({
            where: {
                id: characterId,
                userId,
            },
            include: {
                class: true,
                equipment: {
                    include: {
                        mainHand: true,
                        offHand: true,
                        head: true,
                        armor: true,
                        pants: true,
                        boots: true,
                    },
                },
            },
        });
        if (!character) {
            throw new common_1.NotFoundException('Personagem não encontrado.');
        }
        return character;
    }
    calculateCharacterMaxHp(character) {
        const equipmentItems = [
            character.equipment?.mainHand,
            character.equipment?.offHand,
            character.equipment?.head,
            character.equipment?.armor,
            character.equipment?.pants,
            character.equipment?.boots,
        ];
        const stats = (0, stats_util_1.calculateFullStats)(character.class, equipmentItems, character.level);
        return stats.derivedCombatStats.maxHp;
    }
    clampHp(currentHp, maxHp) {
        return Math.max(0, Math.min(currentHp, maxHp));
    }
};
exports.InfirmaryService = InfirmaryService;
exports.InfirmaryService = InfirmaryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        activity_guard_service_1.ActivityGuardService])
], InfirmaryService);
//# sourceMappingURL=infirmary.service.js.map