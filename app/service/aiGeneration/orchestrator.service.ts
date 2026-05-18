import type { Prisma } from "@/app/generated/prisma/client";
import {
  AiGenerationJobStatus,
  AiGenerationMode,
  AiMessageStatus,
} from "@/app/generated/prisma/enums";
import { HttpError, isHttpError } from "@/app/lib/httpError";
import { prisma } from "@/app/lib/prisma";
import type {
  ChatMessage,
  ChatToolCall,
  TokenUsage,
} from "@/app/service/aiModel/adapter/types";
import * as AiModelService from "@/app/service/aiModel/model.service";
import { isJobCanceledSignal } from "./abort";
import type { ResolvedGenerationContext } from "./contextResolver.service";
import { truncateMessages } from "./historyWindow.service";
import * as MessageService from "./message.service";
import { buildMessages } from "./promptBuilder.service";
import type { SseEvent } from "./stream/events";
import {
  executeAgentTool,
  listAgentToolDefinitions,
  serializeAgentToolResult,
} from "./tools/registry";
import type { CreateGenerationInput } from "./types";

interface OrchestratorContext {
  userId: number;
  jobId: number;
  conversationId: number;
  pendingAssistantMessageId: number;
  modelId: number;
  maxIterations: number;
  systemPrompt: string | null;
  input: CreateGenerationInput;
  resolvedContext: ResolvedGenerationContext;
  excludeLastActiveMessage?: boolean;
  includeUserPrompt?: boolean;
  signal?: AbortSignal;
}

interface TurnState {
  content: string;
  usage?: TokenUsage;
  toolCalls: Map<string, ChatToolCall>;
}

interface ExecutionResult {
  messageId: number;
  content: string;
  usage?: TokenUsage;
  jobUsage?: TokenUsage;
  toolCalls?: ChatToolCall[];
}

function toChatHistory(
  messages: Awaited<ReturnType<typeof MessageService.listActiveChain>>,
): ChatMessage[] {
  return messages.map((message) => ({
    role: message.role.toLowerCase() as ChatMessage["role"],
    content: message.content,
    ...(message.toolCallId ? { toolCallId: message.toolCallId } : {}),
    ...(Array.isArray(message.toolCalls)
      ? { toolCalls: message.toolCalls as ChatToolCall[] }
      : {}),
  }));
}

function mergeUsage(
  left: TokenUsage | undefined,
  right: TokenUsage | undefined,
): TokenUsage | undefined {
  if (!left) return right;
  if (!right) return left;
  return {
    prompt: left.prompt + right.prompt,
    completion: left.completion + right.completion,
    total: left.total + right.total,
    extra: { left: left.extra, right: right.extra },
  };
}

function ensureNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted)
    throw new HttpError("客户端已断开", 499, "CLIENT_DISCONNECTED");
}

function emptyTurn(): TurnState {
  return { content: "", toolCalls: new Map() };
}

function addToolCall(state: TurnState, toolCall: ChatToolCall): void {
  state.toolCalls.set(toolCall.id, toolCall);
}

async function buildInitialMessages(
  context: OrchestratorContext,
): Promise<ChatMessage[]> {
  const history = await MessageService.listActiveChain(context.conversationId);
  const chatHistory = toChatHistory(history);
  return buildMessages({
    systemPrompt: context.systemPrompt,
    context: context.resolvedContext,
    history: context.excludeLastActiveMessage
      ? chatHistory.slice(0, -1)
      : chatHistory,
    userPrompt:
      context.includeUserPrompt === false
        ? null
        : context.resolvedContext.renderedPrompt,
  });
}

