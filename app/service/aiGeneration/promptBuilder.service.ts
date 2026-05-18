import type { ChatMessage } from "@/app/service/aiModel/adapter/types";
import type { ResolvedGenerationContext } from "./contextResolver.service";

export interface BuildMessagesInput {
  systemPrompt?: string | null;
  context: ResolvedGenerationContext;
  history?: ChatMessage[];
  userPrompt?: string | null;
}

const STATIC_SYSTEM_PROMPT = [
  "你是 AI 网文创作助手，负责根据用户提示词、预输入和作品上下文生成可直接用于创作的内容。",
  "输出应聚焦创作结果，不解释内部推理过程。",
  "如果上下文不足，优先基于现有信息合理补全，不要编造平台不存在的事实。",
].join("\n");

/**
 * 组装聊天消息。静态系统提示词与动态作品上下文分离，便于后续按 Provider 做 prompt cache。
 * @param input 构建参数。
 * @returns 上游聊天消息数组。
 */
export function buildMessages(input: BuildMessagesInput): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: "system", content: STATIC_SYSTEM_PROMPT },
  ];
  if (input.systemPrompt) {
    messages.push({ role: "system", content: input.systemPrompt });
  }
  messages.push({ role: "system", content: input.context.contextText });
  if (input.history?.length) messages.push(...input.history);
  if (input.userPrompt)
    messages.push({ role: "user", content: input.userPrompt });
  return messages;
}
