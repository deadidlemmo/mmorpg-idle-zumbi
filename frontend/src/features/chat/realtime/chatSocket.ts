import { io, type Socket } from "socket.io-client";
import { getAuthToken } from "../../../services/api/authToken";
import type {
  ChatSendResponse,
  ChatSocketError,
  GeneralChatMessage,
} from "../types/chat.types";

type ChatServerToClientEvents = {
  connect: () => void;
  disconnect: (reason: string) => void;
  connect_error: (error: Error) => void;
  "chat:connected": (payload: { socketId: string }) => void;
  "chat:joined": (payload: {
    room: string;
    characterId: string;
    characterName: string;
  }) => void;
  "chat:message:new": (message: GeneralChatMessage) => void;
  "chat:error": (error: ChatSocketError) => void;
};

type ChatClientToServerEvents = {
  "chat:join": (
    payload: { characterId: string },
    callback?: (response: { ok: boolean; error?: string }) => void,
  ) => void;
  "chat:message:send": (
    payload: { characterId: string; content: string },
    callback: (response: ChatSendResponse) => void,
  ) => void;
};

export type GeneralChatSocket = Socket<
  ChatServerToClientEvents,
  ChatClientToServerEvents
>;

const DEFAULT_API_BASE_URL = "http://localhost:3000";

function normalizeSocketBaseUrl(value: unknown) {
  const rawValue = String(value || DEFAULT_API_BASE_URL).trim();

  return (
    rawValue.replace(/\/+$/, "").replace(/\/api$/i, "") ||
    DEFAULT_API_BASE_URL
  );
}

export function createGeneralChatSocket(characterId: string) {
  const apiBaseUrl = normalizeSocketBaseUrl(
    import.meta.env.VITE_API_URL ?? DEFAULT_API_BASE_URL,
  );
  const socketBaseUrl = normalizeSocketBaseUrl(
    import.meta.env.VITE_SOCKET_URL ?? apiBaseUrl,
  );
  const token = getAuthToken();

  return io(`${socketBaseUrl}/chat`, {
    autoConnect: false,
    transports: ["websocket", "polling"],
    withCredentials: true,
    auth: token ? { token } : {},
    query: { characterId },
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 800,
    reconnectionDelayMax: 4_000,
    timeout: 10_000,
  }) as unknown as GeneralChatSocket;
}
