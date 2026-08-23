import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GeneralChatMessage } from "../types/chat.types";
import { mergeChatMessages } from "./chatMessages";

function createMessage(id: string, createdAt: string): GeneralChatMessage {
  return {
    id,
    content: `Mensagem ${id}`,
    createdAt,
    character: {
      id: "character-1",
      name: "Lutador",
      level: 1,
      className: "Lutador",
    },
  };
}

describe("mergeChatMessages", () => {
  it("deduplica mensagens e preserva a ordem cronológica", () => {
    const newer = createMessage("message-2", "2026-08-21T21:00:02.000Z");
    const older = createMessage("message-1", "2026-08-21T21:00:01.000Z");

    const merged = mergeChatMessages([newer], [older, newer]);

    assert.deepEqual(
      merged.map((message) => message.id),
      ["message-1", "message-2"],
    );
  });
});
