import type { GeneralChatMessage } from "../types/chat.types";

export function mergeChatMessages(
  current: GeneralChatMessage[],
  incoming: GeneralChatMessage[],
) {
  const byId = new Map<string, GeneralChatMessage>();

  for (const message of [...current, ...incoming]) {
    byId.set(message.id, message);
  }

  return [...byId.values()].sort((left, right) => {
    const dateDifference =
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();

    return dateDifference || left.id.localeCompare(right.id);
  });
}
