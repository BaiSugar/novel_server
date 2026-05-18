import type { ChatToolDefinition } from "@/app/service/aiModel/adapter/types";

/** AGENT 内部只读工具执行上下文。 */
export interface AgentToolContext {
  userId: number;
  signal?: AbortSignal;
}

/** AGENT 内部只读工具定义。 */
export interface AgentToolDefinition extends ChatToolDefinition {
  execute(
    context: AgentToolContext,
    input: Record<string, unknown>,
  ): Promise<unknown>;
}
