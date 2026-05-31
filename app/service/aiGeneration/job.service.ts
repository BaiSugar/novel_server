import type { Prisma } from "@/app/generated/prisma/client";
import {
  AiGenerationJobStatus,
  AiMessageStatus,
} from "@/app/generated/prisma/enums";
import { HttpError } from "@/app/lib/httpError";
import { prisma } from "@/app/lib/prisma";
import { getUserModelState } from "@/app/service/aiModel/model.service";
import {
  abortGenerationJob,
  clearGenerationJobAbort,
  registerGenerationJobAbort,
} from "./abort";
import {
  isEditorWritingActionScene,
  resolveGenerationContext,
} from "./contextResolver.service";
import {
  create as createConversation,
  ensureOwned,
} from "./conversation.service";
import { normalizeEditorDiffInput } from "./editorDiff.service";
import * as MessageService from "./message.service";
import { execute } from "./orchestrator.service";
import type { SseEvent } from "./stream/events";
import type {
  AiGenerationInputSnapshot,
  AiGenerationJobItem,
  AiMetadata,
  CreateGenerationInput,
  RetryGenerationInput,
} from "./types";

const DEFAULT_MAX_ITERATIONS = 64;

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

function activeMetadata(
  metadata: CreateGenerationInput["metadata"],
): AiMetadata | undefined {
  return metadata ?? undefined;
}

