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
exports.AutoCombatService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const activity_guard_service_1 = require("../../common/activity-guard/activity-guard.service");
const auto_combat_config_1 = require("../../common/config/auto-combat.config");
const combat_damage_util_1 = require("../../common/utils/combat-damage.util");
const farm_penalty_util_1 = require("../../common/utils/farm-penalty.util");
const level_util_1 = require("../../common/utils/level.util");
const stats_util_1 = require("../../common/utils/stats.util");
const prisma_service_1 = require("../../prisma/prisma.service");
const auto_combat_gateway_1 = require("./auto-combat.gateway");
const AUTO_COMBAT_PREVIEW_MIN_ITERATIONS = 6;
const AUTO_COMBAT_PREVIEW_MAX_ITERATIONS = 14;
const AUTO_COMBAT_PREVIEW_MAX_COMBATS_PER_ITERATION = 5000;
const AUTO_COMBAT_EFFECTIVE_ROUND_DURATION_SECONDS = Math.max(1, Math.floor(auto_combat_config_1.AUTO_COMBAT_ROUND_DURATION_SECONDS));
const AUTO_COMBAT_REALTIME_TICK_MS = 1000;
const AUTO_COMBAT_STORED_EVENTS_LIMIT = 50;
const AUTO_COMBAT_RECENT_EVENTS_LIMIT = 20;
let AutoCombatService = class AutoCombatService {
    prisma;
    activityGuard;
    autoCombatGateway;
    realtimeIntervals = new Map();
    processingLocks = new Set();
    potionUsageByCombat = new Set();
    constructor(prisma, activityGuard, autoCombatGateway) {
        this.prisma = prisma;
        this.activityGuard = activityGuard;
        this.autoCombatGateway = autoCombatGateway;
    }
    onModuleDestroy() {
        for (const interval of this.realtimeIntervals.values()) {
            clearInterval(interval);
        }
        this.realtimeIntervals.clear();
        this.processingLocks.clear();
        this.potionUsageByCombat.clear();
    }
    async start(userId, startAutoCombatDto) {
        const character = await this.prisma.character.findFirst({
            where: {
                id: startAutoCombatDto.characterId,
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
        const activeSession = await this.prisma.autoCombatSession.findFirst({
            where: {
                characterId: character.id,
                status: client_1.AutoCombatSessionStatus.ACTIVE,
            },
            orderBy: {
                startedAt: 'desc',
            },
        });
        if (activeSession) {
            await this.ensureResponsiveRoundDuration(activeSession.id);
            this.startRealtimeProcessingLoop(userId, character.id);
            const response = await this.buildSessionResponse(activeSession.id, {
                message: 'Este personagem já possui uma sessão de combate automático ativa.',
                processing: this.buildEmptyProcessingSummary(),
            });
            this.autoCombatGateway.emitSessionUpdated(character.id, response);
            this.autoCombatGateway.emitStatus(character.id, response);
            return response;
        }
        await this.activityGuard.ensureCanStartAutoCombat({
            userId,
            characterId: startAutoCombatDto.characterId,
        });
        const characterStats = this.calculateCharacterFighterStats(character);
        if (characterStats.hp <= 0) {
            throw new common_1.BadRequestException('Este personagem está sem HP e não pode iniciar auto-combate.');
        }
        const subMap = await this.prisma.subMap.findUnique({
            where: {
                id: startAutoCombatDto.subMapId,
            },
            include: {
                map: true,
                encounters: {
                    where: {
                        isActive: true,
                    },
                    include: {
                        mob: {
                            include: {
                                drops: {
                                    include: {
                                        item: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
        if (!subMap) {
            throw new common_1.NotFoundException('Submapa não encontrado.');
        }
        if (subMap.encounters.length === 0) {
            throw new common_1.BadRequestException('Este submapa ainda não possui monstros configurados.');
        }
        if (character.level < subMap.minLevel) {
            throw new common_1.BadRequestException(`Este submapa exige nível mínimo ${subMap.minLevel}.`);
        }
        const firstEncounter = this.rollEncounter(subMap.encounters);
        const firstMob = firstEncounter.mob;
        const now = new Date();
        const endsAt = new Date(now.getTime() + auto_combat_config_1.AUTO_COMBAT_SESSION_DURATION_SECONDS * 1000);
        const firstRoundReadyAt = now;
        const session = await this.prisma.$transaction(async (tx) => {
            await tx.character.update({
                where: {
                    id: character.id,
                },
                data: {
                    mapId: subMap.mapId,
                    maxHp: characterStats.maxHp,
                    currentHp: characterStats.hp,
                },
            });
            return tx.autoCombatSession.create({
                data: {
                    characterId: character.id,
                    subMapId: subMap.id,
                    status: client_1.AutoCombatSessionStatus.ACTIVE,
                    startedAt: now,
                    endsAt,
                    lastProcessedAt: firstRoundReadyAt,
                    durationSeconds: auto_combat_config_1.AUTO_COMBAT_SESSION_DURATION_SECONDS,
                    roundDurationSeconds: AUTO_COMBAT_EFFECTIVE_ROUND_DURATION_SECONDS,
                    currentMobId: firstMob.id,
                    currentMobHp: firstMob.hp,
                    currentMobMaxHp: firstMob.hp,
                    currentRound: 0,
                    currentCombatIndex: 1,
                },
            });
        });
        this.clearPotionUsageForSession(session.id);
        const response = await this.buildSessionResponse(session.id, {
            message: 'Sessão de combate automático iniciada com sucesso.',
            processing: this.buildInitialProcessingSummary({
                hp: characterStats.hp,
                maxHp: characterStats.maxHp,
                level: character.level,
                xp: character.xp,
            }),
        });
        const xpProgressPayload = this.buildCharacterXpPayload(character.level, character.xp);
        const spawnEvent = this.buildRealtimeEvent({
            context: {
                characterId: character.id,
                sessionId: session.id,
                mobId: firstMob.id,
                mobName: firstMob.name,
                combatIndex: 1,
            },
            type: 'MOB_SPAWNED',
            actor: 'SYSTEM',
            target: 'MOB',
            message: `${firstMob.name} apareceu.`,
            mobCurrentHp: firstMob.hp,
            mobMaxHp: firstMob.hp,
            characterCurrentHp: characterStats.hp,
            characterMaxHp: characterStats.maxHp,
            damage: 0,
            isCritical: false,
            isDodged: false,
            characterXp: character.xp,
            characterLevel: character.level,
            ...xpProgressPayload,
            totalCombats: 0,
            totalRounds: 0,
            totalKills: 0,
            totalXpGained: 0,
            totalLoot: 0,
            potionsUsed: 0,
        });
        this.emitRealtimeEvents(character.id, [spawnEvent]);
        this.autoCombatGateway.emitSessionUpdated(character.id, response);
        this.autoCombatGateway.emitStatus(character.id, response);
        this.startRealtimeProcessingLoop(userId, character.id);
        this.scheduleImmediateSessionProcessing(userId, session.id, character.id);
        return response;
    }
    async preview(userId, previewAutoCombatDto) {
        const previewDto = previewAutoCombatDto;
        const character = await this.prisma.character.findFirst({
            where: {
                id: previewDto.characterId,
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
                potionConfig: {
                    include: {
                        potionItem: true,
                    },
                },
                inventoryItems: {
                    include: {
                        item: true,
                    },
                },
            },
        });
        if (!character) {
            throw new common_1.NotFoundException('Personagem não encontrado.');
        }
        const subMap = await this.prisma.subMap.findUnique({
            where: {
                id: previewDto.subMapId,
            },
            include: {
                map: true,
                encounters: {
                    where: {
                        isActive: true,
                    },
                    include: {
                        mob: {
                            include: {
                                drops: {
                                    include: {
                                        item: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
        if (!subMap) {
            throw new common_1.NotFoundException('Submapa não encontrado.');
        }
        if (subMap.encounters.length === 0) {
            throw new common_1.BadRequestException('Este submapa ainda não possui monstros configurados.');
        }
        if (character.level < subMap.minLevel) {
            throw new common_1.BadRequestException(`Este submapa exige nível mínimo ${subMap.minLevel}.`);
        }
        const characterStats = this.calculateCharacterFighterStats(character);
        if (characterStats.hp <= 0) {
            throw new common_1.BadRequestException('Este personagem está sem HP e não pode gerar preview de auto-combate.');
        }
        const projectionSeconds = this.clampNumber(Math.floor(previewDto.projectionSeconds ?? auto_combat_config_1.AUTO_COMBAT_SESSION_DURATION_SECONDS), AUTO_COMBAT_EFFECTIVE_ROUND_DURATION_SECONDS, auto_combat_config_1.AUTO_COMBAT_SESSION_DURATION_SECONDS);
        const now = new Date();
        const previewSession = {
            character,
            subMap,
            roundDurationSeconds: AUTO_COMBAT_EFFECTIVE_ROUND_DURATION_SECONDS,
            endsAt: new Date(now.getTime() + projectionSeconds * 1000),
        };
        const combatPreview = this.buildAutoCombatPreview(previewSession, {
            projectionSeconds,
            iterations: previewDto.iterations,
        });
        if (!combatPreview) {
            throw new common_1.BadRequestException('Não foi possível gerar o preview de auto-combate.');
        }
        return {
            message: 'Preview de auto-combate gerado com sucesso.',
            character: {
                id: character.id,
                name: character.name,
                class: character.class.name,
                level: character.level,
                xp: character.xp,
                currentHp: characterStats.hp,
                maxHp: characterStats.maxHp,
                ...this.buildCharacterXpPayload(character.level, character.xp),
            },
            subMap: {
                id: subMap.id,
                name: subMap.name,
                tier: subMap.tier,
                minLevel: subMap.minLevel,
                maxLevel: subMap.maxLevel,
                map: {
                    id: subMap.map.id,
                    name: subMap.map.name,
                    tier: subMap.map.tier,
                },
            },
            combatPreview,
        };
    }
    async getStatus(userId, characterId) {
        const character = await this.prisma.character.findFirst({
            where: {
                id: characterId,
                userId,
            },
        });
        if (!character) {
            throw new common_1.NotFoundException('Personagem não encontrado.');
        }
        const activeSession = await this.prisma.autoCombatSession.findFirst({
            where: {
                characterId: character.id,
                status: client_1.AutoCombatSessionStatus.ACTIVE,
            },
            orderBy: {
                startedAt: 'desc',
            },
        });
        if (activeSession) {
            await this.ensureResponsiveRoundDuration(activeSession.id);
            this.startRealtimeProcessingLoop(userId, character.id);
            const response = await this.buildSessionResponse(activeSession.id, {
                message: 'Sessão ativa carregada.',
                processing: this.buildEmptyProcessingSummary(),
            });
            this.autoCombatGateway.emitStatus(character.id, response);
            return response;
        }
        this.stopRealtimeProcessingLoop(character.id);
        const latestSession = await this.prisma.autoCombatSession.findFirst({
            where: {
                characterId: character.id,
            },
            orderBy: {
                startedAt: 'desc',
            },
        });
        if (latestSession) {
            const response = await this.buildSessionResponse(latestSession.id, {
                message: 'Nenhuma sessão ativa. Última sessão encontrada.',
                processing: this.buildEmptyProcessingSummary(),
            });
            this.autoCombatGateway.emitStatus(character.id, response);
            return response;
        }
        const response = {
            active: false,
            hasActiveAutoCombat: false,
            message: 'Nenhuma sessão de combate automático encontrada.',
            character: {
                id: character.id,
                name: character.name,
                level: character.level,
                xp: character.xp,
                currentHp: character.currentHp,
                maxHp: character.maxHp,
                ...this.buildCharacterXpPayload(character.level, character.xp),
            },
        };
        this.autoCombatGateway.emitStatus(character.id, response);
        return response;
    }
    async getRecentEvents(userId, characterId) {
        const character = await this.prisma.character.findFirst({
            where: {
                id: characterId,
                userId,
            },
            select: {
                id: true,
                name: true,
            },
        });
        if (!character) {
            throw new common_1.NotFoundException('Personagem não encontrado.');
        }
        const activeSession = await this.prisma.autoCombatSession.findFirst({
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
                finishedAt: true,
                currentCombatIndex: true,
                currentRound: true,
            },
        });
        const latestSession = activeSession ??
            (await this.prisma.autoCombatSession.findFirst({
                where: {
                    characterId: character.id,
                },
                orderBy: {
                    startedAt: 'desc',
                },
                select: {
                    id: true,
                    status: true,
                    startedAt: true,
                    finishedAt: true,
                    currentCombatIndex: true,
                    currentRound: true,
                },
            }));
        if (!latestSession) {
            return {
                active: false,
                hasActiveAutoCombat: false,
                message: 'Nenhuma sessão de auto-combate encontrada.',
                character: {
                    id: character.id,
                    name: character.name,
                },
                session: null,
                events: [],
                latestSequence: null,
            };
        }
        const storedEvents = await this.prisma.autoCombatSessionEvent.findMany({
            where: {
                sessionId: latestSession.id,
                characterId: character.id,
            },
            orderBy: {
                sequence: 'desc',
            },
            take: AUTO_COMBAT_RECENT_EVENTS_LIMIT,
        });
        const events = [...storedEvents]
            .reverse()
            .map((event) => {
            const payload = event.payloadJson &&
                typeof event.payloadJson === 'object' &&
                !Array.isArray(event.payloadJson)
                ? event.payloadJson
                : {};
            return {
                ...payload,
                id: event.id,
                eventId: event.id,
                sessionId: event.sessionId,
                characterId: event.characterId,
                type: event.type,
                sequence: event.sequence,
                createdAt: event.createdAt.toISOString(),
            };
        });
        const latestSequence = events.length > 0
            ? Math.max(...events.map((event) => {
                const sequence = Number(event.sequence);
                return Number.isFinite(sequence) ? sequence : 0;
            }))
            : null;
        return {
            active: latestSession.status === client_1.AutoCombatSessionStatus.ACTIVE,
            hasActiveAutoCombat: latestSession.status === client_1.AutoCombatSessionStatus.ACTIVE,
            message: 'Eventos recentes do auto-combate carregados com sucesso.',
            character: {
                id: character.id,
                name: character.name,
            },
            session: {
                id: latestSession.id,
                status: latestSession.status,
                startedAt: latestSession.startedAt,
                finishedAt: latestSession.finishedAt,
                currentCombatIndex: latestSession.currentCombatIndex,
                currentRound: latestSession.currentRound,
            },
            events,
            latestSequence,
        };
    }
    async stop(userId, characterId) {
        const character = await this.prisma.character.findFirst({
            where: {
                id: characterId,
                userId,
            },
        });
        if (!character) {
            throw new common_1.NotFoundException('Personagem não encontrado.');
        }
        const activeSession = await this.prisma.autoCombatSession.findFirst({
            where: {
                characterId: character.id,
                status: client_1.AutoCombatSessionStatus.ACTIVE,
            },
            orderBy: {
                startedAt: 'desc',
            },
        });
        if (!activeSession) {
            this.stopRealtimeProcessingLoop(character.id);
            return {
                active: false,
                hasActiveAutoCombat: false,
                message: 'Nenhuma sessão ativa para encerrar.',
            };
        }
        const stoppedSession = await this.prisma.autoCombatSession.update({
            where: {
                id: activeSession.id,
            },
            data: {
                status: client_1.AutoCombatSessionStatus.STOPPED,
                finishedAt: new Date(),
            },
        });
        this.clearPotionUsageForSession(stoppedSession.id);
        const response = await this.buildSessionResponse(stoppedSession.id, {
            message: 'Sessão de combate automático encerrada.',
            processing: this.buildEmptyProcessingSummary(),
        });
        this.stopRealtimeProcessingLoop(character.id);
        this.autoCombatGateway.emitStopped(character.id, response);
        this.autoCombatGateway.emitSessionUpdated(character.id, response);
        this.autoCombatGateway.emitStatus(character.id, response);
        return response;
    }
    getEffectiveRoundDurationSeconds(roundDurationSeconds) {
        return this.clampNumber(Math.floor(roundDurationSeconds ?? AUTO_COMBAT_EFFECTIVE_ROUND_DURATION_SECONDS), 1, AUTO_COMBAT_EFFECTIVE_ROUND_DURATION_SECONDS);
    }
    async ensureResponsiveRoundDuration(sessionId) {
        await this.prisma.autoCombatSession.updateMany({
            where: {
                id: sessionId,
                status: client_1.AutoCombatSessionStatus.ACTIVE,
                roundDurationSeconds: {
                    not: AUTO_COMBAT_EFFECTIVE_ROUND_DURATION_SECONDS,
                },
            },
            data: {
                roundDurationSeconds: AUTO_COMBAT_EFFECTIVE_ROUND_DURATION_SECONDS,
                lastProcessedAt: new Date(),
            },
        });
    }
    scheduleImmediateSessionProcessing(userId, sessionId, characterId) {
        setTimeout(() => {
            void this.processActiveSessionById(userId, sessionId).catch(() => {
                this.stopRealtimeProcessingLoop(characterId);
            });
        }, AUTO_COMBAT_EFFECTIVE_ROUND_DURATION_SECONDS * 1000);
    }
    startRealtimeProcessingLoop(userId, characterId) {
        if (this.realtimeIntervals.has(characterId)) {
            return;
        }
        const interval = setInterval(async () => {
            try {
                const activeSession = await this.prisma.autoCombatSession.findFirst({
                    where: {
                        characterId,
                        status: client_1.AutoCombatSessionStatus.ACTIVE,
                        character: {
                            userId,
                        },
                    },
                    orderBy: {
                        startedAt: 'desc',
                    },
                    select: {
                        id: true,
                    },
                });
                if (!activeSession) {
                    this.stopRealtimeProcessingLoop(characterId);
                    return;
                }
                const response = await this.processActiveSessionById(userId, activeSession.id);
                if (!response.active) {
                    this.stopRealtimeProcessingLoop(characterId);
                }
            }
            catch {
                this.stopRealtimeProcessingLoop(characterId);
            }
        }, AUTO_COMBAT_REALTIME_TICK_MS);
        this.realtimeIntervals.set(characterId, interval);
    }
    stopRealtimeProcessingLoop(characterId) {
        const interval = this.realtimeIntervals.get(characterId);
        if (!interval) {
            return;
        }
        clearInterval(interval);
        this.realtimeIntervals.delete(characterId);
    }
    async processActiveSessionById(userId, sessionId) {
        const session = await this.prisma.autoCombatSession.findFirst({
            where: {
                id: sessionId,
                character: {
                    userId,
                },
            },
            include: {
                currentMob: {
                    include: {
                        drops: {
                            include: {
                                item: true,
                            },
                        },
                    },
                },
                character: {
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
                        potionConfig: {
                            include: {
                                potionItem: true,
                            },
                        },
                        inventoryItems: {
                            include: {
                                item: true,
                            },
                        },
                    },
                },
                loots: true,
                mobSummaries: true,
                subMap: {
                    include: {
                        map: true,
                        encounters: {
                            where: {
                                isActive: true,
                            },
                            include: {
                                mob: {
                                    include: {
                                        drops: {
                                            include: {
                                                item: true,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
        if (!session) {
            throw new common_1.NotFoundException('Sessão de combate automático não encontrada.');
        }
        if (session.status !== client_1.AutoCombatSessionStatus.ACTIVE) {
            this.stopRealtimeProcessingLoop(session.characterId);
            const response = await this.buildSessionResponse(session.id, {
                message: 'Sessão não está ativa.',
                processing: this.buildEmptyProcessingSummary(),
            });
            this.autoCombatGateway.emitStatus(session.characterId, response);
            return response;
        }
        if (session.subMap.encounters.length === 0) {
            throw new common_1.BadRequestException('Este submapa não possui monstros ativos para processar.');
        }
        if (this.processingLocks.has(session.characterId)) {
            return this.buildSessionResponse(session.id, {
                message: 'Sessão já está sendo processada.',
                processing: this.buildEmptyProcessingSummary(),
            });
        }
        this.processingLocks.add(session.characterId);
        try {
            const effectiveRoundDurationSeconds = this.getEffectiveRoundDurationSeconds(session.roundDurationSeconds);
            if (session.roundDurationSeconds !== effectiveRoundDurationSeconds) {
                session.roundDurationSeconds = effectiveRoundDurationSeconds;
            }
            const now = new Date();
            if (now.getTime() >= session.endsAt.getTime()) {
                const finishedSession = await this.prisma.autoCombatSession.update({
                    where: {
                        id: session.id,
                    },
                    data: {
                        status: client_1.AutoCombatSessionStatus.FINISHED,
                        finishedAt: session.endsAt,
                        lastProcessedAt: session.endsAt,
                        currentMobId: null,
                        currentMobHp: null,
                        currentMobMaxHp: null,
                        currentRound: 0,
                    },
                });
                this.clearPotionUsageForSession(finishedSession.id);
                const response = await this.buildSessionResponse(finishedSession.id, {
                    message: 'Sessão finalizada com sucesso.',
                    processing: this.buildEmptyProcessingSummary(),
                });
                this.stopRealtimeProcessingLoop(session.characterId);
                this.autoCombatGateway.emitSessionUpdated(session.characterId, response);
                this.autoCombatGateway.emitStatus(session.characterId, response);
                this.autoCombatGateway.emitFinished(session.characterId, response);
                return response;
            }
            const secondsAvailable = Math.floor((now.getTime() - session.lastProcessedAt.getTime()) / 1000);
            if (secondsAvailable < session.roundDurationSeconds) {
                const response = await this.buildSessionResponse(session.id, {
                    message: 'Sessão ativa aguardando próxima rodada.',
                    processing: this.buildEmptyProcessingSummary(),
                });
                this.autoCombatGateway.emitStatus(session.characterId, response);
                return response;
            }
            if (!session.currentMob ||
                !session.currentMobId ||
                session.currentMobHp === null ||
                session.currentMobHp === undefined ||
                session.currentMobHp <= 0) {
                const spawnedSession = await this.spawnNextMobForSession(session);
                const response = await this.buildSessionResponse(spawnedSession.id, {
                    message: 'Novo infectado encontrado.',
                    processing: this.buildEmptyProcessingSummary(),
                });
                this.autoCombatGateway.emitSessionUpdated(session.characterId, response);
                this.autoCombatGateway.emitStatus(session.characterId, response);
                return response;
            }
            const roundResult = this.resolveRealtimeRound(session);
            await this.persistRealtimeRoundResult(session, roundResult);
            const response = await this.buildSessionResponse(session.id, {
                message: roundResult.finalStatus === client_1.AutoCombatSessionStatus.DEFEATED
                    ? 'Sessão encerrada: o personagem foi derrotado.'
                    : roundResult.finalStatus === client_1.AutoCombatSessionStatus.FINISHED
                        ? 'Sessão finalizada com sucesso.'
                        : roundResult.combatsResolved > 0
                            ? 'Infectado abatido. Próxima ameaça localizada.'
                            : 'Rodada processada em tempo real.',
                processing: this.buildProcessingSummary(roundResult, true),
            });
            this.emitRealtimeEvents(session.characterId, roundResult.events);
            this.autoCombatGateway.emitSessionUpdated(session.characterId, response);
            this.autoCombatGateway.emitStatus(session.characterId, response);
            if (roundResult.finalStatus === client_1.AutoCombatSessionStatus.FINISHED) {
                this.clearPotionUsageForSession(session.id);
                this.stopRealtimeProcessingLoop(session.characterId);
                this.autoCombatGateway.emitFinished(session.characterId, response);
            }
            if (roundResult.finalStatus === client_1.AutoCombatSessionStatus.DEFEATED) {
                this.clearPotionUsageForSession(session.id);
                this.stopRealtimeProcessingLoop(session.characterId);
                this.autoCombatGateway.emitFinished(session.characterId, response);
            }
            return response;
        }
        finally {
            this.processingLocks.delete(session.characterId);
        }
    }
    async spawnNextMobForSession(session) {
        const encounter = this.rollEncounter(session.subMap.encounters);
        const mob = encounter.mob;
        const combatIndex = Math.max(1, session.currentCombatIndex ?? 1);
        const updatedSession = await this.prisma.autoCombatSession.update({
            where: {
                id: session.id,
            },
            data: {
                currentMobId: mob.id,
                currentMobHp: mob.hp,
                currentMobMaxHp: mob.hp,
                currentRound: 0,
                currentCombatIndex: combatIndex,
                lastProcessedAt: new Date(),
            },
        });
        const characterStats = this.calculateCharacterFighterStats(session.character);
        const xpProgressPayload = this.buildCharacterXpPayload(session.character.level, session.character.xp);
        const totalLoot = (session.loots ?? []).reduce((total, loot) => total + loot.quantity, 0);
        const totalKills = session.totalCombatsResolved ?? 0;
        const totalRounds = session.totalRoundsResolved ?? 0;
        const totalXpGained = session.totalXpGained ?? 0;
        const totalPotionsUsed = session.totalPotionsUsed ?? 0;
        const event = this.buildRealtimeEvent({
            context: {
                characterId: session.characterId,
                sessionId: session.id,
                mobId: mob.id,
                mobName: mob.name,
                combatIndex,
            },
            type: 'MOB_SPAWNED',
            actor: 'SYSTEM',
            target: 'MOB',
            message: `${mob.name} apareceu.`,
            mobCurrentHp: mob.hp,
            mobMaxHp: mob.hp,
            characterCurrentHp: session.character.currentHp ?? characterStats.maxHp,
            characterMaxHp: characterStats.maxHp,
            damage: 0,
            isCritical: false,
            isDodged: false,
            characterXp: session.character.xp,
            characterLevel: session.character.level,
            ...xpProgressPayload,
            totalCombats: totalKills,
            totalRounds,
            totalKills,
            totalXpGained,
            totalLoot,
            potionsUsed: totalPotionsUsed,
        });
        this.emitRealtimeEvents(session.characterId, [event]);
        return updatedSession;
    }
    resolveRealtimeRound(session) {
        const loots = new Map();
        const mobSummaries = new Map();
        const events = [];
        const currentMob = session.currentMob;
        if (!currentMob) {
            throw new common_1.BadRequestException('Nenhum monstro atual na sessão.');
        }
        const equipmentItems = this.getEquipmentItems(session.character);
        const initialStats = (0, stats_util_1.calculateFullStats)(session.character.class, equipmentItems, session.character.level);
        const initialLevel = session.character.level;
        const initialXp = session.character.xp;
        const initialMaxHp = initialStats.derivedCombatStats.maxHp;
        const initialHp = this.clampHp(session.character.currentHp ?? initialMaxHp, initialMaxHp);
        const currentMobMaxHp = session.currentMobMaxHp ?? session.currentMob?.hp ?? currentMob.hp;
        let playerHp = initialHp;
        let mobHp = this.clampHp(session.currentMobHp ?? currentMob.hp, currentMobMaxHp);
        let simulatedLevel = initialLevel;
        let simulatedXp = initialXp;
        let simulatedMaxHp = initialMaxHp;
        let damageDealt = 0;
        let damageTaken = 0;
        let healingFromPotions = 0;
        let healingFromLevelUp = 0;
        let criticalHitsDealt = 0;
        let criticalHitsTaken = 0;
        let criticalBonusDamageDealt = 0;
        let criticalBonusDamageTaken = 0;
        let playerAttackAttempts = 0;
        let mobAttackAttempts = 0;
        let dodgesByPlayer = 0;
        let dodgesByMob = 0;
        let xpGained = 0;
        let combatsResolved = 0;
        let levelsGained = 0;
        const currentRound = (session.currentRound ?? 0) + 1;
        const currentCombatIndex = Math.max(1, session.currentCombatIndex ?? 1);
        const totalCombatsBeforeRound = session.totalCombatsResolved ?? 0;
        const totalRoundsBeforeRound = session.totalRoundsResolved ?? 0;
        const totalXpBeforeRound = session.totalXpGained ?? 0;
        const totalPotionsUsedBeforeRound = session.totalPotionsUsed ?? 0;
        const totalRoundsAfterRound = totalRoundsBeforeRound + 1;
        const previousLootTotal = (session.loots ?? []).reduce((total, loot) => total + loot.quantity, 0);
        const context = {
            characterId: session.characterId,
            sessionId: session.id,
            mobId: currentMob.id,
            mobName: currentMob.name,
            combatIndex: currentCombatIndex,
        };
        const playerStats = {
            name: session.character.name,
            hp: playerHp,
            maxHp: simulatedMaxHp,
            attack: initialStats.derivedCombatStats.attack,
            defense: initialStats.derivedCombatStats.defense,
            speed: initialStats.derivedCombatStats.speed,
            precision: initialStats.totalPrimaryStats.precision,
            technique: initialStats.totalPrimaryStats.technique,
            agility: initialStats.totalPrimaryStats.agility,
        };
        const mobStats = {
            ...this.calculateMobFighterStats(currentMob),
            hp: mobHp,
            maxHp: currentMobMaxHp,
        };
        const autoPotionState = this.createAutoPotionState(session.character);
        const potionCombatKey = this.getPotionCombatKey(session.id, currentCombatIndex);
        let potionUsedThisCombat = this.potionUsageByCombat.has(potionCombatKey);
        let lastPotionQuantityBefore = null;
        let lastPotionQuantityAfter = null;
        let lastPotionUsedQuantity = null;
        const getNewLootTotal = () => {
            return Array.from(loots.values()).reduce((total, loot) => total + loot.quantity, 0);
        };
        const getTotalLootNow = () => {
            return previousLootTotal + getNewLootTotal();
        };
        const pushEvent = (type, payload = {}) => {
            const resolvedTotalKills = payload.totalKills ?? totalCombatsBeforeRound + combatsResolved;
            const resolvedTotalCombats = payload.totalCombats ?? resolvedTotalKills;
            const resolvedTotalRounds = payload.totalRounds ?? totalRoundsAfterRound;
            const resolvedTotalXpGained = payload.totalXpGained ?? totalXpBeforeRound + xpGained;
            const resolvedTotalLoot = payload.totalLoot ?? getTotalLootNow();
            const resolvedPotionsUsed = payload.potionsUsed ??
                totalPotionsUsedBeforeRound + (autoPotionState?.usedQuantity ?? 0);
            events.push(this.buildRealtimeEvent({
                context,
                type,
                message: payload.message ?? '',
                mobCurrentHp: payload.mobCurrentHp ?? mobHp,
                mobMaxHp: payload.mobMaxHp ?? currentMobMaxHp,
                characterCurrentHp: payload.characterCurrentHp ?? playerHp,
                characterMaxHp: payload.characterMaxHp ?? simulatedMaxHp,
                damage: payload.damage ?? 0,
                healedAmount: payload.healedAmount ?? 0,
                isCritical: payload.isCritical ?? false,
                isDodged: payload.isDodged ?? false,
                round: payload.round ?? currentRound,
                combatIndex: payload.combatIndex ?? currentCombatIndex,
                actor: payload.actor,
                target: payload.target,
                mobId: payload.mobId,
                mobName: payload.mobName,
                xpGained: payload.xpGained,
                characterXp: payload.characterXp,
                characterLevel: payload.characterLevel,
                totalXp: payload.totalXp,
                currentLevelXp: payload.currentLevelXp,
                xpToNextLevel: payload.xpToNextLevel,
                nextLevelXp: payload.nextLevelXp,
                xpProgressPercent: payload.xpProgressPercent,
                xpIntoCurrentLevel: payload.xpIntoCurrentLevel,
                xpNeededForNextLevel: payload.xpNeededForNextLevel,
                currentLevelStartXp: payload.currentLevelStartXp,
                nextLevelRequiredXp: payload.nextLevelRequiredXp,
                isAtLevelCap: payload.isAtLevelCap,
                levelProgress: payload.levelProgress,
                leveledUp: payload.leveledUp,
                levelsGained: payload.levelsGained,
                totalCombats: resolvedTotalCombats,
                totalRounds: resolvedTotalRounds,
                totalKills: resolvedTotalKills,
                totalXpGained: resolvedTotalXpGained,
                totalLoot: resolvedTotalLoot,
                potionsUsed: resolvedPotionsUsed,
                potionItemId: payload.potionItemId,
                potionItemName: payload.potionItemName,
                potionTriggerPercent: payload.potionTriggerPercent,
                potionQuantityBefore: payload.potionQuantityBefore,
                potionQuantityAfter: payload.potionQuantityAfter,
                potionQuantityRemaining: payload.potionQuantityRemaining,
                potionUsedQuantity: payload.potionUsedQuantity,
            }));
        };
        const tryPotion = () => {
            if (potionUsedThisCombat) {
                return;
            }
            const potionResult = this.tryUseAutoPotion({
                currentHp: playerHp,
                maxHp: simulatedMaxHp,
                autoPotionState,
                potionUsedThisCombat,
            });
            if (!potionResult.used) {
                return;
            }
            potionUsedThisCombat = true;
            this.potionUsageByCombat.add(potionCombatKey);
            playerHp = potionResult.newHp;
            healingFromPotions += potionResult.healedAmount;
            lastPotionQuantityBefore = potionResult.quantityBefore;
            lastPotionQuantityAfter = potionResult.quantityAfter;
            lastPotionUsedQuantity = potionResult.usedQuantity;
            const totalPotionsAfterUse = totalPotionsUsedBeforeRound + (autoPotionState?.usedQuantity ?? 0);
            pushEvent('POTION_USED', {
                actor: 'PLAYER',
                target: 'PLAYER',
                message: `${session.character.name} usou ${autoPotionState?.potionItemName ?? 'uma poção'} e recuperou ${potionResult.healedAmount} HP.`,
                damage: 0,
                healedAmount: potionResult.healedAmount,
                characterCurrentHp: playerHp,
                mobCurrentHp: mobHp,
                totalCombats: totalCombatsBeforeRound,
                totalRounds: totalRoundsAfterRound,
                totalKills: totalCombatsBeforeRound,
                totalXpGained: totalXpBeforeRound + xpGained,
                totalLoot: getTotalLootNow(),
                potionsUsed: totalPotionsAfterUse,
                potionItemId: autoPotionState?.potionItemId ?? null,
                potionItemName: autoPotionState?.potionItemName ?? null,
                potionTriggerPercent: autoPotionState?.hpThresholdPercent ?? null,
                potionQuantityBefore: potionResult.quantityBefore,
                potionQuantityAfter: potionResult.quantityAfter,
                potionQuantityRemaining: potionResult.quantityAfter,
                potionUsedQuantity: potionResult.usedQuantity,
            });
        };
        const playerAttack = () => {
            if (playerHp <= 0 || mobHp <= 0) {
                return;
            }
            const attack = this.resolveAttack({
                attacker: playerStats,
                defender: mobStats,
                targetCurrentHp: mobHp,
                targetMaxHp: currentMobMaxHp,
            });
            playerAttackAttempts++;
            mobHp = attack.nextTargetHp;
            damageDealt += attack.damage;
            if (attack.isDodged) {
                dodgesByMob++;
                pushEvent('DODGE', {
                    actor: 'PLAYER',
                    target: 'MOB',
                    message: `${currentMob.name} esquivou do ataque de ${session.character.name}.`,
                    damage: 0,
                    isCritical: false,
                    isDodged: true,
                    characterCurrentHp: playerHp,
                    mobCurrentHp: mobHp,
                });
                return;
            }
            if (attack.isCritical) {
                criticalHitsDealt++;
                criticalBonusDamageDealt += attack.criticalBonusDamage;
            }
            pushEvent('PLAYER_HIT', {
                actor: 'PLAYER',
                target: 'MOB',
                message: attack.isCritical
                    ? `${session.character.name} acertou um crítico em ${currentMob.name}.`
                    : `${session.character.name} atingiu ${currentMob.name}.`,
                damage: attack.damage,
                isCritical: attack.isCritical,
                isDodged: false,
                characterCurrentHp: playerHp,
                mobCurrentHp: mobHp,
            });
        };
        const mobAttack = () => {
            if (playerHp <= 0 || mobHp <= 0) {
                return;
            }
            const hpBeforeAttack = playerHp;
            const attack = this.resolveAttack({
                attacker: mobStats,
                defender: playerStats,
                targetCurrentHp: playerHp,
                targetMaxHp: simulatedMaxHp,
            });
            mobAttackAttempts++;
            playerHp = attack.nextTargetHp;
            damageTaken += attack.damage;
            if (attack.isDodged) {
                dodgesByPlayer++;
                pushEvent('DODGE', {
                    actor: 'MOB',
                    target: 'PLAYER',
                    message: `${session.character.name} esquivou do ataque de ${currentMob.name}.`,
                    damage: 0,
                    isCritical: false,
                    isDodged: true,
                    characterCurrentHp: playerHp,
                    mobCurrentHp: mobHp,
                });
                return;
            }
            if (attack.isCritical) {
                criticalHitsTaken++;
                criticalBonusDamageTaken += attack.criticalBonusDamage;
            }
            pushEvent('MOB_HIT', {
                actor: 'MOB',
                target: 'PLAYER',
                message: attack.isCritical
                    ? `${currentMob.name} acertou um crítico em ${session.character.name}.`
                    : `${currentMob.name} atingiu ${session.character.name}.`,
                damage: attack.damage,
                isCritical: attack.isCritical,
                isDodged: false,
                characterCurrentHp: playerHp,
                mobCurrentHp: mobHp,
            });
            const tookRealDamage = hpBeforeAttack > playerHp;
            if (tookRealDamage && playerHp > 0) {
                tryPotion();
            }
        };
        if (playerStats.speed >= mobStats.speed) {
            playerAttack();
            if (mobHp > 0) {
                mobAttack();
            }
        }
        else {
            mobAttack();
            if (playerHp > 0) {
                playerAttack();
            }
        }
        let finalStatus = client_1.AutoCombatSessionStatus.ACTIVE;
        let finishedAt = null;
        let nextCurrentMobId = currentMob.id;
        let nextCurrentMobHp = mobHp;
        let nextCurrentMobMaxHp = currentMobMaxHp;
        let nextCurrentRound = currentRound;
        let nextCombatIndex = currentCombatIndex;
        if (playerHp <= 0) {
            finalStatus = client_1.AutoCombatSessionStatus.DEFEATED;
            finishedAt = new Date();
            playerHp = 0;
            const defeatXpPayload = this.buildCharacterXpPayload(simulatedLevel, simulatedXp);
            pushEvent('PLAYER_DEFEATED', {
                actor: 'MOB',
                target: 'PLAYER',
                message: `${session.character.name} foi derrotado por ${currentMob.name}.`,
                damage: 0,
                isCritical: false,
                isDodged: false,
                mobCurrentHp: mobHp,
                characterCurrentHp: 0,
                characterMaxHp: simulatedMaxHp,
                characterXp: simulatedXp,
                characterLevel: simulatedLevel,
                ...defeatXpPayload,
                totalCombats: totalCombatsBeforeRound,
                totalRounds: totalRoundsAfterRound,
                totalKills: totalCombatsBeforeRound,
                totalXpGained: totalXpBeforeRound + xpGained,
                totalLoot: getTotalLootNow(),
                potionsUsed: totalPotionsUsedBeforeRound + (autoPotionState?.usedQuantity ?? 0),
            });
        }
        else if (mobHp <= 0) {
            combatsResolved = 1;
            const penalty = (0, farm_penalty_util_1.calculateTierFarmPenalty)(simulatedLevel, currentMob.tier);
            const finalXpReward = (0, farm_penalty_util_1.applyXpPenalty)(currentMob.xpReward, penalty.xpMultiplier);
            xpGained += finalXpReward;
            const levelProgress = (0, level_util_1.calculateLevelProgress)(simulatedLevel, simulatedXp, finalXpReward);
            const oldLevelBeforeReward = simulatedLevel;
            const oldMaxHpBeforeReward = simulatedMaxHp;
            simulatedLevel = levelProgress.newLevel;
            simulatedXp = levelProgress.totalXp;
            levelsGained = Math.max(0, simulatedLevel - oldLevelBeforeReward);
            if (levelsGained > 0) {
                const newStatsAfterLevelUp = (0, stats_util_1.calculateFullStats)(session.character.class, equipmentItems, simulatedLevel);
                const newMaxHpAfterLevelUp = newStatsAfterLevelUp.derivedCombatStats.maxHp;
                const hpBeforeLevelUpRecovery = playerHp;
                playerHp = this.calculateCurrentHpAfterLevelUp({
                    currentHp: playerHp,
                    oldMaxHp: oldMaxHpBeforeReward,
                    newMaxHp: newMaxHpAfterLevelUp,
                    levelsGained,
                });
                healingFromLevelUp += Math.max(0, playerHp - hpBeforeLevelUpRecovery);
                simulatedMaxHp = newMaxHpAfterLevelUp;
            }
            this.addMobSummary(mobSummaries, currentMob.id, finalXpReward);
            for (const drop of currentMob.drops ?? []) {
                const dropMultiplier = (0, farm_penalty_util_1.getDropMultiplierByItemSlot)(drop.item.slot, penalty);
                const finalDropChance = (0, farm_penalty_util_1.applyDropChancePenalty)(drop.dropChance, dropMultiplier);
                const roll = Math.floor(Math.random() * 100) + 1;
                if (roll <= finalDropChance) {
                    const quantity = this.randomBetween(drop.minQuantity, drop.maxQuantity);
                    this.addLoot(loots, drop.itemId, quantity);
                }
            }
            const realtimeXpPayload = this.buildCharacterXpPayload(simulatedLevel, simulatedXp);
            const totalKillsAfterKill = totalCombatsBeforeRound + 1;
            const totalXpAfterKill = totalXpBeforeRound + xpGained;
            const totalPotionsAfterRound = totalPotionsUsedBeforeRound + (autoPotionState?.usedQuantity ?? 0);
            const totalLootAfterKill = getTotalLootNow();
            pushEvent('MOB_DEFEATED', {
                actor: 'PLAYER',
                target: 'MOB',
                message: `${currentMob.name} foi abatido. +${finalXpReward} XP.`,
                damage: 0,
                isCritical: false,
                isDodged: false,
                mobCurrentHp: 0,
                characterCurrentHp: playerHp,
                characterMaxHp: simulatedMaxHp,
                xpGained: finalXpReward,
                characterXp: simulatedXp,
                characterLevel: simulatedLevel,
                ...realtimeXpPayload,
                leveledUp: levelsGained > 0,
                levelsGained,
                totalCombats: totalKillsAfterKill,
                totalRounds: totalRoundsAfterRound,
                totalKills: totalKillsAfterKill,
                totalXpGained: totalXpAfterKill,
                totalLoot: totalLootAfterKill,
                potionsUsed: totalPotionsAfterRound,
            });
            const now = new Date();
            const sessionShouldFinish = now.getTime() >= session.endsAt.getTime() ||
                new Date(session.lastProcessedAt.getTime() +
                    session.roundDurationSeconds * 1000).getTime() >= session.endsAt.getTime();
            if (sessionShouldFinish) {
                finalStatus = client_1.AutoCombatSessionStatus.FINISHED;
                finishedAt = session.endsAt;
                nextCurrentMobId = null;
                nextCurrentMobHp = null;
                nextCurrentMobMaxHp = null;
                nextCurrentRound = 0;
            }
            else {
                nextCombatIndex = currentCombatIndex + 1;
                nextCurrentMobId = null;
                nextCurrentMobHp = null;
                nextCurrentMobMaxHp = null;
                nextCurrentRound = 0;
            }
        }
        const newLastProcessedAt = finalStatus === client_1.AutoCombatSessionStatus.FINISHED
            ? session.endsAt
            : new Date(session.lastProcessedAt.getTime() +
                session.roundDurationSeconds * 1000);
        const finalMaxHp = simulatedMaxHp;
        const finalCurrentHp = this.clampHp(playerHp, finalMaxHp);
        const healingReceived = healingFromPotions + healingFromLevelUp;
        const hpChange = finalCurrentHp - initialHp;
        const hpLostNet = Math.max(0, initialHp - finalCurrentHp);
        const hpRecoveredNet = Math.max(0, finalCurrentHp - initialHp);
        const hpLost = hpLostNet;
        const maxHpGained = Math.max(0, finalMaxHp - initialMaxHp);
        const totalHealingReceived = healingReceived;
        const criticalRateDealt = this.calculatePercent(criticalHitsDealt, playerAttackAttempts);
        const criticalRateTaken = this.calculatePercent(criticalHitsTaken, mobAttackAttempts);
        const criticalDamageSharePercent = this.calculatePercent(criticalBonusDamageDealt, damageDealt);
        const playerDodgeRate = this.calculatePercent(dodgesByPlayer, mobAttackAttempts);
        const mobDodgeRate = this.calculatePercent(dodgesByMob, playerAttackAttempts);
        return {
            processedSeconds: session.roundDurationSeconds,
            combatsResolved,
            roundsResolved: 1,
            xpGained,
            initialHp,
            finalCurrentHp,
            initialMaxHp,
            finalMaxHp,
            maxHpGained,
            hpLost,
            damageDealt,
            damageTaken,
            healingReceived,
            healingFromPotions,
            healingFromLevelUp,
            totalHealingReceived,
            hpChange,
            hpLostNet,
            hpRecoveredNet,
            tookDamage: damageTaken > 0,
            wasHealed: totalHealingReceived > 0,
            criticalHitsDealt,
            criticalHitsTaken,
            criticalBonusDamageDealt,
            criticalBonusDamageTaken,
            playerAttackAttempts,
            mobAttackAttempts,
            criticalRateDealt,
            criticalRateTaken,
            criticalDamageSharePercent,
            dealtCritical: criticalHitsDealt > 0,
            tookCritical: criticalHitsTaken > 0,
            dodgesByPlayer,
            dodgesByMob,
            playerDodgeRate,
            mobDodgeRate,
            playerDodged: dodgesByPlayer > 0,
            mobDodged: dodgesByMob > 0,
            initialLevel,
            finalLevel: simulatedLevel,
            levelsGained,
            leveledUp: levelsGained > 0,
            potionsUsed: autoPotionState?.usedQuantity ?? 0,
            potionItemId: autoPotionState?.potionItemId ?? null,
            potionItemName: autoPotionState?.potionItemName ?? null,
            potionTriggerPercent: autoPotionState?.hpThresholdPercent ?? null,
            potionQuantityBefore: lastPotionQuantityBefore,
            potionQuantityAfter: lastPotionQuantityAfter,
            potionQuantityRemaining: autoPotionState?.availableQuantity ?? null,
            potionUsedQuantity: lastPotionUsedQuantity,
            finalXp: simulatedXp,
            finalStatus,
            newLastProcessedAt,
            finishedAt,
            currentMobId: nextCurrentMobId,
            currentMobHp: nextCurrentMobHp,
            currentMobMaxHp: nextCurrentMobMaxHp,
            currentRound: nextCurrentRound,
            currentCombatIndex: nextCombatIndex,
            loots,
            mobSummaries,
            events,
        };
    }
    async persistRealtimeRoundResult(session, result) {
        await this.prisma.$transaction(async (tx) => {
            await tx.character.update({
                where: {
                    id: session.characterId,
                },
                data: {
                    xp: result.finalXp,
                    level: result.finalLevel,
                    currentHp: result.finalCurrentHp,
                    maxHp: result.finalMaxHp,
                },
            });
            for (const loot of result.loots.values()) {
                const item = await tx.item.findUnique({
                    where: {
                        id: loot.itemId,
                    },
                });
                if (!item) {
                    continue;
                }
                await tx.inventoryItem.upsert({
                    where: {
                        characterId_itemId: {
                            characterId: session.characterId,
                            itemId: loot.itemId,
                        },
                    },
                    update: {
                        quantity: {
                            increment: loot.quantity,
                        },
                    },
                    create: {
                        characterId: session.characterId,
                        itemId: loot.itemId,
                        quantity: loot.quantity,
                        type: this.getInventoryItemType(item.slot),
                    },
                });
                await tx.autoCombatSessionLoot.upsert({
                    where: {
                        sessionId_itemId: {
                            sessionId: session.id,
                            itemId: loot.itemId,
                        },
                    },
                    update: {
                        quantity: {
                            increment: loot.quantity,
                        },
                    },
                    create: {
                        sessionId: session.id,
                        itemId: loot.itemId,
                        quantity: loot.quantity,
                    },
                });
            }
            for (const summary of result.mobSummaries.values()) {
                await tx.autoCombatSessionMobSummary.upsert({
                    where: {
                        sessionId_mobId: {
                            sessionId: session.id,
                            mobId: summary.mobId,
                        },
                    },
                    update: {
                        kills: {
                            increment: summary.kills,
                        },
                        xpGained: {
                            increment: summary.xpGained,
                        },
                    },
                    create: {
                        sessionId: session.id,
                        mobId: summary.mobId,
                        kills: summary.kills,
                        xpGained: summary.xpGained,
                    },
                });
            }
            if (result.potionsUsed > 0 && result.potionItemId) {
                const potionInventoryItem = await tx.inventoryItem.findUnique({
                    where: {
                        characterId_itemId: {
                            characterId: session.characterId,
                            itemId: result.potionItemId,
                        },
                    },
                });
                if (potionInventoryItem) {
                    if (potionInventoryItem.quantity <= result.potionsUsed) {
                        await tx.inventoryItem.delete({
                            where: {
                                id: potionInventoryItem.id,
                            },
                        });
                    }
                    else {
                        await tx.inventoryItem.update({
                            where: {
                                id: potionInventoryItem.id,
                            },
                            data: {
                                quantity: {
                                    decrement: result.potionsUsed,
                                },
                            },
                        });
                    }
                }
            }
            await tx.autoCombatSession.update({
                where: {
                    id: session.id,
                },
                data: {
                    status: result.finalStatus,
                    lastProcessedAt: result.newLastProcessedAt,
                    finishedAt: result.finishedAt,
                    currentMobId: result.currentMobId,
                    currentMobHp: result.currentMobHp,
                    currentMobMaxHp: result.currentMobMaxHp,
                    currentRound: result.currentRound,
                    currentCombatIndex: result.currentCombatIndex,
                    totalCombatsResolved: {
                        increment: result.combatsResolved,
                    },
                    totalRoundsResolved: {
                        increment: result.roundsResolved,
                    },
                    totalXpGained: {
                        increment: result.xpGained,
                    },
                    totalPotionsUsed: {
                        increment: result.potionsUsed,
                    },
                },
            });
        });
    }
    async buildSessionResponse(sessionId, extra) {
        const session = await this.prisma.autoCombatSession.findUnique({
            where: {
                id: sessionId,
            },
            include: {
                currentMob: true,
                character: {
                    include: {
                        class: true,
                    },
                },
                subMap: {
                    include: {
                        map: true,
                    },
                },
                loots: {
                    include: {
                        item: true,
                    },
                    orderBy: {
                        createdAt: 'asc',
                    },
                },
                mobSummaries: {
                    include: {
                        mob: true,
                    },
                    orderBy: {
                        createdAt: 'asc',
                    },
                },
            },
        });
        if (!session) {
            throw new common_1.NotFoundException('Sessão de combate automático não encontrada.');
        }
        const now = new Date();
        const remainingSeconds = this.calculateSessionRemainingSeconds(session, now);
        const sessionSummary = this.buildSessionSummary(session, remainingSeconds, now);
        const currentMobHp = session.currentMob && session.currentMobHp !== null
            ? this.clampHp(session.currentMobHp, session.currentMobMaxHp ?? session.currentMob.hp)
            : null;
        const currentMobMaxHp = session.currentMob && session.currentMobMaxHp !== null
            ? session.currentMobMaxHp
            : session.currentMob?.hp ?? null;
        const characterXpPayload = this.buildCharacterXpPayload(session.character.level, session.character.xp);
        const totalLoot = session.loots.reduce((total, loot) => total + loot.quantity, 0);
        const totalKills = session.mobSummaries.reduce((total, summary) => total + summary.kills, 0);
        return {
            active: session.status === client_1.AutoCombatSessionStatus.ACTIVE,
            hasActiveAutoCombat: session.status === client_1.AutoCombatSessionStatus.ACTIVE,
            message: extra?.message ?? 'Sessão carregada com sucesso.',
            character: {
                id: session.character.id,
                name: session.character.name,
                class: session.character.class.name,
                level: session.character.level,
                xp: session.character.xp,
                currentHp: session.character.currentHp,
                maxHp: session.character.maxHp,
                ...characterXpPayload,
            },
            session: {
                id: session.id,
                characterId: session.characterId,
                subMapId: session.subMapId,
                status: session.status,
                startedAt: session.startedAt,
                endsAt: session.endsAt,
                lastProcessedAt: session.lastProcessedAt,
                finishedAt: session.finishedAt,
                durationSeconds: session.durationSeconds,
                roundDurationSeconds: session.roundDurationSeconds,
                remainingSeconds,
                totalCombatsResolved: session.totalCombatsResolved,
                totalRoundsResolved: session.totalRoundsResolved,
                totalXpGained: session.totalXpGained,
                totalPotionsUsed: session.totalPotionsUsed ?? 0,
                totalCombats: session.totalCombatsResolved,
                totalRounds: session.totalRoundsResolved,
                totalKills,
                totalLoot,
                potionsUsed: session.totalPotionsUsed ?? 0,
                currentMobId: session.currentMobId,
                currentMobHp,
                currentMobMaxHp,
                currentRound: session.currentRound,
                currentCombatIndex: session.currentCombatIndex,
            },
            currentMob: session.currentMob
                ? {
                    id: session.currentMob.id,
                    name: session.currentMob.name,
                    description: session.currentMob.description,
                    level: session.currentMob.level,
                    tier: session.currentMob.tier,
                    hp: session.currentMob.hp,
                    attack: session.currentMob.attack,
                    defense: session.currentMob.defense,
                    speed: session.currentMob.speed,
                    xpReward: session.currentMob.xpReward,
                    currentHp: currentMobHp,
                    maxHp: currentMobMaxHp,
                    hpPercent: currentMobHp !== null && currentMobMaxHp
                        ? this.calculatePercent(currentMobHp, currentMobMaxHp)
                        : 0,
                }
                : null,
            subMap: {
                id: session.subMap.id,
                name: session.subMap.name,
                tier: session.subMap.tier,
                minLevel: session.subMap.minLevel,
                maxLevel: session.subMap.maxLevel,
                map: {
                    id: session.subMap.map.id,
                    name: session.subMap.map.name,
                    tier: session.subMap.map.tier,
                },
            },
            rewards: {
                loots: session.loots.map((loot) => ({
                    itemId: loot.itemId,
                    itemName: loot.item.name,
                    quantity: loot.quantity,
                    rarity: loot.item.rarity,
                    slot: loot.item.slot,
                    tier: loot.item.tier,
                })),
                mobs: session.mobSummaries.map((summary) => ({
                    mobId: summary.mobId,
                    mobName: summary.mob.name,
                    mobLevel: summary.mob.level,
                    mobTier: summary.mob.tier,
                    kills: summary.kills,
                    xpGained: summary.xpGained,
                })),
            },
            sessionSummary,
            processing: extra?.processing ?? this.buildEmptyProcessingSummary(),
        };
    }
    buildSessionSummary(session, remainingSeconds, now = new Date()) {
        const status = session.status;
        const referenceDate = status === client_1.AutoCombatSessionStatus.ACTIVE
            ? now
            : session.finishedAt ?? session.endsAt ?? now;
        const elapsedSeconds = this.clampNumber(Math.floor((referenceDate.getTime() - session.startedAt.getTime()) / 1000), 0, session.durationSeconds);
        const processedCombatSeconds = Math.max(0, session.totalRoundsResolved * session.roundDurationSeconds);
        const unusedSeconds = Math.max(0, session.durationSeconds - elapsedSeconds);
        const totalCombats = session.totalCombatsResolved ?? 0;
        const totalRounds = session.totalRoundsResolved ?? 0;
        const totalXpGained = session.totalXpGained ?? 0;
        const totalPotionsUsed = session.totalPotionsUsed ?? 0;
        const totalLootQuantity = session.loots.reduce((total, loot) => total + loot.quantity, 0);
        const totalMobKills = session.mobSummaries.reduce((total, summary) => total + summary.kills, 0);
        const currentHp = session.character.currentHp ?? 0;
        const maxHp = session.character.maxHp ?? 0;
        return {
            status,
            statusText: this.getSessionStatusText(status),
            isActive: status === client_1.AutoCombatSessionStatus.ACTIVE,
            stoppedManually: status === client_1.AutoCombatSessionStatus.STOPPED,
            completed: status === client_1.AutoCombatSessionStatus.FINISHED,
            defeated: status === client_1.AutoCombatSessionStatus.DEFEATED,
            survived: status !== client_1.AutoCombatSessionStatus.DEFEATED,
            duration: {
                plannedSeconds: session.durationSeconds,
                elapsedSeconds,
                processedCombatSeconds,
                remainingSeconds,
                unusedSeconds,
                startedAt: session.startedAt,
                endsAt: session.endsAt,
                finishedAt: session.finishedAt,
            },
            combat: {
                totalCombats,
                totalRounds,
                averageRoundsPerCombat: totalCombats > 0 ? this.roundNumber(totalRounds / totalCombats) : 0,
            },
            progression: {
                totalXpGained,
                xpPerMinute: processedCombatSeconds > 0
                    ? this.roundNumber((totalXpGained / processedCombatSeconds) * 60)
                    : 0,
            },
            hp: {
                current: currentHp,
                max: maxHp,
                percent: this.calculatePercent(currentHp, maxHp),
            },
            potions: {
                used: totalPotionsUsed,
            },
            loot: {
                totalQuantity: totalLootQuantity,
                uniqueItems: session.loots.length,
                items: session.loots.map((loot) => ({
                    itemId: loot.itemId,
                    itemName: loot.item.name,
                    quantity: loot.quantity,
                    rarity: String(loot.item.rarity),
                    slot: String(loot.item.slot),
                    tier: loot.item.tier,
                })),
            },
            mobs: {
                totalKills: totalMobKills,
                uniqueMobs: session.mobSummaries.length,
                kills: session.mobSummaries.map((summary) => ({
                    mobId: summary.mobId,
                    mobName: summary.mob.name,
                    mobLevel: summary.mob.level,
                    mobTier: summary.mob.tier,
                    kills: summary.kills,
                    xpGained: summary.xpGained,
                })),
            },
        };
    }
    buildProcessingSummary(result, processedNow) {
        const xpPayload = this.buildCharacterXpPayload(result.finalLevel, result.finalXp);
        return {
            processedNow,
            processedSeconds: result.processedSeconds,
            combatsResolved: result.combatsResolved,
            roundsResolved: result.roundsResolved,
            xpGained: result.xpGained,
            initialHp: result.initialHp,
            finalHp: result.finalCurrentHp,
            hpLost: result.hpLost,
            damageDealt: result.damageDealt,
            damageTaken: result.damageTaken,
            healingReceived: result.healingReceived,
            healingFromPotions: result.healingFromPotions,
            healingFromLevelUp: result.healingFromLevelUp,
            totalHealingReceived: result.totalHealingReceived,
            hpChange: result.hpChange,
            hpLostNet: result.hpLostNet,
            hpRecoveredNet: result.hpRecoveredNet,
            tookDamage: result.tookDamage,
            wasHealed: result.wasHealed,
            hp: {
                initial: result.initialHp,
                final: result.finalCurrentHp,
                maxInitial: result.initialMaxHp,
                maxFinal: result.finalMaxHp,
                maxHpGained: result.maxHpGained,
                change: result.hpChange,
                lostNet: result.hpLostNet,
                recoveredNet: result.hpRecoveredNet,
                damageTaken: result.damageTaken,
                healingReceived: result.healingReceived,
                healingFromPotions: result.healingFromPotions,
                healingFromLevelUp: result.healingFromLevelUp,
                totalHealingReceived: result.totalHealingReceived,
                tookDamage: result.tookDamage,
                wasHealed: result.wasHealed,
                leveledUp: result.leveledUp,
            },
            criticalHitsDealt: result.criticalHitsDealt,
            criticalHitsTaken: result.criticalHitsTaken,
            criticalBonusDamageDealt: result.criticalBonusDamageDealt,
            criticalBonusDamageTaken: result.criticalBonusDamageTaken,
            playerAttackAttempts: result.playerAttackAttempts,
            mobAttackAttempts: result.mobAttackAttempts,
            criticalRateDealt: result.criticalRateDealt,
            criticalRateTaken: result.criticalRateTaken,
            criticalDamageSharePercent: result.criticalDamageSharePercent,
            dealtCritical: result.dealtCritical,
            tookCritical: result.tookCritical,
            critical: {
                hitsDealt: result.criticalHitsDealt,
                hitsTaken: result.criticalHitsTaken,
                bonusDamageDealt: result.criticalBonusDamageDealt,
                bonusDamageTaken: result.criticalBonusDamageTaken,
                playerAttackAttempts: result.playerAttackAttempts,
                mobAttackAttempts: result.mobAttackAttempts,
                rateDealt: result.criticalRateDealt,
                rateTaken: result.criticalRateTaken,
                damageSharePercent: result.criticalDamageSharePercent,
                dealtAny: result.dealtCritical,
                tookAny: result.tookCritical,
            },
            dodgesByPlayer: result.dodgesByPlayer,
            dodgesByMob: result.dodgesByMob,
            playerDodgeRate: result.playerDodgeRate,
            mobDodgeRate: result.mobDodgeRate,
            playerDodged: result.playerDodged,
            mobDodged: result.mobDodged,
            dodge: {
                dodgesByPlayer: result.dodgesByPlayer,
                dodgesByMob: result.dodgesByMob,
                playerAttackAttempts: result.playerAttackAttempts,
                mobAttackAttempts: result.mobAttackAttempts,
                playerDodgeRate: result.playerDodgeRate,
                mobDodgeRate: result.mobDodgeRate,
                playerDodgedAny: result.playerDodged,
                mobDodgedAny: result.mobDodged,
            },
            initialMaxHp: result.initialMaxHp,
            finalMaxHp: result.finalMaxHp,
            maxHpGained: result.maxHpGained,
            initialLevel: result.initialLevel,
            finalLevel: result.finalLevel,
            levelsGained: result.levelsGained,
            leveledUp: result.leveledUp,
            finalXp: result.finalXp,
            ...xpPayload,
            potionsUsed: result.potionsUsed,
            potionItemId: result.potionItemId,
            potionItemName: result.potionItemName,
            potionTriggerPercent: result.potionTriggerPercent,
            potionQuantityBefore: result.potionQuantityBefore,
            potionQuantityAfter: result.potionQuantityAfter,
            potionQuantityRemaining: result.potionQuantityRemaining,
            potionUsedQuantity: result.potionUsedQuantity,
        };
    }
    buildInitialProcessingSummary(params) {
        const xpPayload = this.buildCharacterXpPayload(params.level, params.xp);
        return {
            processedNow: false,
            processedSeconds: 0,
            combatsResolved: 0,
            roundsResolved: 0,
            xpGained: 0,
            initialHp: params.hp,
            finalHp: params.hp,
            hpLost: 0,
            damageDealt: 0,
            damageTaken: 0,
            healingReceived: 0,
            healingFromPotions: 0,
            healingFromLevelUp: 0,
            totalHealingReceived: 0,
            hpChange: 0,
            hpLostNet: 0,
            hpRecoveredNet: 0,
            tookDamage: false,
            wasHealed: false,
            hp: {
                initial: params.hp,
                final: params.hp,
                maxInitial: params.maxHp,
                maxFinal: params.maxHp,
                maxHpGained: 0,
                change: 0,
                lostNet: 0,
                recoveredNet: 0,
                damageTaken: 0,
                healingReceived: 0,
                healingFromPotions: 0,
                healingFromLevelUp: 0,
                totalHealingReceived: 0,
                tookDamage: false,
                wasHealed: false,
                leveledUp: false,
            },
            criticalHitsDealt: 0,
            criticalHitsTaken: 0,
            criticalBonusDamageDealt: 0,
            criticalBonusDamageTaken: 0,
            playerAttackAttempts: 0,
            mobAttackAttempts: 0,
            criticalRateDealt: 0,
            criticalRateTaken: 0,
            criticalDamageSharePercent: 0,
            dealtCritical: false,
            tookCritical: false,
            critical: {
                hitsDealt: 0,
                hitsTaken: 0,
                bonusDamageDealt: 0,
                bonusDamageTaken: 0,
                playerAttackAttempts: 0,
                mobAttackAttempts: 0,
                rateDealt: 0,
                rateTaken: 0,
                damageSharePercent: 0,
                dealtAny: false,
                tookAny: false,
            },
            dodgesByPlayer: 0,
            dodgesByMob: 0,
            playerDodgeRate: 0,
            mobDodgeRate: 0,
            playerDodged: false,
            mobDodged: false,
            dodge: {
                dodgesByPlayer: 0,
                dodgesByMob: 0,
                playerAttackAttempts: 0,
                mobAttackAttempts: 0,
                playerDodgeRate: 0,
                mobDodgeRate: 0,
                playerDodgedAny: false,
                mobDodgedAny: false,
            },
            initialMaxHp: params.maxHp,
            finalMaxHp: params.maxHp,
            maxHpGained: 0,
            initialLevel: params.level,
            finalLevel: params.level,
            levelsGained: 0,
            leveledUp: false,
            finalXp: xpPayload.totalXp,
            ...xpPayload,
            potionsUsed: 0,
            potionItemId: null,
            potionItemName: null,
            potionTriggerPercent: null,
            potionQuantityBefore: null,
            potionQuantityAfter: null,
            potionQuantityRemaining: null,
            potionUsedQuantity: null,
        };
    }
    buildEmptyProcessingSummary() {
        return {
            processedNow: false,
            processedSeconds: 0,
            combatsResolved: 0,
            roundsResolved: 0,
            xpGained: 0,
            potionsUsed: 0,
            potionItemId: null,
            potionItemName: null,
            potionTriggerPercent: null,
            potionQuantityBefore: null,
            potionQuantityAfter: null,
            potionQuantityRemaining: null,
            potionUsedQuantity: null,
        };
    }
    buildAutoCombatPreview(session, options) {
        if (!session.subMap?.encounters || session.subMap.encounters.length === 0) {
            return null;
        }
        const equipmentItems = this.getEquipmentItems(session.character);
        const initialStats = (0, stats_util_1.calculateFullStats)(session.character.class, equipmentItems, session.character.level);
        const initialMaxHp = initialStats.derivedCombatStats.maxHp;
        const currentHp = this.clampHp(session.character.currentHp ?? initialMaxHp, initialMaxHp);
        if (currentHp <= 0) {
            return null;
        }
        const now = new Date();
        const projectionSeconds = this.clampNumber(Math.floor(options?.projectionSeconds ??
            Math.max(0, (session.endsAt.getTime() - now.getTime()) / 1000)), AUTO_COMBAT_EFFECTIVE_ROUND_DURATION_SECONDS, auto_combat_config_1.AUTO_COMBAT_SESSION_DURATION_SECONDS);
        if (projectionSeconds <= 0) {
            return null;
        }
        const iterations = this.clampNumber(Math.floor(options?.iterations ?? this.getPreviewIterations(projectionSeconds)), 1, AUTO_COMBAT_PREVIEW_MAX_ITERATIONS);
        let totalCombatsSimulated = 0;
        let totalRounds = 0;
        let totalCombatSeconds = 0;
        let totalXp = 0;
        let totalDamageDealt = 0;
        let totalDamageTaken = 0;
        let totalCriticalHitsDealt = 0;
        let totalCriticalHitsTaken = 0;
        let totalCriticalBonusDamageDealt = 0;
        let totalPlayerAttackAttempts = 0;
        let totalMobAttackAttempts = 0;
        let totalDodgesByPlayer = 0;
        let totalDodgesByMob = 0;
        let totalFinalHp = 0;
        let totalFinalHpPercent = 0;
        let defeats = 0;
        let fullProjectionCompleted = true;
        const basePotionState = this.createAutoPotionState(session.character);
        for (let iteration = 0; iteration < iterations; iteration++) {
            let simulatedHp = currentHp;
            let simulatedMaxHp = initialMaxHp;
            let simulatedLevel = session.character.level;
            let simulatedXp = session.character.xp;
            let remainingProjectionSeconds = projectionSeconds;
            let combatsThisIteration = 0;
            const potionState = this.cloneAutoPotionState(basePotionState);
            while (simulatedHp > 0 && remainingProjectionSeconds > 0) {
                if (combatsThisIteration >= AUTO_COMBAT_PREVIEW_MAX_COMBATS_PER_ITERATION) {
                    fullProjectionCompleted = false;
                    break;
                }
                const currentStats = (0, stats_util_1.calculateFullStats)(session.character.class, equipmentItems, simulatedLevel);
                simulatedMaxHp = currentStats.derivedCombatStats.maxHp;
                simulatedHp = this.clampHp(simulatedHp, simulatedMaxHp);
                const playerStats = {
                    name: session.character.name,
                    hp: simulatedHp,
                    maxHp: simulatedMaxHp,
                    attack: currentStats.derivedCombatStats.attack,
                    defense: currentStats.derivedCombatStats.defense,
                    speed: currentStats.derivedCombatStats.speed,
                    precision: currentStats.totalPrimaryStats.precision,
                    technique: currentStats.totalPrimaryStats.technique,
                    agility: currentStats.totalPrimaryStats.agility,
                };
                const encounter = this.rollEncounter(session.subMap.encounters);
                const mob = encounter.mob;
                const mobStats = this.calculateMobFighterStats(mob);
                const combat = this.resolvePreviewCombat(playerStats, mobStats, potionState);
                const combatDurationSeconds = combat.rounds * session.roundDurationSeconds;
                if (combatDurationSeconds <= 0 ||
                    combatDurationSeconds > remainingProjectionSeconds) {
                    break;
                }
                remainingProjectionSeconds -= combatDurationSeconds;
                totalCombatsSimulated++;
                combatsThisIteration++;
                totalRounds += combat.rounds;
                totalCombatSeconds += combatDurationSeconds;
                totalDamageDealt += combat.damageDealtByPlayer;
                totalDamageTaken += combat.damageTakenByPlayer;
                totalCriticalHitsDealt += combat.criticalHitsByPlayer;
                totalCriticalHitsTaken += combat.criticalHitsByMob;
                totalCriticalBonusDamageDealt += combat.criticalBonusDamageByPlayer;
                totalPlayerAttackAttempts += combat.playerAttackAttempts;
                totalMobAttackAttempts += combat.mobAttackAttempts;
                totalDodgesByPlayer += combat.dodgesByPlayer;
                totalDodgesByMob += combat.dodgesByMob;
                simulatedHp = combat.playerEndHp;
                if (combat.winner === 'MOB') {
                    simulatedHp = 0;
                    break;
                }
                const penalty = (0, farm_penalty_util_1.calculateTierFarmPenalty)(simulatedLevel, mob.tier);
                const finalXpReward = (0, farm_penalty_util_1.applyXpPenalty)(mob.xpReward, penalty.xpMultiplier);
                totalXp += finalXpReward;
                const levelProgress = (0, level_util_1.calculateLevelProgress)(simulatedLevel, simulatedXp, finalXpReward);
                const oldLevelBeforeReward = simulatedLevel;
                const oldMaxHpBeforeReward = simulatedMaxHp;
                simulatedLevel = levelProgress.newLevel;
                simulatedXp = levelProgress.totalXp;
                const levelsGainedNow = Math.max(0, simulatedLevel - oldLevelBeforeReward);
                if (levelsGainedNow > 0) {
                    const newStatsAfterLevelUp = (0, stats_util_1.calculateFullStats)(session.character.class, equipmentItems, simulatedLevel);
                    const newMaxHpAfterLevelUp = newStatsAfterLevelUp.derivedCombatStats.maxHp;
                    simulatedHp = this.calculateCurrentHpAfterLevelUp({
                        currentHp: simulatedHp,
                        oldMaxHp: oldMaxHpBeforeReward,
                        newMaxHp: newMaxHpAfterLevelUp,
                        levelsGained: levelsGainedNow,
                    });
                    simulatedMaxHp = newMaxHpAfterLevelUp;
                }
            }
            if (simulatedHp <= 0) {
                defeats++;
            }
            totalFinalHp += simulatedHp;
            totalFinalHpPercent += this.calculatePercent(simulatedHp, simulatedMaxHp);
        }
        const averageCombatDurationSeconds = totalCombatsSimulated > 0
            ? this.roundNumber(totalCombatSeconds / totalCombatsSimulated)
            : 0;
        const averageRoundsPerCombat = totalCombatsSimulated > 0
            ? this.roundNumber(totalRounds / totalCombatsSimulated)
            : 0;
        const xpPerMinute = totalCombatSeconds > 0
            ? this.roundNumber((totalXp / totalCombatSeconds) * 60)
            : 0;
        const expectedFinalHp = this.clampHp(Math.round(totalFinalHp / iterations), initialMaxHp);
        const expectedFinalHpPercent = this.roundNumber(totalFinalHpPercent / iterations);
        const defeatChancePercent = this.calculatePercent(defeats, iterations);
        const damageTakenPerMinute = totalCombatSeconds > 0
            ? this.roundNumber((totalDamageTaken / totalCombatSeconds) * 60)
            : 0;
        const riskScore = this.calculateRiskScore({
            defeatChancePercent,
            expectedHpPercentAtEnd: expectedFinalHpPercent,
        });
        const riskLevel = this.getRiskLevel(riskScore);
        const playerCriticalChancePercent = this.calculatePercent(totalCriticalHitsDealt, totalPlayerAttackAttempts);
        const mobCriticalChancePercent = this.calculatePercent(totalCriticalHitsTaken, totalMobAttackAttempts);
        const criticalDamageSharePercent = this.calculatePercent(totalCriticalBonusDamageDealt, totalDamageDealt);
        const playerDodgeChancePercent = this.calculatePercent(totalDodgesByPlayer, totalMobAttackAttempts);
        const mobDodgeChancePercent = this.calculatePercent(totalDodgesByMob, totalPlayerAttackAttempts);
        return {
            averageCombatDurationSeconds,
            averageRoundsPerCombat,
            xpPerMinute,
            risk: {
                level: riskLevel,
                score: riskScore,
                defeatChancePercent,
                expectedHpPercentAtEnd: expectedFinalHpPercent,
                damageTakenPerMinute,
            },
            critical: {
                playerCriticalChancePercent,
                mobCriticalChancePercent,
                criticalDamageSharePercent,
            },
            dodge: {
                playerDodgeChancePercent,
                mobDodgeChancePercent,
            },
            hp: {
                current: currentHp,
                max: initialMaxHp,
                expectedFinal: expectedFinalHp,
                expectedChange: expectedFinalHp - currentHp,
                expectedFinalPercent: expectedFinalHpPercent,
            },
            sample: {
                iterations,
                projectionSeconds,
                totalCombatsSimulated,
                fullRemainingSessionProjected: fullProjectionCompleted,
            },
        };
    }
    resolvePreviewCombat(player, mob, autoPotionState) {
        let playerHp = player.hp;
        let mobHp = mob.hp;
        let round = 1;
        const maxRounds = 30;
        let potionUsedThisCombat = false;
        let damageDealtByPlayer = 0;
        let damageTakenByPlayer = 0;
        let healingReceivedByPlayer = 0;
        let playerAttackAttempts = 0;
        let mobAttackAttempts = 0;
        let criticalHitsByPlayer = 0;
        let criticalHitsByMob = 0;
        let criticalBonusDamageByPlayer = 0;
        let criticalBonusDamageByMob = 0;
        let dodgesByPlayer = 0;
        let dodgesByMob = 0;
        const tryPotion = () => {
            if (potionUsedThisCombat) {
                return;
            }
            const potion = this.tryUseAutoPotion({
                currentHp: playerHp,
                maxHp: player.maxHp,
                autoPotionState,
                potionUsedThisCombat,
            });
            if (potion.used) {
                playerHp = potion.newHp;
                healingReceivedByPlayer += potion.healedAmount;
                potionUsedThisCombat = true;
            }
        };
        const playerAttack = () => {
            const attack = this.resolveAttack({
                attacker: player,
                defender: mob,
                targetCurrentHp: mobHp,
                targetMaxHp: mob.maxHp,
            });
            playerAttackAttempts++;
            mobHp = attack.nextTargetHp;
            damageDealtByPlayer += attack.damage;
            if (attack.isDodged) {
                dodgesByMob++;
                return;
            }
            if (attack.isCritical) {
                criticalHitsByPlayer++;
                criticalBonusDamageByPlayer += attack.criticalBonusDamage;
            }
        };
        const mobAttack = () => {
            const hpBeforeAttack = playerHp;
            const attack = this.resolveAttack({
                attacker: mob,
                defender: player,
                targetCurrentHp: playerHp,
                targetMaxHp: player.maxHp,
            });
            mobAttackAttempts++;
            playerHp = attack.nextTargetHp;
            damageTakenByPlayer += attack.damage;
            if (attack.isDodged) {
                dodgesByPlayer++;
                return;
            }
            if (attack.isCritical) {
                criticalHitsByMob++;
                criticalBonusDamageByMob += attack.criticalBonusDamage;
            }
            const tookRealDamage = hpBeforeAttack > playerHp;
            if (tookRealDamage && playerHp > 0) {
                tryPotion();
            }
        };
        while (playerHp > 0 && mobHp > 0 && round <= maxRounds) {
            if (player.speed >= mob.speed) {
                playerAttack();
                if (mobHp > 0) {
                    mobAttack();
                }
            }
            else {
                mobAttack();
                if (playerHp > 0) {
                    playerAttack();
                }
            }
            round++;
        }
        const roundsUsed = Math.max(1, round - 1);
        const playerEndHp = Math.max(0, playerHp);
        const mobEndHp = Math.max(0, mobHp);
        let winner;
        if (mobEndHp <= 0) {
            winner = 'PLAYER';
        }
        else if (playerEndHp <= 0) {
            winner = 'MOB';
        }
        else {
            winner = playerEndHp >= mobEndHp ? 'PLAYER' : 'MOB';
        }
        return {
            winner,
            rounds: roundsUsed,
            playerStartHp: player.hp,
            playerEndHp,
            mobEndHp,
            damageDealtByPlayer,
            damageTakenByPlayer,
            healingReceivedByPlayer,
            playerAttackAttempts,
            mobAttackAttempts,
            criticalHitsByPlayer,
            criticalHitsByMob,
            criticalBonusDamageByPlayer,
            criticalBonusDamageByMob,
            dodgesByPlayer,
            dodgesByMob,
        };
    }
    resolveAttack(params) {
        const hit = this.calculateHit(params.attacker, params.defender);
        if (hit.isDodged) {
            return {
                nextTargetHp: params.targetCurrentHp,
                damage: 0,
                isCritical: false,
                isDodged: true,
                criticalBonusDamage: 0,
            };
        }
        const nextTargetHp = this.clampHp(params.targetCurrentHp - hit.finalDamage, params.targetMaxHp);
        const effectiveDamage = Math.max(0, params.targetCurrentHp - nextTargetHp);
        return {
            nextTargetHp,
            damage: effectiveDamage,
            isCritical: hit.isCritical,
            isDodged: false,
            criticalBonusDamage: hit.criticalBonusDamage,
        };
    }
    buildRealtimeEvent(params) {
        const mobCurrentHp = this.clampHp(params.mobCurrentHp, params.mobMaxHp);
        const characterCurrentHp = this.clampHp(params.characterCurrentHp, params.characterMaxHp);
        const mobId = params.mobId ?? params.context.mobId;
        const mobName = params.mobName ?? params.context.mobName;
        return {
            characterId: params.context.characterId,
            sessionId: params.context.sessionId,
            type: params.type,
            message: params.message,
            mobId,
            mobName,
            mobCurrentHp,
            mobMaxHp: params.mobMaxHp,
            mobHpPercent: this.calculatePercent(mobCurrentHp, params.mobMaxHp),
            characterCurrentHp,
            characterMaxHp: params.characterMaxHp,
            characterHpPercent: this.calculatePercent(characterCurrentHp, params.characterMaxHp),
            damage: params.damage ?? 0,
            healedAmount: params.healedAmount ?? 0,
            isCritical: params.isCritical ?? false,
            isDodged: params.isDodged ?? false,
            xpGained: params.xpGained,
            characterXp: params.characterXp,
            characterLevel: params.characterLevel,
            totalXp: params.totalXp,
            currentLevelXp: params.currentLevelXp,
            xpToNextLevel: params.xpToNextLevel,
            nextLevelXp: params.nextLevelXp,
            xpProgressPercent: params.xpProgressPercent,
            xpIntoCurrentLevel: params.xpIntoCurrentLevel,
            xpNeededForNextLevel: params.xpNeededForNextLevel,
            currentLevelStartXp: params.currentLevelStartXp,
            nextLevelRequiredXp: params.nextLevelRequiredXp,
            isAtLevelCap: params.isAtLevelCap,
            levelProgress: params.levelProgress,
            leveledUp: params.leveledUp,
            levelsGained: params.levelsGained,
            totalCombats: params.totalCombats,
            totalRounds: params.totalRounds,
            totalKills: params.totalKills,
            totalXpGained: params.totalXpGained,
            totalLoot: params.totalLoot,
            potionsUsed: params.potionsUsed,
            potionItemId: params.potionItemId,
            potionItemName: params.potionItemName,
            potionTriggerPercent: params.potionTriggerPercent,
            potionQuantityBefore: params.potionQuantityBefore,
            potionQuantityAfter: params.potionQuantityAfter,
            potionQuantityRemaining: params.potionQuantityRemaining,
            potionUsedQuantity: params.potionUsedQuantity,
            round: params.round,
            combatIndex: params.combatIndex ?? params.context.combatIndex,
            actor: params.actor,
            target: params.target,
            createdAt: new Date().toISOString(),
        };
    }
    normalizeRealtimeEventForStorage(event) {
        return JSON.parse(JSON.stringify(event));
    }
    async persistRealtimeEvents(characterId, events) {
        const validEvents = events.filter((event) => {
            return Boolean(event.sessionId && event.type);
        });
        if (validEvents.length <= 0) {
            return;
        }
        const eventsBySessionId = new Map();
        for (const event of validEvents) {
            const sessionId = event.sessionId;
            if (!sessionId) {
                continue;
            }
            const currentEvents = eventsBySessionId.get(sessionId) ?? [];
            currentEvents.push(event);
            eventsBySessionId.set(sessionId, currentEvents);
        }
        for (const [sessionId, sessionEvents] of eventsBySessionId.entries()) {
            await this.prisma.$transaction(async (tx) => {
                const latestEvent = await tx.autoCombatSessionEvent.findFirst({
                    where: {
                        sessionId,
                    },
                    orderBy: {
                        sequence: 'desc',
                    },
                    select: {
                        sequence: true,
                    },
                });
                const nextSequence = (latestEvent?.sequence ?? 0) + 1;
                await tx.autoCombatSessionEvent.createMany({
                    data: sessionEvents.map((event, index) => ({
                        sessionId,
                        characterId: event.characterId ?? characterId,
                        type: String(event.type ?? 'UNKNOWN'),
                        sequence: nextSequence + index,
                        payloadJson: this.normalizeRealtimeEventForStorage(event),
                    })),
                    skipDuplicates: true,
                });
                await this.pruneOldRealtimeEvents(tx, sessionId);
            });
        }
    }
    async pruneOldRealtimeEvents(tx, sessionId) {
        const oldEvents = await tx.autoCombatSessionEvent.findMany({
            where: {
                sessionId,
            },
            orderBy: {
                sequence: 'desc',
            },
            skip: AUTO_COMBAT_STORED_EVENTS_LIMIT,
            select: {
                id: true,
            },
        });
        if (oldEvents.length <= 0) {
            return;
        }
        await tx.autoCombatSessionEvent.deleteMany({
            where: {
                id: {
                    in: oldEvents.map((event) => event.id),
                },
            },
        });
    }
    emitRealtimeEvents(characterId, events) {
        void this.persistRealtimeEvents(characterId, events).catch(() => {
        });
        for (const event of events) {
            switch (event.type) {
                case 'MOB_SPAWNED':
                    this.autoCombatGateway.emitMobSpawned(characterId, event);
                    break;
                case 'PLAYER_HIT':
                case 'MOB_HIT':
                case 'DODGE':
                    this.autoCombatGateway.emitHit(characterId, event);
                    break;
                case 'POTION_USED':
                    this.autoCombatGateway.emitPotionUsed(characterId, event);
                    break;
                case 'MOB_DEFEATED':
                    this.autoCombatGateway.emitMobDefeated(characterId, event);
                    break;
                case 'PLAYER_DEFEATED':
                    this.autoCombatGateway.emitPlayerDefeated(characterId, event);
                    break;
                default:
                    break;
            }
        }
    }
    createAutoPotionState(character) {
        const config = character.potionConfig;
        if (!config || !config.enabled || !config.useInAutoCombat) {
            return null;
        }
        const potionItem = config.potionItem;
        if (!potionItem) {
            return null;
        }
        if (potionItem.slot !== client_1.ItemSlot.CONSUMABLE) {
            return null;
        }
        if (!potionItem.usableInCombat) {
            return null;
        }
        if (potionItem.healFlat <= 0 && potionItem.healPercent <= 0) {
            return null;
        }
        const inventoryItem = character.inventoryItems?.find((currentInventoryItem) => currentInventoryItem.itemId === potionItem.id &&
            currentInventoryItem.type === client_1.InventoryItemType.CONSUMABLE);
        const availableQuantity = inventoryItem?.quantity ?? 0;
        if (availableQuantity <= 0) {
            return null;
        }
        return {
            enabled: true,
            potionItemId: potionItem.id,
            potionItemName: potionItem.name,
            hpThresholdPercent: this.clampNumber(config.hpThresholdPercent ?? 35, 1, 100),
            healFlat: potionItem.healFlat,
            healPercent: potionItem.healPercent,
            availableQuantity,
            usedQuantity: 0,
            totalHealed: 0,
        };
    }
    tryUseAutoPotion(params) {
        const { currentHp, maxHp, autoPotionState, potionUsedThisCombat = false, } = params;
        if (!autoPotionState) {
            return {
                used: false,
                newHp: currentHp,
                healedAmount: 0,
                quantityBefore: null,
                quantityAfter: null,
                usedQuantity: null,
            };
        }
        if (potionUsedThisCombat) {
            return {
                used: false,
                newHp: currentHp,
                healedAmount: 0,
                quantityBefore: autoPotionState.availableQuantity,
                quantityAfter: autoPotionState.availableQuantity,
                usedQuantity: 0,
            };
        }
        if (autoPotionState.availableQuantity <= 0) {
            return {
                used: false,
                newHp: currentHp,
                healedAmount: 0,
                quantityBefore: autoPotionState.availableQuantity,
                quantityAfter: autoPotionState.availableQuantity,
                usedQuantity: 0,
            };
        }
        if (currentHp <= 0) {
            return {
                used: false,
                newHp: currentHp,
                healedAmount: 0,
                quantityBefore: autoPotionState.availableQuantity,
                quantityAfter: autoPotionState.availableQuantity,
                usedQuantity: 0,
            };
        }
        if (maxHp <= 0) {
            return {
                used: false,
                newHp: currentHp,
                healedAmount: 0,
                quantityBefore: autoPotionState.availableQuantity,
                quantityAfter: autoPotionState.availableQuantity,
                usedQuantity: 0,
            };
        }
        if (currentHp >= maxHp) {
            return {
                used: false,
                newHp: currentHp,
                healedAmount: 0,
                quantityBefore: autoPotionState.availableQuantity,
                quantityAfter: autoPotionState.availableQuantity,
                usedQuantity: 0,
            };
        }
        const safeThresholdPercent = this.clampNumber(autoPotionState.hpThresholdPercent, 1, 100);
        const thresholdHp = Math.floor((maxHp * safeThresholdPercent) / 100);
        if (currentHp > thresholdHp) {
            return {
                used: false,
                newHp: currentHp,
                healedAmount: 0,
                quantityBefore: autoPotionState.availableQuantity,
                quantityAfter: autoPotionState.availableQuantity,
                usedQuantity: 0,
            };
        }
        const healAmount = this.calculateHealAmount({
            maxHp,
            healFlat: autoPotionState.healFlat,
            healPercent: autoPotionState.healPercent,
        });
        const newHp = this.clampHp(currentHp + healAmount, maxHp);
        const healedAmount = newHp - currentHp;
        if (healedAmount <= 0) {
            return {
                used: false,
                newHp: currentHp,
                healedAmount: 0,
                quantityBefore: autoPotionState.availableQuantity,
                quantityAfter: autoPotionState.availableQuantity,
                usedQuantity: 0,
            };
        }
        const quantityBefore = autoPotionState.availableQuantity;
        autoPotionState.availableQuantity -= 1;
        autoPotionState.usedQuantity += 1;
        autoPotionState.totalHealed += healedAmount;
        const quantityAfter = autoPotionState.availableQuantity;
        return {
            used: true,
            newHp,
            healedAmount,
            quantityBefore,
            quantityAfter,
            usedQuantity: 1,
        };
    }
    calculateHealAmount(params) {
        const percentHeal = Math.floor((params.maxHp * params.healPercent) / 100);
        return params.healFlat + percentHeal;
    }
    cloneAutoPotionState(autoPotionState) {
        if (!autoPotionState) {
            return null;
        }
        return {
            ...autoPotionState,
            availableQuantity: autoPotionState.availableQuantity,
            usedQuantity: 0,
            totalHealed: 0,
        };
    }
    getPotionCombatKey(sessionId, combatIndex) {
        return `${sessionId}:${combatIndex}`;
    }
    clearPotionUsageForSession(sessionId) {
        for (const key of Array.from(this.potionUsageByCombat)) {
            if (key.startsWith(`${sessionId}:`)) {
                this.potionUsageByCombat.delete(key);
            }
        }
    }
    rollEncounter(encounters) {
        const activeEncounters = encounters.filter((encounter) => encounter.isActive && encounter.weight > 0);
        if (activeEncounters.length === 0) {
            throw new common_1.BadRequestException('Nenhum encontro ativo disponível neste submapa.');
        }
        const totalWeight = activeEncounters.reduce((total, encounter) => total + encounter.weight, 0);
        let roll = Math.floor(Math.random() * totalWeight) + 1;
        for (const encounter of activeEncounters) {
            roll -= encounter.weight;
            if (roll <= 0) {
                return encounter;
            }
        }
        return activeEncounters[activeEncounters.length - 1];
    }
    addLoot(loots, itemId, quantity) {
        const existingLoot = loots.get(itemId);
        if (existingLoot) {
            existingLoot.quantity += quantity;
            return;
        }
        loots.set(itemId, {
            itemId,
            quantity,
        });
    }
    addMobSummary(mobSummaries, mobId, xpGained) {
        const existingSummary = mobSummaries.get(mobId);
        if (existingSummary) {
            existingSummary.kills += 1;
            existingSummary.xpGained += xpGained;
            return;
        }
        mobSummaries.set(mobId, {
            mobId,
            kills: 1,
            xpGained,
        });
    }
    getEquipmentItems(character) {
        return [
            character.equipment?.mainHand,
            character.equipment?.offHand,
            character.equipment?.head,
            character.equipment?.armor,
            character.equipment?.pants,
            character.equipment?.boots,
        ];
    }
    calculateCharacterFighterStats(character) {
        const equipmentItems = this.getEquipmentItems(character);
        const stats = (0, stats_util_1.calculateFullStats)(character.class, equipmentItems, character.level);
        const maxHp = stats.derivedCombatStats.maxHp;
        const currentHp = character.currentHp === null || character.currentHp === undefined
            ? maxHp
            : character.currentHp;
        const clampedCurrentHp = this.clampHp(currentHp, maxHp);
        return {
            name: character.name,
            hp: clampedCurrentHp,
            maxHp,
            attack: stats.derivedCombatStats.attack,
            defense: stats.derivedCombatStats.defense,
            speed: stats.derivedCombatStats.speed,
            precision: stats.totalPrimaryStats.precision,
            technique: stats.totalPrimaryStats.technique,
            agility: stats.totalPrimaryStats.agility,
        };
    }
    calculateMobFighterStats(mob) {
        const safeSpeed = Math.max(1, mob.speed ?? 1);
        const safeLevel = Math.max(1, mob.level ?? 1);
        return {
            name: mob.name,
            hp: mob.hp,
            maxHp: mob.hp,
            attack: mob.attack,
            defense: mob.defense,
            speed: safeSpeed,
            precision: safeSpeed,
            technique: safeLevel,
            agility: safeSpeed,
        };
    }
    calculateCurrentHpAfterLevelUp(params) {
        const { currentHp, oldMaxHp, newMaxHp, levelsGained } = params;
        if (currentHp <= 0) {
            return 0;
        }
        const maxHpDifference = Math.max(0, newMaxHp - oldMaxHp);
        const levelUpBonusHeal = levelsGained > 0 ? Math.floor(newMaxHp * 0.05 * levelsGained) : 0;
        return this.clampHp(currentHp + maxHpDifference + levelUpBonusHeal, newMaxHp);
    }
    calculateHit(attacker, defender) {
        return (0, combat_damage_util_1.calculateCombatHit)({
            attack: attacker.attack,
            defense: defender.defense,
            attackerPrecision: attacker.precision,
            attackerTechnique: attacker.technique,
            defenderAgility: defender.agility,
            minMultiplier: 0.9,
            maxMultiplier: 1.1,
        });
    }
    calculateSessionRemainingSeconds(session, now = new Date()) {
        if (session.status === client_1.AutoCombatSessionStatus.ACTIVE) {
            return Math.max(0, Math.floor((session.endsAt.getTime() - now.getTime()) / 1000));
        }
        if (session.status === client_1.AutoCombatSessionStatus.STOPPED ||
            session.status === client_1.AutoCombatSessionStatus.DEFEATED) {
            const referenceDate = session.finishedAt ?? now;
            return Math.max(0, Math.floor((session.endsAt.getTime() - referenceDate.getTime()) / 1000));
        }
        return 0;
    }
    getSessionStatusText(status) {
        switch (status) {
            case client_1.AutoCombatSessionStatus.ACTIVE:
                return 'Sessão ativa';
            case client_1.AutoCombatSessionStatus.FINISHED:
                return 'Sessão finalizada';
            case client_1.AutoCombatSessionStatus.STOPPED:
                return 'Sessão interrompida manualmente';
            case client_1.AutoCombatSessionStatus.DEFEATED:
                return 'Sessão encerrada por derrota';
            default:
                return 'Status desconhecido';
        }
    }
    calculateRiskScore(params) {
        const defeatWeight = params.defeatChancePercent * 0.7;
        const hpPressureWeight = (100 - params.expectedHpPercentAtEnd) * 0.3;
        return this.clampNumber(Math.round(defeatWeight + hpPressureWeight), 0, 100);
    }
    getRiskLevel(score) {
        if (score >= 80) {
            return 'LETHAL';
        }
        if (score >= 55) {
            return 'HIGH';
        }
        if (score >= 25) {
            return 'MEDIUM';
        }
        return 'LOW';
    }
    getPreviewIterations(projectionSeconds) {
        if (projectionSeconds >= 4 * 60 * 60) {
            return AUTO_COMBAT_PREVIEW_MIN_ITERATIONS;
        }
        if (projectionSeconds >= 2 * 60 * 60) {
            return 8;
        }
        if (projectionSeconds >= 60 * 60) {
            return 10;
        }
        return AUTO_COMBAT_PREVIEW_MAX_ITERATIONS;
    }
    buildCharacterXpPayload(characterLevel, characterXp) {
        const levelProgress = (0, level_util_1.getLevelProgress)(characterLevel, characterXp);
        const xpToNextLevel = this.getXpToNextLevelFromProgress(levelProgress);
        return {
            totalXp: levelProgress.totalXp,
            currentLevelXp: levelProgress.xpIntoCurrentLevel,
            xpToNextLevel,
            nextLevelXp: xpToNextLevel,
            xpProgressPercent: levelProgress.progressPercent,
            xpIntoCurrentLevel: levelProgress.xpIntoCurrentLevel,
            xpNeededForNextLevel: levelProgress.xpNeededForNextLevel,
            currentLevelStartXp: levelProgress.currentLevelStartXp,
            nextLevelRequiredXp: levelProgress.nextLevelRequiredXp,
            isAtLevelCap: levelProgress.isAtLevelCap,
            levelProgress: {
                oldLevel: levelProgress.oldLevel,
                newLevel: levelProgress.newLevel,
                currentXp: levelProgress.currentXp,
                gainedXp: levelProgress.gainedXp,
                totalXp: levelProgress.totalXp,
                currentLevelXp: levelProgress.xpIntoCurrentLevel,
                xpToNextLevel,
                nextLevelXp: xpToNextLevel,
                xpProgressPercent: levelProgress.progressPercent,
                leveledUp: levelProgress.leveledUp,
                levelsGained: levelProgress.levelsGained,
                levelCap: levelProgress.levelCap,
                isAtLevelCap: levelProgress.isAtLevelCap,
                currentLevelStartXp: levelProgress.currentLevelStartXp,
                nextLevelRequiredXp: levelProgress.nextLevelRequiredXp,
                xpIntoCurrentLevel: levelProgress.xpIntoCurrentLevel,
                xpNeededForNextLevel: levelProgress.xpNeededForNextLevel,
                progressPercent: levelProgress.progressPercent,
            },
        };
    }
    getXpToNextLevelFromProgress(levelProgress) {
        if (levelProgress.xpNeededForNextLevel === null) {
            return Math.max(1, levelProgress.xpIntoCurrentLevel);
        }
        return (levelProgress.xpIntoCurrentLevel + levelProgress.xpNeededForNextLevel);
    }
    calculatePercent(part, total) {
        if (total <= 0) {
            return 0;
        }
        return Number(((part / total) * 100).toFixed(2));
    }
    roundNumber(value, decimals = 2) {
        return Number(value.toFixed(decimals));
    }
    clampNumber(value, min, max) {
        return Math.max(min, Math.min(value, max));
    }
    clampHp(currentHp, maxHp) {
        return Math.max(0, Math.min(currentHp, maxHp));
    }
    randomBetween(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    getInventoryItemType(slot) {
        if (slot === client_1.ItemSlot.MATERIAL) {
            return client_1.InventoryItemType.MATERIAL;
        }
        if (slot === client_1.ItemSlot.CONSUMABLE) {
            return client_1.InventoryItemType.CONSUMABLE;
        }
        return client_1.InventoryItemType.EQUIPMENT;
    }
};
exports.AutoCombatService = AutoCombatService;
exports.AutoCombatService = AutoCombatService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        activity_guard_service_1.ActivityGuardService,
        auto_combat_gateway_1.AutoCombatGateway])
], AutoCombatService);
//# sourceMappingURL=auto-combat.service.js.map