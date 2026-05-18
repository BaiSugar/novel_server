import type { Prisma } from "@/app/generated/prisma/client";
import {
  AiGenerationJobStatus,
  AiMessageStatus,
} from "@/app/generated/prisma/enums";
import { HttpError } from "@/app/lib/httpError";
import { prisma } from "@/app/lib/prisma";
import {
  abortGenerationJob,
  clearGenerationJobAbort,
  registerGenerationJobAbort,
} from "./abort";
import { resolveGenerationContext } from "./contextResolver.service";
import {
  create as createConversation,
  ensureOwned,
} from "./conversation.service";
import * as MessageService from "./message.service";
import { execute } from "./orchestrator.service";
import type { SseEvent } from "./stream/events";
import { getUserModelState } from "@/app/service/aiModel/model.service";
import type {
  AiGenerationJobItem,
  CreateGenerationInput,
  RetryGenerationInput,
} from "./types";

const DEFAULT_MAX_ITERATIONS = 8;

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function mapJob(row: {
  id: number;
  conversationId: number;
  userId: number;
  mode: AiGenerationJobItem["mode"];
  modelId: number;
  status: string;
  anchorMessageId: number | null;
  retryTargetId: number | null;
  clientRequestId: string | null;
  iterationCount: number;
  maxIterations: number;
  errorCode: string | null;
  errorMessage: string | null;
  tokenUsage: unknown | null;
  contextItemIds: unknown | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): AiGenerationJobItem {
  return {
    id: row.id,
    conversationId: row.conversationId,
    userId: row.userId,
    mode: row.mode,
    modelId: row.modelId,
    status: row.status,
    anchorMessageId: row.anchorMessageId,
    retryTargetId: row.retryTargetId,
    clientRequestId: row.clientRequestId,
    iterationCount: row.iterationCount,
    maxIterations: row.maxIterations,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    tokenUsage: row.tokenUsage,
    startedAt: toIso(row.startedAt),
    finishedAt: toIso(row.finishedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function lastActiveMessageId(
  conversationId: number,
): Promise<number | null> {
  const row = await prisma.aiMessage.findFirst({
    where: { conversationId, status: AiMessageStatus.ACTIVE },
    select: { id: true },
    orderBy: [{ seq: "desc" }, { id: "desc" }],
  });
  return row?.id ?? null;
}

async function* withGenerationAbortCleanup(
  jobId: number,
  stream: AsyncIterable<SseEvent>,
): AsyncIterable<SseEvent> {
  try {
    yield* stream;
  } finally {
    clearGenerationJobAbort(jobId);
  }
}

function resolveExecutionMetadata(
  input: CreateGenerationInput,
  conversationMetadata: unknown,
): CreateGenerationInput["metadata"] {
  return (
    input.metadata ??
    (conversationMetadata as CreateGenerationInput["metadata"])
  );
}

function normalizeContextItemIds(
  ids: CreateGenerationInput["contextItemIds"],
): number[] | undefined {
  if (!ids?.length) return undefined;
  const normalized = ids.map((id) => Number(id));
  if (normalized.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new HttpError("contextItemIds 不合法", 422);
  }
  return [...new Set(normalized)];
}

function toContextItemIdsJson(
  ids: number[] | undefined,
): Prisma.InputJsonValue | undefined {
  return ids?.length ? ids : undefined;
}

function fromContextItemIdsJson(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = value
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
  return ids.length ? [...new Set(ids)] : undefined;
}

function stripPromptTemplateId(
  metadata: CreateGenerationInput["metadata"],
): CreateGenerationInput["metadata"] {
  if (!metadata) return undefined;
  return {
    novelId: metadata.novelId,
    chapterId: metadata.chapterId,
    scene: metadata.scene,
  };
}

/** 创建文本生成任务并返回 SSE 事件流。 */
export async function createAndStart(
  userId: number,
  input: CreateGenerationInput,
  signal?: AbortSignal,
): Promise<{ job: AiGenerationJobItem; stream: AsyncIterable<SseEvent> }> {
  const conversation = input.conversationId
    ? await ensureOwned(userId, input.conversationId)
    : await createConversation(userId, {
        mode: input.mode,
        modelId: input.modelId,
        metadata: input.metadata ?? null,
      });
  const conversationId = conversation.id;
  const mode = input.mode;
  const modelId = input.modelId;
  const metadata = resolveExecutionMetadata(input, conversation.metadata);
  const contextItemIds = normalizeContextItemIds(input.contextItemIds);
  const promptTemplateIds = input.promptTemplateIds ?? (metadata?.promptTemplateId ? [metadata.promptTemplateId] : undefined);
  const resolvedContext = await resolveGenerationContext(userId, {
    userMessage: input.userMessage,
    promptTemplateIds,
    promptInputs: input.promptInputs,
    metadata,
    contextItemIds,
  });
  const executionInput: CreateGenerationInput = {
    ...input,
    conversationId,
    userMessage: resolvedContext.renderedPrompt,
    mode,
    modelId,
    metadata,
    contextItemIds,
    // 未传 temperature 时，读取用户保存的模型状态
    temperature:
      input.temperature ??
      (await getUserModelState(userId).then((s) => s?.temperature ?? undefined)),
  };
  const parentMessageId = await lastActiveMessageId(conversationId);
  const userMessage = await MessageService.appendUserMessage(
    conversationId,
    parentMessageId,
    resolvedContext.renderedPrompt,
  );
  const jobRow = await prisma.aiGenerationJob.create({
    data: {
      conversationId,
      userId,
      mode,
      modelId,
      anchorMessageId: userMessage.id,
      maxIterations: DEFAULT_MAX_ITERATIONS,
      contextItemIds: toContextItemIdsJson(contextItemIds),
    },
  });
  const assistant = await MessageService.appendPendingAssistant(
    conversationId,
    userMessage.id,
    jobRow.id,
    modelId,
  );
  const executionSignal = registerGenerationJobAbort(jobRow.id, signal);
  const job = mapJob(jobRow);
  return {
    job,
    stream: withGenerationAbortCleanup(
      jobRow.id,
      execute({
        userId,
        jobId: jobRow.id,
        conversationId,
        pendingAssistantMessageId: assistant.id,
        modelId,
        maxIterations: jobRow.maxIterations,
        systemPrompt: conversation.systemPrompt,
        input: executionInput,
        resolvedContext,
        excludeLastActiveMessage: true,
        signal: executionSignal,
      }),
    ),
  };
}

/** 对 assistant 消息重试。 */
export async function retry(
  userId: number,
  input: RetryGenerationInput,
  signal?: AbortSignal,
): Promise<{ job: AiGenerationJobItem; stream: AsyncIterable<SseEvent> }> {
  const target = await prisma.aiMessage.findFirst({
    where: { id: input.targetMessageId },
    include: { conversation: true, parent: true, job: true },
  });
  if (!target) throw new HttpError("重试目标消息不存在", 404);
  const conversation = await ensureOwned(userId, target.conversationId);

  const { parentMessageId } = await MessageService.supersedeSubtree(
    userId,
    target.conversationId,
    target.id,
  );
  const userMessage = target.parent?.content ?? "请重新生成上一条回复";
  const mode = target.job?.mode ?? conversation.mode;
  const modelId = target.modelId ?? conversation.modelId;
  const metadata = stripPromptTemplateId(
    conversation.metadata as CreateGenerationInput["metadata"],
  );
  const contextItemIds = fromContextItemIdsJson(target.job?.contextItemIds);
  const resolvedContext = await resolveGenerationContext(userId, {
    userMessage,
    metadata,
    contextItemIds,
  });
  const executionInput: CreateGenerationInput = {
    conversationId: target.conversationId,
    userMessage: resolvedContext.renderedPrompt,
    mode,
    modelId,
    metadata,
    contextItemIds,
  };
  const jobRow = await prisma.aiGenerationJob.create({
    data: {
      conversationId: target.conversationId,
      userId,
      mode,
      modelId,
      anchorMessageId: parentMessageId,
      retryTargetId: target.id,
      maxIterations: target.job?.maxIterations ?? DEFAULT_MAX_ITERATIONS,
      contextItemIds: toContextItemIdsJson(contextItemIds),
    },
  });
  const assistant = await MessageService.appendPendingAssistant(
    target.conversationId,
    parentMessageId,
    jobRow.id,
    modelId,
  );
  const executionSignal = registerGenerationJobAbort(jobRow.id, signal);
  const job = mapJob(jobRow);
  return {
    job,
    stream: withGenerationAbortCleanup(
      jobRow.id,
      execute({
        userId,
        jobId: jobRow.id,
        conversationId: target.conversationId,
        pendingAssistantMessageId: assistant.id,
        modelId,
        maxIterations: jobRow.maxIterations,
        systemPrompt: conversation.systemPrompt,
        input: executionInput,
        resolvedContext,
        includeUserPrompt: parentMessageId === null,
        signal: executionSignal,
      }),
    ),
  };
}

/** 取消文本生成任务。 */
export async function cancel(
  userId: number,
  jobId: number,
): Promise<AiGenerationJobItem> {
  const job = await prisma.aiGenerationJob.findUnique({ where: { id: jobId } });
  if (!job) throw new HttpError("生成任务不存在", 404);
  await ensureOwned(userId, job.conversationId);
  const activeStatuses: readonly string[] = [
    AiGenerationJobStatus.PENDING,
    AiGenerationJobStatus.RUNNING,
  ];
  if (!activeStatuses.includes(job.status)) {
    throw new HttpError("任务已结束，无法取消", 409);
  }
  abortGenerationJob(jobId);
  const row = await prisma.aiGenerationJob.update({
    where: { id: jobId },
    data: { status: AiGenerationJobStatus.CANCELED, finishedAt: new Date() },
  });
  await MessageService.failPendingMessages(jobId, "已取消");
  return mapJob(row);
}

/** 查询文本生成任务。 */
export async function detail(
  userId: number,
  jobId: number,
): Promise<AiGenerationJobItem> {
  const row = await prisma.aiGenerationJob.findUnique({ where: { id: jobId } });
  if (!row) throw new HttpError("生成任务不存在", 404);
  await ensureOwned(userId, row.conversationId);
  return mapJob(row);
}
