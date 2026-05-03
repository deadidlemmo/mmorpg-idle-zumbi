import { io, type Socket } from 'socket.io-client';
import type {
  AutoCombatRealtimeActor,
  AutoCombatRealtimeEvent,
  AutoCombatRealtimeEventType,
  AutoCombatRealtimeTarget,
  AutoCombatStatusResponse,
} from '../../features/auto-combat/types/auto-combat.types';
import { getAuthToken } from '../api/authToken';

export type {
  AutoCombatRealtimeActor,
  AutoCombatRealtimeEvent,
  AutoCombatRealtimeEventType,
  AutoCombatRealtimeTarget
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

  'auto-combat:connected': (payload: AutoCombatConnectedPayload) => void;
  'auto-combat:joined': (payload: AutoCombatJoinedPayload) => void;
  'auto-combat:left': (payload: AutoCombatLeftPayload) => void;
  'auto-combat:error': (payload: AutoCombatSocketError) => void;

  'auto-combat:status': (payload: AutoCombatStatusResponse) => void;
  'auto-combat:session-updated': (payload: AutoCombatStatusResponse) => void;
  'auto-combat:finished': (payload: AutoCombatStatusResponse) => void;
  'auto-combat:stopped': (payload: AutoCombatStatusResponse) => void;

  'auto-combat:event': (payload: AutoCombatRealtimeEvent) => void;

  'auto-combat:mob-spawned': (payload: AutoCombatRealtimeEvent) => void;
  'auto-combat:hit': (payload: AutoCombatRealtimeEvent) => void;
  'auto-combat:dodge': (payload: AutoCombatRealtimeEvent) => void;
  'auto-combat:mob-defeated': (payload: AutoCombatRealtimeEvent) => void;
  'auto-combat:player-defeated': (payload: AutoCombatRealtimeEvent) => void;
  'auto-combat:potion-used': (payload: AutoCombatRealtimeEvent) => void;
};

export type AutoCombatClientToServerEvents = {
  'auto-combat:join': (payload: { characterId: string }) => void;
  'auto-combat:leave': (payload: { characterId: string }) => void;
};

export type AutoCombatSocket = Socket<
  AutoCombatServerToClientEvents,
  AutoCombatClientToServerEvents
>;

const DEFAULT_API_BASE_URL = 'http://localhost:3000';
const AUTO_COMBAT_NAMESPACE = '/auto-combat';

function normalizeSocketBaseUrl(url: unknown) {
  const rawUrl = String(url || DEFAULT_API_BASE_URL).trim();

  const normalizedUrl = rawUrl
    .replace(/\/+$/, '')
    .replace(/\/api$/i, '')
    .replace(/\/auto-combat$/i, '');

  return normalizedUrl || DEFAULT_API_BASE_URL;
}

const apiBaseUrl = normalizeSocketBaseUrl(
  import.meta.env.VITE_API_URL ?? DEFAULT_API_BASE_URL,
);

const socketBaseUrl = normalizeSocketBaseUrl(
  import.meta.env.VITE_SOCKET_URL ?? apiBaseUrl,
);

const autoCombatSocketUrl = `${socketBaseUrl}${AUTO_COMBAT_NAMESPACE}`;

let autoCombatSocket: AutoCombatSocket | null = null;

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

  autoCombatSocket = io<
    AutoCombatServerToClientEvents,
    AutoCombatClientToServerEvents
  >(autoCombatSocketUrl, {
    autoConnect: false,
    transports: ['websocket', 'polling'],
    withCredentials: true,
    auth: buildSocketAuth(),

    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 800,
    reconnectionDelayMax: 4000,

    timeout: 10000,

    forceNew: false,
    multiplex: true,
  });

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