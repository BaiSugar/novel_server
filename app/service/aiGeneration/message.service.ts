import { createHash } from "node:crypto";
import type { Prisma } from "@/app/generated/prisma/client";
import { AiMessageRole, AiMessageStatus } from "@/app/generated/prisma/enums";
import { HttpError } from "@/app/lib/httpError";
import { prisma } from "@/app/lib/prisma";
import { ensureOwned } from "./conversation.service";
import type {
  AiGenerationInputSnapshot,
  AiMessageItem,
  CursorQuery,
  EditorDiffProposal,
} from "./types";

const PUBLIC_USER_CONTENT_MARKER = { publicContent: true };

function isPublicUserContentMarker(value: unknown): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).publicContent === true
  );
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function toIso(value: Date): string {
  return value.toISOString();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function extractGenerationInputSnapshot(
  value: unknown,
): AiGenerationInputSnapshot | undefined {
  const context = asRecord(value);
  const input = asRecord(context?.clientInput);
  if (!input) return undefined;
  const mode = input.mode;
  const modelId = Number(input.modelId);
  if (typeof mode !== "string" || !Number.isInteger(modelId) || modelId <= 0) {
    return undefined;
  }
  return {
    ...input,
    mode: mode as AiGenerationInputSnapshot["mode"],
    modelId,
  } as AiGenerationInputSnapshot;
}

async function loadGenerationInputSnapshots(
  conversationId: number,
  messages: Array<{ id: number; role: string }>,
): Promise<Map<number, AiGenerationInputSnapshot>> {
  const anchorMessageIds = messages
    .filter((message) => message.role === AiMessageRole.USER)
    .map((message) => message.id);
  if (!anchorMessageIds.length) return new Map();
  const jobs = await prisma.aiGenerationJob.findMany({
    where: { conversationId, anchorMessageId: { in: anchorMessageIds } },
    select: { anchorMessageId: true, contextItemIds: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const result = new Map<number, AiGenerationInputSnapshot>();
  for (const job of jobs) {
    if (!job.anchorMessageId || result.has(job.anchorMessageId)) continue;
    const snapshot = extractGenerationInputSnapshot(job.contextItemIds);
    if (snapshot) result.set(job.anchorMessageId, snapshot);
  }
  return result;
}

function extractReasoningContent(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const reasoningContent = (value as Record<string, unknown>).reasoningContent;
  return typeof reasoningContent === "string" && reasoningContent
    ? reasoningContent
    : undefined;
}

function extractEditProposal(value: unknown): EditorDiffProposal | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const editProposal = (value as Record<string, unknown>).editProposal;
  return editProposal &&
    typeof editProposal === "object" &&
    !Array.isArray(editProposal)
    ? (editProposal as EditorDiffProposal)
    : undefined;
}

function mapMessage(
  row: {
    id: number;
    conversationId: number;
    parentMessageId: number | null;
    role: string;
    status: string;
    content: string;
    toolCalls: unknown | null;
    toolCallId: string | null;
    toolName: string | null;
    tokenUsage: unknown | null;
    modelId: number | null;
    jobId: number | null;
    seq: number;
    createdAt: Date;
    updatedAt: Date;
  },
  options: {
    redactSensitiveContent?: boolean;
    redactInternalToolCalls?: boolean;
    generationInput?: AiGenerationInputSnapshot;
  } = {},
): AiMessageItem {
  const shouldRedactContent =
    options.redactSensitiveContent &&
    (row.role === AiMessageRole.TOOL ||
      (row.role === AiMessageRole.USER &&
        !isPublicUserContentMarker(row.toolCalls)));
  const toolCalls =
    row.role === AiMessageRole.USER && isPublicUserContentMarker(row.toolCalls)
      ? null
      : options.redactInternalToolCalls &&
          row.toolCalls &&
          typeof row.toolCalls === "object" &&
          !Array.isArray(row.toolCalls)
        ? ((row.toolCalls as Record<string, unknown>).toolCalls ?? null)
        : row.toolCalls;

  const reasoningContent =
    row.role === AiMessageRole.ASSISTANT && !shouldRedactContent
      ? extractReasoningContent(row.toolCalls)
      : undefined;
  const editProposal =
    row.role === AiMessageRole.ASSISTANT && !shouldRedactContent
      ? extractEditProposal(row.toolCalls)
      : undefined;

  return {
    id: row.id,
    conversationId: row.conversationId,
    parentMessageId: row.parentMessageId,
    role: row.role,
    status: row.status,
    content: shouldRedactContent ? "" : row.content,
    ...(reasoningContent ? { reasoningContent } : {}),
    ...(editProposal ? { editProposal } : {}),
    ...(shouldRedactContent ? { contentRedacted: true } : {}),
    ...(row.role === AiMessageRole.USER && options.generationInput
      ? { generationInput: options.generationInput }
      : {}),
    toolCalls,
    toolCallId: row.toolCallId,
    toolName: row.toolName,
    tokenUsage: row.tokenUsage,
    modelId: row.modelId,
    jobId: row.jobId,
    seq: row.seq,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

async function nextSeq(conversationId: number): Promise<number> {
  const agg = await prisma.aiMessage.aggregate({
    where: { conversationId },
    _max: { seq: true },
  });
  return (agg._max.seq ?? 0) + 1;
}

async function collectSubtreeIds(rootId: number): Promise<number[]> {
  const ids = [rootId];
  for (let index = 0; index < ids.length; index++) {
    const parentId = ids[index]!;
    const children = await prisma.aiMessage.findMany({
      where: { parentMessageId: parentId },
      select: { id: true },
    });
    ids.push(...children.map((child) => child.id));
  }
  return ids;
}

/** 游标分页拉取消息。 */
export async function list(
  userId: number,
  conversationId: number,
  query: CursorQuery = {},
): Promise<{ items: AiMessageItem[]; nextCursor: number | null }> {
  await ensureOwned(userId, conversationId);
  const limit = Math.min(query.limit ?? 50, 200);
  const rows = await prisma.aiMessage.findMany({
    where: {
      conversationId,
      ...(query.includeSuperseded
        ? {}
        : { status: { not: AiMessageStatus.SUPERSEDED } }),
      ...(query.cursor ? { id: { gt: query.cursor } } : {}),
    },
    take: limit + 1,
    orderBy: [{ seq: "asc" }, { id: "asc" }],
  });
  const items = rows.slice(0, limit);
  const generationInputByMessageId = await loadGenerationInputSnapshots(
    conversationId,
    items,
  );
  return {
    items: items.map((item) =>
      mapMessage(item, {
        redactSensitiveContent: true,
        redactInternalToolCalls: true,
        generationInput: generationInputByMessageId.get(item.id),
      }),
    ),
    nextCursor: rows.length > limit ? rows[limit]!.id : null,
  };
}

/** 追加用户消息。 */
export async function appendUserMessage(
  conversationId: number,
  parentMessageId: number | null,
  content: string,
  options: { publicContent?: boolean } = {},
): Promise<AiMessageItem> {
  const row = await prisma.aiMessage.create({
    data: {
      conversationId,
      parentMessageId,
      role: AiMessageRole.USER,
      status: AiMessageStatus.ACTIVE,
      content,
      contentHash: sha256(content),
      toolCalls: options.publicContent
        ? (PUBLIC_USER_CONTENT_MARKER as Prisma.InputJsonValue)
        : undefined,
      seq: await nextSeq(conversationId),
    },
  });
  await prisma.aiConversation.update({
    where: { id: conversationId },
    data: { messageCount: { increment: 1 }, lastMessageAt: new Date() },
  });
  return mapMessage(row);
}

/** 追加待完成 assistant 消息。 */
export async function appendPendingAssistant(
  conversationId: number,
  parentMessageId: number | null,
  jobId: number,
  modelId: number,
): Promise<AiMessageItem> {
  const row = await prisma.aiMessage.create({
    data: {
      conversationId,
      parentMessageId,
      role: AiMessageRole.ASSISTANT,
      status: AiMessageStatus.PENDING,
      content: "",
      contentHash: sha256(""),
      jobId,
      modelId,
      seq: await nextSeq(conversationId),
    },
  });
  return mapMessage(row);
}

/** 更新消息为终态。 */
export async function finalizeMessage(
  messageId: number,
  patch: {
    content?: string;
    status: AiMessageStatus;
    tokenUsage?: unknown;
    toolCalls?: unknown;
  },
): Promise<AiMessageItem> {
  const previous = await prisma.aiMessage.findUnique({
    where: { id: messageId },
    select: { status: true },
  });
  const row = await prisma.aiMessage.update({
    where: { id: messageId },
    data: {
      status: patch.status,
      ...(patch.content !== undefined
        ? { content: patch.content, contentHash: sha256(patch.content) }
        : {}),
      ...(patch.tokenUsage !== undefined
        ? { tokenUsage: patch.tokenUsage as Prisma.InputJsonValue }
        : {}),
      ...(patch.toolCalls !== undefined
        ? { toolCalls: patch.toolCalls as Prisma.InputJsonValue }
        : {}),
    },
  });
  if (
    patch.status === AiMessageStatus.ACTIVE &&
    previous?.status !== AiMessageStatus.ACTIVE
  ) {
    await prisma.aiConversation.update({
      where: { id: row.conversationId },
      data: { messageCount: { increment: 1 }, lastMessageAt: new Date() },
    });
  }
  return mapMessage(row);
}

/** 将指定任务仍处于 PENDING 的消息标记为失败。 */
export async function failPendingMessages(
  jobId: number,
  content: string,
): Promise<number> {
  const result = await prisma.aiMessage.updateMany({
    where: { jobId, status: AiMessageStatus.PENDING },
    data: {
      status: AiMessageStatus.FAILED,
      content,
      contentHash: sha256(content),
    },
  });
  return result.count;
}

/** 追加工具消息。 */
export async function appendToolMessage(
  conversationId: number,
  parentMessageId: number,
  jobId: number,
  toolCallId: string,
  toolName: string,
  content: string,
): Promise<AiMessageItem> {
  const row = await prisma.aiMessage.create({
    data: {
      conversationId,
      parentMessageId,
      role: AiMessageRole.TOOL,
      status: AiMessageStatus.ACTIVE,
      content,
      contentHash: sha256(content),
      toolCallId,
      toolName,
      jobId,
      seq: await nextSeq(conversationId),
    },
  });
  await prisma.aiConversation.update({
    where: { id: conversationId },
    data: { messageCount: { increment: 1 }, lastMessageAt: new Date() },
  });
  return mapMessage(row);
}

/** 将目标消息及后代标记为 SUPERSEDED。 */
export async function supersedeSubtree(
  userId: number,
  conversationId: number,
  targetMessageId: number,
): Promise<{ parentMessageId: number | null; supersededCount: number }> {
  await ensureOwned(userId, conversationId);
  const target = await prisma.aiMessage.findFirst({
    where: {
      id: targetMessageId,
      conversationId,
      role: AiMessageRole.ASSISTANT,
      status: AiMessageStatus.ACTIVE,
    },
    select: { id: true, parentMessageId: true },
  });
  if (!target) throw new HttpError("重试目标消息不存在", 404);
  const ids = await collectSubtreeIds(target.id);
  await prisma.aiMessage.updateMany({
    where: { id: { in: ids } },
    data: { status: AiMessageStatus.SUPERSEDED },
  });
  return {
    parentMessageId: target.parentMessageId,
    supersededCount: ids.length,
  };
}

/** 删除用户消息并 supersede 下游。 */
export async function deleteUserMessage(
  userId: number,
  conversationId: number,
  messageId: number,
): Promise<boolean> {
  await ensureOwned(userId, conversationId);
  const target = await prisma.aiMessage.findFirst({
    where: {
      id: messageId,
      conversationId,
      role: AiMessageRole.USER,
      status: AiMessageStatus.ACTIVE,
    },
    select: { id: true },
  });
  if (!target) throw new HttpError("只能删除有效的用户消息", 409);
  const ids = await collectSubtreeIds(target.id);
  await prisma.aiMessage.updateMany({
    where: { id: { in: ids } },
    data: { status: AiMessageStatus.SUPERSEDED },
  });
  return true;
}

/** 拉取当前 ACTIVE 消息链。 */
export async function listActiveChain(
  conversationId: number,
): Promise<AiMessageItem[]> {
  const rows = await prisma.aiMessage.findMany({
    where: { conversationId, status: AiMessageStatus.ACTIVE },
    orderBy: [{ seq: "asc" }, { id: "asc" }],
  });
  return rows.map((row) => mapMessage(row));
}