function resolveExecutionMetadata(
  input: CreateGenerationInput,
  conversationMetadata: unknown,
): AiMetadata | undefined {
  return activeMetadata(
    input.metadata ??
      stripEditorWritingActionScene(
        conversationMetadata as CreateGenerationInput["metadata"],
      ),
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

interface StoredGenerationJobModelInput {
  systemPromptText: string;
  renderedPrompt: string;
  contextText: string;
  finalUserPrompt: string;
  promptHash: string;
}

interface StoredGenerationJobEditorDiff {
  mode: "novel_multi_diff" | "chapter_auto_diff";
  documentId?: string;
  docVersion?: string;
  baseHash?: string;
  baseLength?: number;
  caretOffset?: number;
  cursorOffset?: number;
  selection?: { start: number; end: number };
}

interface StoredGenerationJobContext {
  clientInput?: AiGenerationInputSnapshot;
  contextItemIds?: number[];
  modelInput?: StoredGenerationJobModelInput;
  editorDiff?: StoredGenerationJobEditorDiff;
}

function toStoredGenerationJobEditorDiff(
  editorDiff: CreateGenerationInput["editorDiff"],
): StoredGenerationJobEditorDiff | undefined {
  if (!editorDiff) return undefined;
  if (editorDiff.mode === "chapter_auto_diff") {
    return { mode: editorDiff.mode };
  }
  return {
    mode: editorDiff.mode,
    ...(editorDiff.documentId ? { documentId: editorDiff.documentId } : {}),
    ...(editorDiff.docVersion ? { docVersion: editorDiff.docVersion } : {}),
    baseHash: editorDiff.baseHash,
    baseLength: editorDiff.baseText.length,
    caretOffset: editorDiff.caretOffset ?? editorDiff.cursorOffset ?? 0,
    ...(editorDiff.cursorOffset !== undefined
      ? { cursorOffset: editorDiff.cursorOffset }
      : {}),
    ...(editorDiff.selection ? { selection: editorDiff.selection } : {}),
  };
}

function toStoredGenerationJobContext(input: {
  clientInput?: AiGenerationInputSnapshot;
  contextItemIds?: number[];
  modelInput?: StoredGenerationJobModelInput;
  editorDiff?: StoredGenerationJobEditorDiff;
}): Prisma.InputJsonValue | undefined {
  const value: StoredGenerationJobContext = {
    ...(input.clientInput ? { clientInput: input.clientInput } : {}),
    ...(input.contextItemIds?.length
      ? { contextItemIds: input.contextItemIds }
      : {}),
    ...(input.modelInput ? { modelInput: input.modelInput } : {}),
    ...(input.editorDiff ? { editorDiff: input.editorDiff } : {}),
  };
  return Object.keys(value).length
    ? (value as unknown as Prisma.InputJsonValue)
    : undefined;
}

function fromContextItemIdsJson(value: unknown): number[] | undefined {
  const rawIds = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? (value as StoredGenerationJobContext).contextItemIds
      : undefined;
  if (!Array.isArray(rawIds)) return undefined;
  const ids = rawIds
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
  return ids.length ? [...new Set(ids)] : undefined;
}

function modelInputFromJobContext(
  value: unknown,
): StoredGenerationJobModelInput | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const modelInput = (value as StoredGenerationJobContext).modelInput;
  if (!modelInput || typeof modelInput !== "object") return undefined;
  const requiredFields: Array<keyof StoredGenerationJobModelInput> = [
    "systemPromptText",
    "renderedPrompt",
    "contextText",
    "finalUserPrompt",
    "promptHash",
  ];
  if (requiredFields.some((field) => typeof modelInput[field] !== "string")) {
    return undefined;
  }
  return modelInput;
}

function stripEditorWritingActionScene(
  metadata: CreateGenerationInput["metadata"],
): CreateGenerationInput["metadata"] {
  if (!metadata) return undefined;
  const scene =
    metadata.scene && !isEditorWritingActionScene(metadata.scene)
      ? metadata.scene
      : undefined;
  const stripped: NonNullable<CreateGenerationInput["metadata"]> = {
    ...(metadata.novelId !== undefined ? { novelId: metadata.novelId } : {}),
    ...(metadata.chapterId !== undefined
      ? { chapterId: metadata.chapterId }
      : {}),
    ...(metadata.promptTemplateId !== undefined
      ? { promptTemplateId: metadata.promptTemplateId }
      : {}),
    ...(scene !== undefined ? { scene } : {}),
  };
  return Object.keys(stripped).length ? stripped : undefined;
}

function stripPromptTemplateId(
  metadata: CreateGenerationInput["metadata"],
): CreateGenerationInput["metadata"] {
  if (!metadata) return undefined;
  const scene =
    metadata.scene && !isEditorWritingActionScene(metadata.scene)
      ? metadata.scene
      : undefined;
  return {
    ...(metadata.novelId !== undefined ? { novelId: metadata.novelId } : {}),
    ...(metadata.chapterId !== undefined
      ? { chapterId: metadata.chapterId }
      : {}),
    ...(scene !== undefined ? { scene } : {}),
  };
}

function modelInputFromResolvedContext(resolvedContext: {
  systemPromptText: string;
  renderedPrompt: string;
  contextText: string;
  finalUserPrompt: string;
  promptHash: string;
}): StoredGenerationJobModelInput {
  return {
    systemPromptText: resolvedContext.systemPromptText,
    renderedPrompt: resolvedContext.renderedPrompt,
    contextText: resolvedContext.contextText,
    finalUserPrompt: resolvedContext.finalUserPrompt,
    promptHash: resolvedContext.promptHash,
  };
}

function generationInputSnapshot(input: {
  conversationId: number;
  source: CreateGenerationInput;
  mode: CreateGenerationInput["mode"];
  modelId: number;
  promptTemplateIds?: number[];
  contextItemIds?: number[];
  metadata?: AiMetadata;
  editorDiff?: StoredGenerationJobEditorDiff;
  temperature?: number;
}): AiGenerationInputSnapshot {
  return {
    conversationId: input.conversationId,
    mode: input.mode,
    modelId: input.modelId,
    ...(input.source.userMessage !== undefined
      ? { userMessage: input.source.userMessage }
      : {}),
    ...(input.promptTemplateIds?.length
      ? { promptTemplateIds: input.promptTemplateIds }
      : {}),
    ...(input.source.promptInputs !== undefined
      ? { promptInputs: input.source.promptInputs }
      : {}),
    ...(input.contextItemIds?.length
      ? { contextItemIds: input.contextItemIds }
      : {}),
    ...(input.source.chapterIds?.length
      ? { chapterIds: input.source.chapterIds }
      : {}),
    ...(input.source.chapterSummaryIds?.length
      ? { chapterSummaryIds: input.source.chapterSummaryIds }
      : {}),
    ...(input.source.categoryContexts?.length
      ? { categoryContexts: input.source.categoryContexts }
      : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
    ...(input.editorDiff ? { editorDiff: input.editorDiff } : {}),
    ...(input.temperature !== undefined
      ? { temperature: input.temperature }
      : {}),
  };
}

function assertEditorWritingActionDoesNotUseDiff(
  input: CreateGenerationInput,
): void {
  const scene = input.metadata?.scene;
  if (!scene || !isEditorWritingActionScene(scene) || !input.editorDiff) return;
  throw new HttpError(
    "编辑器快捷写作场景不支持 editorDiff",
    422,
    "EDITOR_WRITING_ACTION_DIFF_UNSUPPORTED",
  );
}

function resolveDisplayUserMessage(input: CreateGenerationInput): string {
  const message = input.userMessage?.trim();
  if (message) return message;
  const scene = input.metadata?.scene;
  if (scene && isEditorWritingActionScene(scene)) return `[${scene}]`;
  if (input.promptTemplateIds?.length || input.metadata?.promptTemplateId) {
    return "[提示词生成]";
  }
  if (input.categoryContexts?.some((item) => item.content?.trim())) {
    return "[上下文生成]";
  }
  return "[生成请求]";
}

function resolvedContextFromStoredModelInput(
  modelInput: StoredGenerationJobModelInput,
): Awaited<ReturnType<typeof resolveGenerationContext>> {
  return {
    systemPromptText: modelInput.systemPromptText,
    renderedPrompt: modelInput.renderedPrompt,
    contextText: modelInput.contextText,
    finalUserPrompt: modelInput.finalUserPrompt,
    promptHash: modelInput.promptHash,
  };
}

function chapterIdFromDocumentId(
  documentId: string | undefined,
): number | undefined {
  const matched = documentId?.match(/^chapter-(\d+)$/);
  if (!matched) return undefined;
  const chapterId = Number(matched[1]);
  return Number.isInteger(chapterId) && chapterId > 0 ? chapterId : undefined;
}

async function enrichEditorDiffTarget(
  userId: number,
  editorDiff: CreateGenerationInput["editorDiff"],
  metadata: AiMetadata | undefined,
): Promise<CreateGenerationInput["editorDiff"]> {
  if (
    !editorDiff ||
    editorDiff.mode !== "novel_multi_diff" ||
    !metadata?.novelId ||
    !("baseText" in editorDiff)
  ) {
    return editorDiff;
  }
  const documentChapterId = chapterIdFromDocumentId(editorDiff.documentId);
  if (
    metadata.chapterId &&
    documentChapterId &&
    metadata.chapterId !== documentChapterId
  ) {
    throw new HttpError(
      "editorDiff.documentId 与当前章节不匹配",
      422,
      "EDITOR_DIFF_TARGET_MISMATCH",
    );
  }
  const chapterId = metadata.chapterId ?? documentChapterId;
  if (!chapterId) return editorDiff;
  const chapter = await prisma.novelChapter.findFirst({
    where: {
      id: chapterId,
      book: { id: metadata.novelId, userId, isTrash: false },
    },
    select: { title: true },
  });
  if (!chapter) throw new HttpError("章节不存在", 404);
  return {
    ...editorDiff,
    documentId: editorDiff.documentId ?? `chapter-${chapterId}`,
    target: {
      novelId: metadata.novelId,
      chapterId,
      chapterTitle: chapter.title,
    },
  };
}

/** 创建文本生成任务并返回 SSE 事件流。 */
export async function createAndStart(
  userId: number,
  input: CreateGenerationInput,
  signal?: AbortSignal,
): Promise<{ job: AiGenerationJobItem; stream: AsyncIterable<SseEvent> }> {
  assertEditorWritingActionDoesNotUseDiff(input);
  const conversation = input.conversationId
    ? await ensureOwned(userId, input.conversationId)
    : await createConversation(userId, {
        mode: input.mode,
        modelId: input.modelId,
        metadata: stripEditorWritingActionScene(input.metadata) ?? null,
      });
  const conversationId = conversation.id;
  const mode = input.mode;
  const modelId = input.modelId;
  const metadata = resolveExecutionMetadata(input, conversation.metadata);
  const editorDiff = await enrichEditorDiffTarget(
    userId,
    normalizeEditorDiffInput(input.editorDiff),
    metadata,
  );
  const contextItemIds = normalizeContextItemIds(input.contextItemIds);
  const promptTemplateIds =
    input.promptTemplateIds ??
    (metadata?.promptTemplateId ? [metadata.promptTemplateId] : undefined);
  const resolvedContext = await resolveGenerationContext(userId, {
    userMessage: input.userMessage,
    promptTemplateIds,
    promptInputs: input.promptInputs,
    categoryContexts: input.categoryContexts,
    metadata,
    contextItemIds,
    chapterIds: input.chapterIds,
    chapterSummaryIds: input.chapterSummaryIds,
  });
  const effectiveTemperature =
    input.temperature ??
    (await getUserModelState(userId).then((s) => s?.temperature ?? undefined));
  const editorDiffSnapshot = toStoredGenerationJobEditorDiff(editorDiff);
  const executionInput: CreateGenerationInput = {
    ...input,
    conversationId,
    userMessage: resolvedContext.finalUserPrompt,
    mode,
    modelId,
    metadata,
    editorDiff,
    contextItemIds,
    categoryContexts: input.categoryContexts,
    temperature: effectiveTemperature,
  };
  const parentMessageId = await lastActiveMessageId(conversationId);
  const userMessage = await MessageService.appendUserMessage(
    conversationId,
    parentMessageId,
    resolveDisplayUserMessage(input),
    { publicContent: true },
  );
  const jobRow = await prisma.aiGenerationJob.create({
    data: {
      conversationId,
      userId,
      mode,
      modelId,
      anchorMessageId: userMessage.id,
      maxIterations: DEFAULT_MAX_ITERATIONS,
      contextItemIds: toStoredGenerationJobContext({
        clientInput: generationInputSnapshot({
          conversationId,
          source: input,
          mode,
          modelId,
          promptTemplateIds,
          contextItemIds,
          metadata,
          editorDiff: editorDiffSnapshot,
          temperature: effectiveTemperature,
        }),
        contextItemIds,
        modelInput: modelInputFromResolvedContext(resolvedContext),
        editorDiff: editorDiffSnapshot,
      }),
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
  const jobContext = target.job?.contextItemIds;
  if (
    jobContext &&
    typeof jobContext === "object" &&
    !Array.isArray(jobContext) &&
    (jobContext as StoredGenerationJobContext).editorDiff
  ) {
    throw new HttpError(
      "编辑提案任务需要前端文档快照，暂不支持后端重试，请重新发起生成",
      409,
      "EDITOR_DIFF_RETRY_UNSUPPORTED",
    );
  }

  const { parentMessageId } = await MessageService.supersedeSubtree(
    userId,
    target.conversationId,
    target.id,
  );
  const mode = target.job?.mode ?? conversation.mode;
  const modelId = target.modelId ?? conversation.modelId;
  const metadata = activeMetadata(
    stripPromptTemplateId(
      conversation.metadata as CreateGenerationInput["metadata"],
    ),
  );
  const contextItemIds = fromContextItemIdsJson(target.job?.contextItemIds);
  const storedModelInput = modelInputFromJobContext(target.job?.contextItemIds);
  const resolvedContext = storedModelInput
    ? resolvedContextFromStoredModelInput(storedModelInput)
    : await resolveGenerationContext(userId, {
        userMessage: target.parent?.content ?? "请重新生成上一条回复",
        metadata,
        contextItemIds,
      });
  const executionInput: CreateGenerationInput = {
    conversationId: target.conversationId,
    userMessage: resolvedContext.finalUserPrompt,
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
      maxIterations: Math.max(
        target.job?.maxIterations ?? DEFAULT_MAX_ITERATIONS,
        DEFAULT_MAX_ITERATIONS,
      ),
      contextItemIds: toStoredGenerationJobContext({
        contextItemIds,
        modelInput: modelInputFromResolvedContext(resolvedContext),
      }),
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
