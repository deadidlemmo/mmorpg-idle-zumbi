import { io, type Socket } from "socket.io-client";
import type {
  AutoCombatRealtimeActor,
  AutoCombatRealtimeEvent,
  AutoCombatRealtimeEventType,
  AutoCombatRealtimeTarget,
  AutoCombatStatusResponse,
} from "../../features/auto-combat/types/auto-combat.types";
import type { WorldBossStatusResponse } from "../../features/world-bosses/types/world-bosses.types";
import { getAuthToken } from "../api/authToken";

export type {
  AutoCombatRealtimeActor,
  AutoCombatRealtimeEvent,
  AutoCombatRealtimeEventType,
  AutoCombatRealtimeTarget,
};

export type AutoCombatSocketError = {
  message: string;
  error?: string;
  statusCode?: number;
};

export type AutoCombatConnectedPayload = {
  socketId: string;
  userId: string;
};

export type AutoCombatJoinedPayload = {
  characterId: string;
  characterName?: string;
  room: string;
};

export type AutoCombatLeftPayload = {
  characterId: string;
  room: string;
};

export type AutoCombatServerToClientEvents = {
  connect: () => void;
  disconnect: (reason: string) => void;
  connect_error: (error: Error) => void;

  exception: (payload: AutoCombatSocketError) => void;

  "auto-combat:connected": (payload: AutoCombatConnectedPayload) => void;
  "auto-combat:joined": (payload: AutoCombatJoinedPayload) => void;
  "auto-combat:left": (payload: AutoCombatLeftPayload) => void;
  "auto-combat:error": (payload: AutoCombatSocketError) => void;

  "auto-combat:status": (payload: AutoCombatStatusResponse) => void;
  "auto-combat:session-updated": (payload: AutoCombatStatusResponse) => void;
  "auto-combat:finished": (payload: AutoCombatStatusResponse) => void;
  "auto-combat:stopped": (payload: AutoCombatStatusResponse) => void;

  "auto-combat:event": (payload: AutoCombatRealtimeEvent) => void;

  "auto-combat:mob-spawned": (payload: AutoCombatRealtimeEvent) => void;
  "auto-combat:hit": (payload: AutoCombatRealtimeEvent) => void;
  "auto-combat:dodge": (payload: AutoCombatRealtimeEvent) => void;
  "auto-combat:mob-defeated": (payload: AutoCombatRealtimeEvent) => void;
  "auto-combat:player-defeated": (payload: AutoCombatRealtimeEvent) => void;
  "auto-combat:potion-used": (payload: AutoCombatRealtimeEvent) => void;
};

export type AutoCombatClientToServerEvents = {
  "auto-combat:join": (payload: { characterId: string }) => void;
  "auto-combat:leave": (payload: { characterId: string }) => void;
};

export type AutoCombatSocket = Socket<
  AutoCombatServerToClientEvents,
  AutoCombatClientToServerEvents
>;

const DEFAULT_API_BASE_URL = "http://localhost:3000";
const AUTO_COMBAT_NAMESPACE = "/auto-combat";
const WORLD_BOSSES_NAMESPACE = "/world-bosses";

function normalizeSocketBaseUrl(url: unknown) {
  const rawUrl = String(url || DEFAULT_API_BASE_URL).trim();

  const normalizedUrl = rawUrl
    .replace(/\/+$/, "")
    .replace(/\/api$/i, "")
    .replace(/\/auto-combat$/i, "");

  return normalizedUrl || DEFAULT_API_BASE_URL;
}

const apiBaseUrl = normalizeSocketBaseUrl(
  import.meta.env.VITE_API_URL ?? DEFAULT_API_BASE_URL,
);

const socketBaseUrl = normalizeSocketBaseUrl(
  import.meta.env.VITE_SOCKET_URL ?? apiBaseUrl,
);

const autoCombatSocketUrl = `${socketBaseUrl}${AUTO_COMBAT_NAMESPACE}`;
const worldBossesSocketUrl = `${socketBaseUrl}${WORLD_BOSSES_NAMESPACE}`;

let autoCombatSocket: AutoCombatSocket | null = null;