async function* invokeModelTurn(
  context: OrchestratorContext,
  messageId: number,
  messages: ChatMessage[],
  tools: ReturnType<typeof listAgentToolDefinitions> | undefined,
  state: TurnState,
): AsyncIterable<SseEvent> {
  ensureNotAborted(context.signal);
  for await (const event of AiModelService.invokeChat(context.modelId, {
    messages: truncateMessages(messages, 48_000),
    tools,
    temperature: context.input.temperature,
    signal: context.signal,
  })) {
    ensureNotAborted(context.signal);
    if (event.type === "delta") {
      state.content += event.text;
      yield {
        event: "message.delta",
        data: { jobId: context.jobId, messageId, delta: event.text },
      };
    }
    if (event.type === "tool_call") {
      addToolCall(state, event.toolCall);
    }
    if (event.type === "completed") {
      if (event.text && !state.content) state.content = event.text;
      state.usage = mergeUsage(state.usage, event.usage);
      for (const toolCall of event.toolCalls ?? [])
        addToolCall(state, toolCall);
    }
    if (event.type === "error") {
      throw new Error(`${event.errorCode}: ${event.message}`);
    }
  }
}

async function runStandard(
  context: OrchestratorContext,
  messages: ChatMessage[],
): Promise<ExecutionResult & { events: SseEvent[] }> {
  const turn = emptyTurn();
  const events: SseEvent[] = [];
  for await (const event of invokeModelTurn(
    context,
    context.pendingAssistantMessageId,
    messages,
    undefined,
    turn,
  ))
    events.push(event);
  return {
    messageId: context.pendingAssistantMessageId,
    content: turn.content,
    usage: turn.usage,
    jobUsage: turn.usage,
    events,
  };
}

async function runAgentTurn(
  context: OrchestratorContext,
  messageId: number,
  messages: ChatMessage[],
  tools: ReturnType<typeof listAgentToolDefinitions>,
): Promise<{ turn: TurnState; events: SseEvent[] }> {
  const turn = emptyTurn();
  const events: SseEvent[] = [];
  for await (const event of invokeModelTurn(
    context,
    messageId,
    messages,
    tools,
    turn,
  ))
    events.push(event);
  return { turn, events };
}

async function* executeStandard(
  context: OrchestratorContext,
  messages: ChatMessage[],
): AsyncIterable<SseEvent> {
  const result = await runStandard(context, messages);
  for (const event of result.events) yield event;
  yield* finishSuccessfulExecution(context, result);
}

async function* executeAgent(
  context: OrchestratorContext,
  initialMessages: ChatMessage[],
): AsyncIterable<SseEvent> {
  const tools = listAgentToolDefinitions();
  const maxIterations = context.maxIterations;
  const messages = [...initialMessages];
  let aggregateUsage: TokenUsage | undefined;
  let currentAssistantMessageId = context.pendingAssistantMessageId;

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    ensureNotAborted(context.signal);
    const { turn, events } = await runAgentTurn(
      context,
      currentAssistantMessageId,
      messages,
      tools,
    );
    for (const event of events) yield event;

    aggregateUsage = mergeUsage(aggregateUsage, turn.usage);
    const toolCalls = [...turn.toolCalls.values()];

    if (!toolCalls.length) {
      await prisma.aiGenerationJob.update({
        where: { id: context.jobId },
        data: { iterationCount: iteration },
      });
      yield* finishSuccessfulExecution(context, {
        messageId: currentAssistantMessageId,
        content: turn.content,
        usage: turn.usage,
        jobUsage: aggregateUsage,
      });
      return;
    }

    await MessageService.finalizeMessage(currentAssistantMessageId, {
      content: turn.content,
      status: AiMessageStatus.ACTIVE,
      tokenUsage: turn.usage,
      toolCalls,
    });

    messages.push({ role: "assistant", content: turn.content, toolCalls });
    let nextParentMessageId = currentAssistantMessageId;

    for (const toolCall of toolCalls) {
      ensureNotAborted(context.signal);
      yield {
        event: "tool.call",
        data: {
          jobId: context.jobId,
          toolCallId: toolCall.id,
          name: toolCall.name,
          arguments: toolCall.arguments,
        },
      };

      const result = await executeToolAsResult(context, toolCall);
      const resultText = serializeAgentToolResult(result);
      const toolMessage = await MessageService.appendToolMessage(
        context.conversationId,
        currentAssistantMessageId,
        context.jobId,
        toolCall.id,
        toolCall.name,
        resultText,
      );
      nextParentMessageId = toolMessage.id;
      messages.push({
        role: "tool",
        content: resultText,
        toolCallId: toolCall.id,
      });
      yield {
        event: "tool.result",
        data: {
          jobId: context.jobId,
          toolCallId: toolCall.id,
          name: toolCall.name,
          result,
        },
      };
    }

    await prisma.aiGenerationJob.update({
      where: { id: context.jobId },
      data: { iterationCount: iteration },
    });
    yield {
      event: "job.iteration",
      data: { jobId: context.jobId, iteration, maxIterations },
    };

    const nextAssistant = await MessageService.appendPendingAssistant(
      context.conversationId,
      nextParentMessageId,
      context.jobId,
      context.modelId,
    );
    currentAssistantMessageId = nextAssistant.id;
  }

  throw new HttpError(
    "Agent 工具循环超过最大轮数",
    500,
    "AGENT_ITERATION_EXCEEDED",
  );
}

