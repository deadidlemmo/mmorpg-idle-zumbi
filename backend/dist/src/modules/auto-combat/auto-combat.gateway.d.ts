import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service';
type AutoCombatJoinPayload = {
    characterId?: string;
};
type AutoCombatLeavePayload = {
    characterId?: string;
};
type AutoCombatSocketData = {
    userId?: string;
    email?: string | null;
    joinedCharacterRooms?: Set<string>;
};
type AuthenticatedSocket = Socket & {
    data: Socket['data'] & AutoCombatSocketData;
};
export declare class AutoCombatGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private readonly jwtService;
    private readonly prisma;
    server: Server;
    private readonly logger;
    private readonly lastInactiveStatusSignatureByCharacterId;
    constructor(jwtService: JwtService, prisma: PrismaService);
    handleConnection(client: AuthenticatedSocket): Promise<void>;
    handleDisconnect(client: AuthenticatedSocket): void;
    handleJoinAutoCombatRoom(client: AuthenticatedSocket, payload: AutoCombatJoinPayload): Promise<{
        ok: boolean;
        message: string;
        characterId?: undefined;
        characterName?: undefined;
        room?: undefined;
    } | {
        ok: boolean;
        characterId: string;
        characterName: string;
        room: string;
        message?: undefined;
    }>;
    handleLeaveAutoCombatRoom(client: AuthenticatedSocket, payload: AutoCombatLeavePayload): Promise<{
        ok: boolean;
        message: string;
        characterId?: undefined;
        room?: undefined;
    } | {
        ok: boolean;
        characterId: string;
        room: string;
        message?: undefined;
    }>;
    emitStatus(characterId: string, payload: unknown): void;
    emitSessionUpdated(characterId: string, payload: unknown): void;
    emitHit(characterId: string, payload: unknown): void;
    emitMobSpawned(characterId: string, payload: unknown): void;
    emitMobDefeated(characterId: string, payload: unknown): void;
    emitPlayerDefeated(characterId: string, payload: unknown): void;
    emitPotionUsed(characterId: string, payload: unknown): void;
    emitFinished(characterId: string, payload: unknown): void;
    emitStopped(characterId: string, payload: unknown): void;
    emitError(characterId: string, message: string): void;
    private emitRealtimeEventToCharacter;
    private emitToCharacter;
    private shouldSuppressDuplicateInactiveStatus;
    private isInactiveAutoCombatStatusPayload;
    private clearInactiveStatusCache;
    private getPayloadSignature;
    private getPayloadType;
    private extractToken;
    private normalizeBearerToken;
    private normalizeId;
    private getUserRoom;
    private getCharacterRoom;
}
export {};
