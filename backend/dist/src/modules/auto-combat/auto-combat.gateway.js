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
var AutoCombatGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutoCombatGateway = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const websockets_1 = require("@nestjs/websockets");
const prisma_service_1 = require("../../prisma/prisma.service");
let AutoCombatGateway = AutoCombatGateway_1 = class AutoCombatGateway {
    jwtService;
    prisma;
    server;
    logger = new common_1.Logger(AutoCombatGateway_1.name);
    lastInactiveStatusSignatureByCharacterId = new Map();
    constructor(jwtService, prisma) {
        this.jwtService = jwtService;
        this.prisma = prisma;
    }
    async handleConnection(client) {
        try {
            const token = this.extractToken(client);
            if (!token) {
                client.emit('auto-combat:error', {
                    message: 'Token de autenticação não enviado no WebSocket.',
                });
                client.disconnect(true);
                return;
            }
            const payload = await this.jwtService.verifyAsync(token);
            if (!payload?.sub) {
                client.emit('auto-combat:error', {
                    message: 'Token de autenticação inválido no WebSocket.',
                });
                client.disconnect(true);
                return;
            }
            const user = await this.prisma.user.findUnique({
                where: {
                    id: payload.sub,
                },
                select: {
                    id: true,
                    email: true,
                },
            });
            if (!user) {
                client.emit('auto-combat:error', {
                    message: 'Usuário do WebSocket não encontrado.',
                });
                client.disconnect(true);
                return;
            }
            client.data.userId = user.id;
            client.data.email = user.email;
            client.data.joinedCharacterRooms = new Set();
            await client.join(this.getUserRoom(user.id));
            client.emit('auto-combat:connected', {
                socketId: client.id,
                userId: user.id,
            });
            this.logger.log(`Socket conectado: ${client.id} | userId=${user.id}`);
        }
        catch {
            client.emit('auto-combat:error', {
                message: 'Não foi possível autenticar o WebSocket.',
            });
            client.disconnect(true);
        }
    }
    handleDisconnect(client) {
        client.data.joinedCharacterRooms?.clear();
        this.logger.log(`Socket desconectado: ${client.id}`);
    }
    async handleJoinAutoCombatRoom(client, payload) {
        const userId = client.data.userId;
        const characterId = this.normalizeId(payload?.characterId);
        if (!userId) {
            client.emit('auto-combat:error', {
                message: 'Socket não autenticado.',
            });
            return {
                ok: false,
                message: 'Socket não autenticado.',
            };
        }
        if (!characterId) {
            client.emit('auto-combat:error', {
                message: 'ID do personagem não enviado para entrar na sala.',
            });
            return {
                ok: false,
                message: 'ID do personagem não enviado para entrar na sala.',
            };
        }
        const character = await this.prisma.character.findFirst({
            where: {
                id: characterId,
                userId,
                deletedAt: null,
            },
            select: {
                id: true,
                name: true,
            },
        });
        if (!character) {
            client.emit('auto-combat:error', {
                message: 'Personagem não encontrado para este usuário.',
            });
            return {
                ok: false,
                message: 'Personagem não encontrado para este usuário.',
            };
        }
        const room = this.getCharacterRoom(character.id);
        if (!client.data.joinedCharacterRooms) {
            client.data.joinedCharacterRooms = new Set();
        }
        if (!client.data.joinedCharacterRooms.has(room)) {
            await client.join(room);
            client.data.joinedCharacterRooms.add(room);
        }
        client.emit('auto-combat:joined', {
            characterId: character.id,
            characterName: character.name,
            room,
        });
        this.logger.log(`Socket ${client.id} entrou na sala ${room} | personagem=${character.name}`);
        return {
            ok: true,
            characterId: character.id,
            characterName: character.name,
            room,
        };
    }
    async handleLeaveAutoCombatRoom(client, payload) {
        const userId = client.data.userId;
        const characterId = this.normalizeId(payload?.characterId);
        if (!userId) {
            client.emit('auto-combat:error', {
                message: 'Socket não autenticado.',
            });
            return {
                ok: false,
                message: 'Socket não autenticado.',
            };
        }
        if (!characterId) {
            return {
                ok: false,
                message: 'ID do personagem não enviado para sair da sala.',
            };
        }
        const room = this.getCharacterRoom(characterId);
        await client.leave(room);
        client.data.joinedCharacterRooms?.delete(room);
        client.emit('auto-combat:left', {
            characterId,
            room,
        });
        this.logger.log(`Socket ${client.id} saiu da sala ${room}`);
        return {
            ok: true,
            characterId,
            room,
        };
    }
    emitStatus(characterId, payload) {
        const normalizedCharacterId = this.normalizeId(characterId);
        if (!normalizedCharacterId) {
            return;
        }
        if (this.shouldSuppressDuplicateInactiveStatus(normalizedCharacterId, payload)) {
            return;
        }
        this.emitToCharacter(normalizedCharacterId, 'auto-combat:status', payload);
    }
    emitSessionUpdated(characterId, payload) {
        this.clearInactiveStatusCache(characterId);
        this.emitToCharacter(characterId, 'auto-combat:session-updated', payload);
    }
    emitHit(characterId, payload) {
        this.clearInactiveStatusCache(characterId);
        const type = this.getPayloadType(payload);
        if (type === 'DODGE') {
            this.emitRealtimeEventToCharacter(characterId, 'auto-combat:dodge', payload);
            return;
        }
        this.emitRealtimeEventToCharacter(characterId, 'auto-combat:hit', payload);
    }
    emitMobSpawned(characterId, payload) {
        this.clearInactiveStatusCache(characterId);
        this.emitRealtimeEventToCharacter(characterId, 'auto-combat:mob-spawned', payload);
    }
    emitMobDefeated(characterId, payload) {
        this.clearInactiveStatusCache(characterId);
        this.emitRealtimeEventToCharacter(characterId, 'auto-combat:mob-defeated', payload);
    }
    emitPlayerDefeated(characterId, payload) {
        this.clearInactiveStatusCache(characterId);
        this.emitRealtimeEventToCharacter(characterId, 'auto-combat:player-defeated', payload);
    }
    emitPotionUsed(characterId, payload) {
        this.clearInactiveStatusCache(characterId);
        this.emitRealtimeEventToCharacter(characterId, 'auto-combat:potion-used', payload);
    }
    emitFinished(characterId, payload) {
        this.clearInactiveStatusCache(characterId);
        this.emitToCharacter(characterId, 'auto-combat:finished', payload);
    }
    emitStopped(characterId, payload) {
        this.clearInactiveStatusCache(characterId);
        this.emitToCharacter(characterId, 'auto-combat:stopped', payload);
    }
    emitError(characterId, message) {
        this.emitToCharacter(characterId, 'auto-combat:error', {
            message,
        });
    }
    emitRealtimeEventToCharacter(characterId, event, payload) {
        this.emitToCharacter(characterId, event, payload);
        this.emitToCharacter(characterId, 'auto-combat:event', payload);
    }
    emitToCharacter(characterId, event, payload) {
        if (!this.server) {
            return;
        }
        const normalizedCharacterId = this.normalizeId(characterId);
        if (!normalizedCharacterId) {
            return;
        }
        this.server
            .to(this.getCharacterRoom(normalizedCharacterId))
            .emit(event, payload);
    }
    shouldSuppressDuplicateInactiveStatus(characterId, payload) {
        if (!this.isInactiveAutoCombatStatusPayload(payload)) {
            this.clearInactiveStatusCache(characterId);
            return false;
        }
        const signature = this.getPayloadSignature(payload);
        const previousSignature = this.lastInactiveStatusSignatureByCharacterId.get(characterId);
        if (previousSignature === signature) {
            return true;
        }
        this.lastInactiveStatusSignatureByCharacterId.set(characterId, signature);
        return false;
    }
    isInactiveAutoCombatStatusPayload(payload) {
        if (!payload || typeof payload !== 'object') {
            return false;
        }
        const statusPayload = payload;
        const sessionStatus = String(statusPayload.session?.status ?? '')
            .trim()
            .toUpperCase();
        if (statusPayload.active === false) {
            return true;
        }
        if (statusPayload.hasActiveAutoCombat === false) {
            return true;
        }
        return [
            'STOPPED',
            'FINISHED',
            'COMPLETED',
            'DEFEATED',
            'EXPIRED',
            'CANCELLED',
            'CANCELED',
        ].includes(sessionStatus);
    }
    clearInactiveStatusCache(characterId) {
        const normalizedCharacterId = this.normalizeId(characterId);
        if (!normalizedCharacterId) {
            return;
        }
        this.lastInactiveStatusSignatureByCharacterId.delete(normalizedCharacterId);
    }
    getPayloadSignature(payload) {
        try {
            return JSON.stringify(payload);
        }
        catch {
            return String(Date.now());
        }
    }
    getPayloadType(payload) {
        if (!payload || typeof payload !== 'object') {
            return '';
        }
        const typedPayload = payload;
        return String(typedPayload.type ?? '').trim().toUpperCase();
    }
    extractToken(client) {
        const authToken = client.handshake.auth?.token;
        if (typeof authToken === 'string' && authToken.trim()) {
            return this.normalizeBearerToken(authToken);
        }
        const authAccessToken = client.handshake.auth?.accessToken;
        if (typeof authAccessToken === 'string' && authAccessToken.trim()) {
            return this.normalizeBearerToken(authAccessToken);
        }
        const queryToken = client.handshake.query?.token;
        if (typeof queryToken === 'string' && queryToken.trim()) {
            return this.normalizeBearerToken(queryToken);
        }
        const queryAccessToken = client.handshake.query?.accessToken;
        if (typeof queryAccessToken === 'string' && queryAccessToken.trim()) {
            return this.normalizeBearerToken(queryAccessToken);
        }
        const authorizationHeader = client.handshake.headers.authorization;
        if (typeof authorizationHeader === 'string' && authorizationHeader.trim()) {
            return this.normalizeBearerToken(authorizationHeader);
        }
        return null;
    }
    normalizeBearerToken(value) {
        const token = value.trim();
        if (token.toLowerCase().startsWith('bearer ')) {
            return token.slice(7).trim();
        }
        return token;
    }
    normalizeId(value) {
        if (typeof value !== 'string') {
            return null;
        }
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
    }
    getUserRoom(userId) {
        return `user:${userId}`;
    }
    getCharacterRoom(characterId) {
        return `auto-combat:character:${characterId}`;
    }
};
exports.AutoCombatGateway = AutoCombatGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", Function)
], AutoCombatGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('auto-combat:join'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AutoCombatGateway.prototype, "handleJoinAutoCombatRoom", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('auto-combat:leave'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AutoCombatGateway.prototype, "handleLeaveAutoCombatRoom", null);
exports.AutoCombatGateway = AutoCombatGateway = AutoCombatGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({
        namespace: '/auto-combat',
        cors: {
            origin: true,
            credentials: true,
        },
    }),
    __metadata("design:paramtypes", [jwt_1.JwtService,
        prisma_service_1.PrismaService])
], AutoCombatGateway);
//# sourceMappingURL=auto-combat.gateway.js.map