async function executeToolAsResult(
  context: OrchestratorContext,
  toolCall: ChatToolCall,
): Promise<unknown> {
  try {
    return await executeAgentTool(
      { userId: context.userId, signal: context.signal },
      toolCall.name,
      toolCall.arguments,
    );
  } catch (error) {
    if (context.signal?.aborted) throw error;
    if (isHttpError(error)) {
      return { ok: false, errorCode: error.errorCode, message: error.message };
    }
    return {
      ok: false,
      errorCode: "TOOL_EXECUTION_FAILED",
      message: (error as Error).message,
    };
  }
}

async function* finishSuccessfulExecution(
  context: OrchestratorContext,
  result: ExecutionResult,
): AsyncIterable<SseEvent> {
  await MessageService.finalizeMessage(result.messageId, {
    content: result.content,
    status: AiMessageStatus.ACTIVE,
    tokenUsage: result.usage,
    toolCalls: result.toolCalls,
  });
  await prisma.aiGenerationJob.update({
    where: { id: context.jobId },
    data: {
      status: AiGenerationJobStatus.SUCCEEDED,
      tokenUsage: result.jobUsage as Prisma.InputJsonValue | undefined,
      finishedAt: new Date(),
    },
  });

  yield {
    event: "message.completed",
    data: {
      jobId: context.jobId,
      messageId: result.messageId,
      content: result.content,
      usage: result.usage,
      toolCalls: result.toolCalls,
    },
  };
  yield { event: "job.succeeded", data: { jobId: context.jobId } };
}

function toFailure(
  error: unknown,
  signal?: AbortSignal,
): { code: string; message: string } {
  if (signal?.aborted)
    return { code: "CLIENT_DISCONNECTED", message: "客户端已断开" };
  if (isHttpError(error))
    return { code: error.errorCode, message: error.message };
  return { code: "GENERATION_FAILED", message: (error as Error).message };
}

/** 执行一次文本生成并输出 SSE 事件。 */
export async function* execute(
  context: OrchestratorContext,
): AsyncIterable<SseEvent> {
  yield {
    event: "job.created",
    data: { jobId: context.jobId, conversationId: context.conversationId },
  };

  try {
    ensureNotAborted(context.signal);
    await prisma.aiGenerationJob.update({
      where: { id: context.jobId },
      data: { status: AiGenerationJobStatus.RUNNING, startedAt: new Date() },
    });

    const messages = await buildInitialMessages(context);
    if (
      (context.input.mode ?? AiGenerationMode.STANDARD) ===
      AiGenerationMode.AGENT
    ) {
      yield* executeAgent(context, messages);
      return;
    }
    yield* executeStandard(context, messages);
  } catch (error) {
    if (isJobCanceledSignal(context.signal)) {
      yield { event: "job.canceled", data: { jobId: context.jobId } };
      return;
    }
    const failure = toFailure(error, context.signal);
    await MessageService.failPendingMessages(context.jobId, failure.message);
    await prisma.aiGenerationJob.update({
      where: { id: context.jobId },
      data: {
        status: AiGenerationJobStatus.FAILED,
        errorCode: failure.code,
        errorMessage: failure.message.slice(0, 500),
        finishedAt: new Date(),
      },
    });
    yield {
      event: "job.failed",
      data: {
        jobId: context.jobId,
        errorCode: failure.code,
        message: failure.message,
      },
    };
  }
}
