import type { Prisma } from "@/app/generated/prisma/client";
import { AiConversationStatus } from "@/app/generated/prisma/enums";
import { HttpError } from "@/app/lib/httpError";
import { prisma } from "@/app/lib/prisma";
import * as AiModelService from "@/app/service/aiModel/model.service";
import type {
  AiConversationItem,
  AiMetadata,
  ConversationListQuery,
  CreateConversationInput,
  UpdateConversationInput,
} from "./types";

const METADATA_KEYS = new Set([
  "novelId",
  "chapterId",
  "promptTemplateId",
  "scene",
]);

function normalizeMetadata(
  value: AiMetadata | null | undefined,
): Prisma.InputJsonValue | undefined {
  if (!value) return undefined;
  for (const key of Object.keys(value)) {
    if (!METADATA_KEYS.has(key))
      throw new HttpError(`metadata.${key} 不支持`, 422);
  }
  return value as Prisma.InputJsonValue;
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function mapConversation(row: {
  id: number;
  userId: number;
  title: string;
  mode: AiConversationItem["mode"];
  modelId: number;
  systemPrompt: string | null;
  metadata: unknown | null;
  status: AiConversationItem["status"];
  messageCount: number;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): AiConversationItem {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    mode: row.mode,
    modelId: row.modelId,
    systemPrompt: null,
    metadata: row.metadata as AiMetadata | null,
    status: row.status,
    messageCount: row.messageCount,
    lastMessageAt: toIso(row.lastMessageAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** 校验会话归属并返回实体。 */
export async function ensureOwned(userId: number, id: number) {
  const row = await prisma.aiConversation.findFirst({
    where: { id, userId, status: { not: AiConversationStatus.DELETED } },
  });
  if (!row) throw new HttpError("AI 会话不存在", 404);
  return row;
}

/** 创建 AI 会话。 */
export async function create(
  userId: number,
  input: CreateConversationInput,
): Promise<AiConversationItem> {
  await AiModelService.publicModelDetail(input.modelId);
  const row = await prisma.aiConversation.create({
    data: {
      userId,
      title: input.title ?? "",
      mode: input.mode,
      modelId: input.modelId,
      systemPrompt: input.systemPrompt ?? null,
      metadata: normalizeMetadata(input.metadata),
    },
  });
  return mapConversation(row);
}

/** 分页查询 AI 会话。 */
export async function list(
  userId: number,
  query: ConversationListQuery = {},
): Promise<{
  items: AiConversationItem[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const where: Record<string, unknown> = {
    userId,
    status: query.status ?? AiConversationStatus.ACTIVE,
  };
  if (query.keyword) where.title = { contains: query.keyword };

  const [items, total] = await Promise.all([
    prisma.aiConversation.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
    }),
    prisma.aiConversation.count({ where }),
  ]);
  const filtered = items.filter((item) => {
    const metadata = item.metadata as AiMetadata | null;
    if (query.novelId !== undefined && metadata?.novelId !== query.novelId)
      return false;
    if (
      query.chapterId !== undefined &&
      metadata?.chapterId !== query.chapterId
    )
      return false;
    return true;
  });
  return { items: filtered.map(mapConversation), total, page, pageSize };
}

/** 获取 AI 会话详情。 */
export async function detail(
  userId: number,
  id: number,
): Promise<AiConversationItem> {
  return mapConversation(await ensureOwned(userId, id));
}

/** 更新 AI 会话。 */
export async function update(
  userId: number,
  id: number,
  input: UpdateConversationInput,
): Promise<AiConversationItem> {
  await ensureOwned(userId, id);
  if (input.modelId !== undefined)
    await AiModelService.publicModelDetail(input.modelId);
  const row = await prisma.aiConversation.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.mode !== undefined ? { mode: input.mode } : {}),
      ...(input.modelId !== undefined ? { modelId: input.modelId } : {}),
      ...(input.systemPrompt !== undefined
        ? { systemPrompt: input.systemPrompt }
        : {}),
      ...(input.metadata !== undefined
        ? { metadata: normalizeMetadata(input.metadata) }
        : {}),
    },
  });
  return mapConversation(row);
}

/** 软删除 AI 会话。 */
export async function softDelete(userId: number, id: number): Promise<boolean> {
  await ensureOwned(userId, id);
  await prisma.aiConversation.update({
    where: { id },
    data: { status: AiConversationStatus.DELETED },
  });
  return true;
}

/** 归档或恢复 AI 会话。 */
export async function setArchived(
  userId: number,
  id: number,
  archived: boolean,
): Promise<AiConversationItem> {
  await ensureOwned(userId, id);
  const row = await prisma.aiConversation.update({
    where: { id },
    data: {
      status: archived
        ? AiConversationStatus.ARCHIVED
        : AiConversationStatus.ACTIVE,
    },
  });
  return mapConversation(row);
}
