import type { ChatMessage } from "@/app/service/aiModel/adapter/types";

function messageSize(message: ChatMessage): number {
  return (
    message.content.length +
    (message.reasoningContent?.length ?? 0) +
    JSON.stringify(message.toolCalls ?? "").length
  );
}

type MessageBlock = {
  indexes: number[];
  size: number;
};

function buildNonSystemBlocks(messages: ChatMessage[]): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    if (!message || message.role === "system") continue;

    if (message.role === "tool") {
      continue;
    }

    if (message.role === "assistant" && message.toolCalls?.length) {
      const pendingToolCallIds = new Set(
        message.toolCalls.map((toolCall) => toolCall.id),
      );
      const indexes = [index];
      let cursor = index + 1;
      while (messages[cursor]?.role === "tool") {
        const toolMessage = messages[cursor];
        if (
          !toolMessage?.toolCallId ||
          !pendingToolCallIds.delete(toolMessage.toolCallId)
        ) {
          break;
        }
        indexes.push(cursor);
        cursor += 1;
      }
      if (!pendingToolCallIds.size) {
        blocks.push({
          indexes,
          size: indexes.reduce(
            (total, itemIndex) => total + messageSize(messages[itemIndex]!),
            0,
          ),
        });
      }
      index = cursor - 1;
      continue;
    }

    blocks.push({ indexes: [index], size: messageSize(message) });
  }
  return blocks;
}

/**
 * 对历史消息做轻量窗口裁剪。MVP 用字符数近似 token 预算，后续可接摘要压缩。
 * @param messages 消息数组。
 * @param maxChars 最大字符数。
 * @returns 裁剪后的消息数组。
 */
export function truncateMessages(
  messages: ChatMessage[],
  maxChars: number,
): ChatMessage[] {
  const keptIndexes = new Set<number>();
  let used = 0;

  messages.forEach((message, index) => {
    if (message.role !== "system") return;
    keptIndexes.add(index);
    used += messageSize(message);
  });

  let keptNonSystem = false;
  const blocks = buildNonSystemBlocks(messages);
  for (let index = blocks.length - 1; index >= 0; index--) {
    const block = blocks[index];
    if (!block) continue;
    if (used + block.size > maxChars && keptNonSystem) break;
    for (const messageIndex of block.indexes) keptIndexes.add(messageIndex);
    used += block.size;
    keptNonSystem = true;
  }

  return messages.filter((_message, index) => keptIndexes.has(index));
}