export type WorldBossSocketError = {
  message: string;
  error?: string;
  statusCode?: number;
};
export type WorldBossSocketRoomPayload = { eventId: string; room: string };
export type WorldBossServerToClientEvents = {
  connect: () => void;
  disconnect: (reason: string) => void;
  connect_error: (error: Error) => void;
  exception: (payload: WorldBossSocketError) => void;
  "worldBoss:connected": (payload: {
    socketId: string;
    userId: string;
  }) => void;
  "worldBoss:joinedRoom": (payload: WorldBossSocketRoomPayload) => void;
  "worldBoss:leftRoom": (payload: WorldBossSocketRoomPayload) => void;
  "worldBoss:error": (payload: WorldBossSocketError) => void;
  "worldBoss:lobbyOpened": (payload: WorldBossStatusResponse) => void;
  "worldBoss:joinedLobby": (payload: WorldBossStatusResponse) => void;
  "worldBoss:leftLobby": (payload: WorldBossStatusResponse) => void;
  "worldBoss:lobbyUpdated": (payload: WorldBossStatusResponse) => void;
  "worldBoss:battleStarted": (payload: WorldBossStatusResponse) => void;
  "worldBoss:damage": (payload: WorldBossStatusResponse) => void;
  "worldBoss:progress": (payload: WorldBossStatusResponse) => void;
  "worldBoss:defeated": (payload: WorldBossStatusResponse) => void;
  "worldBoss:expired": (payload: WorldBossStatusResponse) => void;
  "worldBoss:rewarded": (payload: WorldBossStatusResponse) => void;
  "worldBoss:left": (payload: WorldBossStatusResponse) => void;
};
export type WorldBossClientToServerEvents = {
  "worldBoss:join": (payload: { eventId: string }) => void;
  "worldBoss:leave": (payload: { eventId: string }) => void;
};
export type WorldBossSocket = Socket<
  WorldBossServerToClientEvents,
  WorldBossClientToServerEvents
>;
let worldBossSocket: WorldBossSocket | null = null;

function buildSocketAuth(): Record<string, string> {
  const token = getAuthToken();

  if (!token) {
    return {};
  }

  return {
    token,
  };
}

export function getAutoCombatSocketUrl() {
  return autoCombatSocketUrl;
}

export function getAutoCombatSocket(): AutoCombatSocket {
  if (autoCombatSocket) {
    return autoCombatSocket;
  }

  /**
   * Importante:
   * Algumas versões do socket.io-client não aceitam generics diretamente no io().
   * Por isso tipamos o retorno via cast seguro.
   */
  autoCombatSocket = io(autoCombatSocketUrl, {
    autoConnect: false,
    transports: ["websocket", "polling"],
    withCredentials: true,
    auth: buildSocketAuth(),

    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 800,
    reconnectionDelayMax: 4000,

    timeout: 10000,

    forceNew: false,
    multiplex: true,
  }) as unknown as AutoCombatSocket;

  return autoCombatSocket;
}

export function refreshAutoCombatSocketAuth() {
  const socket = getAutoCombatSocket();

  socket.auth = buildSocketAuth();

  return socket;
}

/**
 * Retorna o socket já com auth atualizada.
 *
 * Importante:
 * - Esta função NÃO chama socket.connect() automaticamente.
 * - O hook useAutoCombatSocket adiciona os listeners antes de conectar.
 * - Isso evita perder eventos iniciais como auto-combat:connected.
 */
export function connectAutoCombatSocket(): AutoCombatSocket {
  return refreshAutoCombatSocketAuth();
}

export function disconnectAutoCombatSocket() {
  if (!autoCombatSocket) {
    return;
  }

  autoCombatSocket.removeAllListeners();
  autoCombatSocket.disconnect();
  autoCombatSocket = null;
}

export function reconnectAutoCombatSocket(): AutoCombatSocket {
  const socket = refreshAutoCombatSocketAuth();

  if (socket.connected) {
    socket.disconnect();
  }

  socket.connect();

  return socket;
}

export function getWorldBossesSocketUrl() {
  return worldBossesSocketUrl;
}

export function getWorldBossSocket(): WorldBossSocket {
  if (worldBossSocket) return worldBossSocket;

  worldBossSocket = io(worldBossesSocketUrl, {
    autoConnect: false,
    transports: ["websocket", "polling"],
    withCredentials: true,
    auth: buildSocketAuth(),
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 800,
    reconnectionDelayMax: 4000,
    timeout: 10000,
    forceNew: false,
    multiplex: true,
  }) as unknown as WorldBossSocket;

  return worldBossSocket;
}

export function refreshWorldBossSocketAuth() {
  const socket = getWorldBossSocket();
  socket.auth = buildSocketAuth();
  return socket;
}

export function connectWorldBossSocket(): WorldBossSocket {
  return refreshWorldBossSocketAuth();
}

export function disconnectWorldBossSocket() {
  if (!worldBossSocket) return;
  worldBossSocket.removeAllListeners();
  worldBossSocket.disconnect();
  worldBossSocket = null;
}
