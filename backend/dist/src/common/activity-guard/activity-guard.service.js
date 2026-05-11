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
exports.ActivityGuardService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../../prisma/prisma.service");
let ActivityGuardService = class ActivityGuardService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getCharacterActivityState(params) {
        const character = await this.prisma.character.findFirst({
            where: {
                id: params.characterId,
                ...(params.userId ? { userId: params.userId } : {}),
            },
            select: {
                id: true,
                name: true,
                status: true,
                level: true,
                currentHp: true,
                maxHp: true,
            },
        });
        if (!character) {
            throw new common_1.NotFoundException('Personagem não encontrado.');
        }
        const [activeAutoCombatSession, activeGatheringSession] = await Promise.all([
            this.prisma.autoCombatSession.findFirst({
                where: {
                    characterId: character.id,
                    status: client_1.AutoCombatSessionStatus.ACTIVE,
                },
                orderBy: {
                    startedAt: 'desc',
                },
                select: {
                    id: true,
                    status: true,
                    startedAt: true,
                    endsAt: true,
                    lastProcessedAt: true,
                    subMap: {
                        select: {
                            id: true,
                            name: true,
                            tier: true,
                            map: {
                                select: {
                                    id: true,
                                    name: true,
                                    tier: true,
                                },
                            },
                        },
                    },
                },
            }),
            this.prisma.gatheringSession.findFirst({
                where: {
                    characterId: character.id,
                    status: client_1.ActivityStatus.ACTIVE,
                },
                orderBy: {
                    startedAt: 'desc',
                },
                select: {
                    id: true,
                    status: true,
                    origin: true,
                    startedAt: true,
                    lastResolvedAt: true,
                    targetMaterial: {
                        select: {
                            id: true,
                            name: true,
                            tier: true,
                            materialOrigin: true,
                        },
                    },
                    map: {
                        select: {
                            id: true,
                            name: true,
                            tier: true,
                        },
                    },
                },
            }),
        ]);
        const currentHp = this.resolveCurrentHp(character);
        return {
            character,
            currentHp,
            activeAutoCombatSession,
            activeGatheringSession,
            hasActiveAutoCombat: Boolean(activeAutoCombatSession),
            hasActiveGathering: Boolean(activeGatheringSession),
        };
    }
    async ensureCanStartGathering(params) {
        const state = await this.getCharacterActivityState(params);
        this.ensureCharacterIsActive(state.character.status, 'Apenas personagens ativos podem iniciar gathering.');
        this.ensureCharacterHasHp(state.currentHp, 'Personagens derrotados ou com 0 de HP não podem iniciar gathering. Cure o personagem antes.');
        if (state.hasActiveGathering) {
            throw new common_1.BadRequestException({
                message: 'Este personagem já possui um gathering ativo.',
                activeGathering: state.activeGatheringSession,
            });
        }
        if (state.hasActiveAutoCombat) {
            throw new common_1.BadRequestException({
                message: 'Este personagem está em auto-combate. Pare o auto-combate antes de iniciar gathering.',
                activeAutoCombat: state.activeAutoCombatSession,
            });
        }
        return state;
    }
    async ensureCanCollectGathering(params) {
        const state = await this.getCharacterActivityState(params);
        this.ensureCharacterIsActive(state.character.status, 'Apenas personagens ativos podem coletar gathering.');
        this.ensureCharacterHasHp(state.currentHp, 'Personagens derrotados ou com 0 de HP não podem coletar gathering. Cure o personagem antes.');
        return state;
    }
    async ensureCanStartAutoCombat(params) {
        const state = await this.getCharacterActivityState(params);
        this.ensureCharacterIsActive(state.character.status, 'Apenas personagens ativos podem iniciar auto-combate.');
        this.ensureCharacterHasHp(state.currentHp, 'Personagens derrotados ou com 0 de HP não podem iniciar auto-combate. Cure o personagem antes.');
        if (state.hasActiveGathering) {
            throw new common_1.BadRequestException({
                message: 'Este personagem está em gathering. Encerre o gathering antes de iniciar auto-combate.',
                activeGathering: state.activeGatheringSession,
            });
        }
        if (state.hasActiveAutoCombat) {
            throw new common_1.BadRequestException({
                message: 'Este personagem já possui uma sessão de combate automático ativa.',
                activeAutoCombat: state.activeAutoCombatSession,
            });
        }
        return state;
    }
    async ensureCanUseInfirmary(params) {
        const state = await this.getCharacterActivityState(params);
        if (state.hasActiveAutoCombat) {
            throw new common_1.BadRequestException({
                message: 'Não é possível usar a enfermaria durante auto-combate ativo.',
                activeAutoCombatSession: state.activeAutoCombatSession,
            });
        }
        if (state.hasActiveGathering) {
            throw new common_1.BadRequestException({
                message: 'Não é possível usar a enfermaria durante gathering. Encerre o gathering antes de curar.',
                activeGatheringSession: state.activeGatheringSession,
            });
        }
        if (state.character.status === client_1.CharacterStatus.BLOCKED) {
            throw new common_1.BadRequestException('Personagem bloqueado não pode usar a enfermaria.');
        }
        return state;
    }
    ensureCharacterIsActive(status, message) {
        if (status !== client_1.CharacterStatus.ACTIVE) {
            throw new common_1.BadRequestException(message);
        }
    }
    ensureCharacterHasHp(currentHp, message) {
        if (currentHp <= 0) {
            throw new common_1.BadRequestException(message);
        }
    }
    resolveCurrentHp(character) {
        return character.currentHp ?? character.maxHp ?? 0;
    }
};
exports.ActivityGuardService = ActivityGuardService;
exports.ActivityGuardService = ActivityGuardService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ActivityGuardService);
//# sourceMappingURL=activity-guard.service.js.map