export interface GeneralChatMessage {
  id: string;
  content: string;
  createdAt: string;
  character: {
    id: string;
    name: string;
    level: number;
    avatarKey?: string | null;
    className: string;
  };
}

export interface GeneralChatHistoryResponse {
  messages: GeneralChatMessage[];
  nextCursor: string | null;
  serverNow: string;
}

export interface ChatSocketError {
  message: string;
}

export type ChatSendResponse =
  | { ok: true; message: GeneralChatMessage }
  | { ok: false; error: string };
