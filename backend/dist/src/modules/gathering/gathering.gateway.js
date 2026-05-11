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
exports.GatheringGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const start_gathering_dto_1 = require("./dto/start-gathering.dto");
const gathering_service_1 = require("./gathering.service");
const GATHERING_NAMESPACE = '/gathering';
const GATHERING_TICK_MS = 1000;
let GatheringGateway = class GatheringGateway {
    gatheringService;
    server;
    clientsByCharacterId = new Map();
    intervalsByCharacterId = new Map();
    constructor(gatheringService) {
        this.gatheringService = gatheringService;
    }
    handleConnection(client) {
        client.data.gatheringCharacterIds = new Set();
        const rawCharacterId = client.handshake.query.characterId;
        const characterId = Array.isArray(rawCharacterId)
            ? rawCharacterId[0]
            : rawCharacterId;
        if (typeof characterId === 'string' && characterId.trim().length > 0) {
            void this.joinCharacterRoom(client, characterId);
        }
    }
    handleDisconnect(client) {
        const characterIds = client.data.gatheringCharacterIds ?? new Set();
        for (const characterId of characterIds) {
            this.removeClientFromCharacter(client.id, characterId);
        }
        client.data.gatheringCharacterIds?.clear();
    }
    async handleJoin(client, payload) {
        const characterId = this.normalizeCharacterId(payload?.characterId);
        if (!characterId) {
            client.emit('gathering:error', {
                message: 'characterId inválido para entrar no gathering em tempo real.',
            });
            return null;
        }
        return this.joinCharacterRoom(client, characterId);
    }
    handleLeave(client, payload) {
        const characterId = this.normalizeCharacterId(payload?.characterId);
        if (!characterId) {
            return null;
        }
        client.leave(this.getRoomName(characterId));
        client.data.gatheringCharacterIds?.delete(characterId);
        this.removeClientFromCharacter(client.id, characterId);
        return { ok: true };
    }
    async handleStatusRequest(client, payload) {
        const characterId = this.normalizeCharacterId(payload?.characterId);
        if (!characterId) {
            client.emit('gathering:error', {
                message: 'characterId inválido para buscar status do gathering.',
            });
            return null;
        }
        return this.emitStatusToClient(client, characterId, 'gathering:status');
    }
    async handleRefresh(client, payload) {
        const characterId = this.normalizeCharacterId(payload?.characterId);
        if (!characterId) {
            client.emit('gathering:error', {
                message: 'characterId inválido para atualizar gathering.',
            });
            return null;
        }
        return this.emitStatusToRoom(characterId, 'gathering:status');
    }
    async handleStart(client, payload) {
        const characterId = this.normalizeCharacterId(payload?.characterId);
        if (!characterId) {
            client.emit('gathering:error', {
                message: 'characterId inválido para iniciar gathering.',
            });
            return null;
        }
        try {
            await this.gatheringService.start(payload);
            await this.joinCharacterRoom(client, characterId);
            return this.emitStatusToRoom(characterId, 'gathering:started');
        }
        catch (error) {
            this.emitError(client, error);
            return null;
        }
    }
    async handleCollect(client, payload) {
        const characterId = this.normalizeCharacterId(payload?.characterId);
        if (!characterId) {
            client.emit('gathering:error', {
                message: 'characterId inválido para coletar gathering.',
            });
            return null;
        }
        try {
            const result = await this.gatheringService.collect(characterId);
            await this.emitStatusToRoom(characterId, 'gathering:collected');
            return result;
        }
        catch (error) {
            this.emitError(client, error);
            return null;
        }
    }
    async handleStop(client, payload) {
        const characterId = this.normalizeCharacterId(payload?.characterId);
        if (!characterId) {
            client.emit('gathering:error', {
                message: 'characterId inválido para parar gathering.',
            });
            return null;
        }
        try {
            const result = await this.gatheringService.stop(characterId);
            await this.emitStatusToRoom(characterId, 'gathering:stopped');
            this.stopCharacterIntervalIfInactive(characterId);
            return result;
        }
        catch (error) {
            this.emitError(client, error);
            return null;
        }
    }
    async joinCharacterRoom(client, characterId) {
        const normalizedCharacterId = this.normalizeCharacterId(characterId);
        if (!normalizedCharacterId) {
            return null;
        }
        const roomName = this.getRoomName(normalizedCharacterId);
        client.join(roomName);
        if (!client.data.gatheringCharacterIds) {
            client.data.gatheringCharacterIds = new Set();
        }
        client.data.gatheringCharacterIds.add(normalizedCharacterId);
        this.addClientToCharacter(client.id, normalizedCharacterId);
        this.ensureCharacterInterval(normalizedCharacterId);
        return this.emitStatusToClient(client, normalizedCharacterId, 'gathering:status');
    }
    addClientToCharacter(clientId, characterId) {
        const currentSet = this.clientsByCharacterId.get(characterId) ?? new Set();
        currentSet.add(clientId);
        this.clientsByCharacterId.set(characterId, currentSet);
    }
    removeClientFromCharacter(clientId, characterId) {
        const currentSet = this.clientsByCharacterId.get(characterId);
        if (!currentSet) {
            return;
        }
        currentSet.delete(clientId);
        if (currentSet.size > 0) {
            this.clientsByCharacterId.set(characterId, currentSet);
            return;
        }
        this.clientsByCharacterId.delete(characterId);
        this.clearCharacterInterval(characterId);
    }
    ensureCharacterInterval(characterId) {
        if (this.intervalsByCharacterId.has(characterId)) {
            return;
        }
        const intervalId = setInterval(() => {
            void this.emitStatusToRoom(characterId, 'gathering:progress');
        }, GATHERING_TICK_MS);
        this.intervalsByCharacterId.set(characterId, intervalId);
    }
    clearCharacterInterval(characterId) {
        const intervalId = this.intervalsByCharacterId.get(characterId);
        if (!intervalId) {
            return;
        }
        clearInterval(intervalId);
        this.intervalsByCharacterId.delete(characterId);
    }
    async stopCharacterIntervalIfInactive(characterId) {
        const status = await this.safeGetStatus(characterId);
        if (!status?.active) {
            this.clearCharacterInterval(characterId);
        }
    }
    async emitStatusToClient(client, characterId, eventName) {
        const status = await this.safeGetStatus(characterId);
        if (!status) {
            client.emit('gathering:error', {
                message: 'Não foi possível carregar o status do gathering.',
            });
            return null;
        }
        client.emit(eventName, status);
        return status;
    }
    async emitStatusToRoom(characterId, eventName) {
        const status = await this.safeGetStatus(characterId);
        if (!status) {
            this.server.to(this.getRoomName(characterId)).emit('gathering:error', {
                message: 'Não foi possível carregar o status do gathering.',
            });
            return null;
        }
        this.server.to(this.getRoomName(characterId)).emit(eventName, status);
        return status;
    }
    async safeGetStatus(characterId) {
        try {
            return await this.gatheringService.getStatus(characterId);
        }
        catch (error) {
            const message = this.extractErrorMessage(error);
            this.server.to(this.getRoomName(characterId)).emit('gathering:error', {
                message,
            });
            return null;
        }
    }
    emitError(client, error) {
        client.emit('gathering:error', {
            message: this.extractErrorMessage(error),
        });
    }
    extractErrorMessage(error) {
        if (error instanceof Error && error.message.trim().length > 0) {
            return error.message;
        }
        if (typeof error === 'object' &&
            error !== null &&
            'message' in error &&
            typeof error.message === 'string') {
            return error.message;
        }
        return 'Erro inesperado no gathering em tempo real.';
    }
    normalizeCharacterId(value) {
        if (typeof value !== 'string') {
            return null;
        }
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
    }
    getRoomName(characterId) {
        return `gathering:${characterId}`;
    }
};
exports.GatheringGateway = GatheringGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", Function)
], GatheringGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('gathering:join'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatheringGateway.prototype, "handleJoin", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('gathering:leave'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], GatheringGateway.prototype, "handleLeave", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('gathering:status:request'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatheringGateway.prototype, "handleStatusRequest", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('gathering:refresh'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatheringGateway.prototype, "handleRefresh", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('gathering:start'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, start_gathering_dto_1.StartGatheringDto]),
    __metadata("design:returntype", Promise)
], GatheringGateway.prototype, "handleStart", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('gathering:collect'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatheringGateway.prototype, "handleCollect", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('gathering:stop'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatheringGateway.prototype, "handleStop", null);
exports.GatheringGateway = GatheringGateway = __decorate([
    (0, websockets_1.WebSocketGateway)({
        namespace: GATHERING_NAMESPACE,
        cors: {
            origin: true,
            credentials: true,
        },
    }),
    __metadata("design:paramtypes", [gathering_service_1.GatheringService])
], GatheringGateway);
//# sourceMappingURL=gathering.gateway.js.map