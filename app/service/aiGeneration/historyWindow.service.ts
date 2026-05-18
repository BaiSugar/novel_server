import type { ChatMessage } from "@/app/service/aiModel/adapter/types";

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
  let used = 0;
  const result: ChatMessage[] = [];
  for (const message of [...messages].reverse()) {
    const size = message.content.length;
    if (used + size > maxChars && result.length > 0) break;
    used += size;
    result.push(message);
  }
  return result.reverse();
}
