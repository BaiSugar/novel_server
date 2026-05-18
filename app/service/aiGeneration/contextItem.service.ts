import { HttpError } from "@/app/lib/httpError";
import { prisma } from "@/app/lib/prisma";

export interface ResolveContextItemsInput {
  novelId?: number;
  chapterId?: number;
  contextItemIds?: number[];
}

export interface ContextItemOption {
  id: number;
  source: {
    id: number;
    name: string;
  };
  title: string;
  summary: string | null;
  global: boolean;
  bound: boolean;
}

async function ensureNovelOwned(
  userId: number,
  novelId: number,
): Promise<void> {
  const novel = await prisma.novelBook.findFirst({
    where: { id: novelId, userId, isTrash: false },
    select: { id: true },
  });
  if (!novel) throw new HttpError("作品不存在", 404);
}

async function ensureMetadataRefsOwned(
  userId: number,
  metadata: { novelId?: number; chapterId?: number } | undefined,
): Promise<void> {
  if (metadata?.novelId) await ensureNovelOwned(userId, metadata.novelId);
  if (!metadata?.chapterId) return;
  const chapter = await prisma.novelChapter.findFirst({
    where: {
      id: metadata.chapterId,
      book: {
        userId,
        ...(metadata.novelId ? { id: metadata.novelId } : {}),
      },
    },
    select: { id: true },
  });
  if (!chapter) throw new HttpError("章节不存在", 404);
}

function normalizeContextItemIds(ids: number[] | undefined): number[] {
  if (!ids?.length) return [];
  const normalized = ids.map((id) => Number(id));
  if (normalized.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new HttpError("contextItemIds 不合法", 422);
  }
  return [...new Set(normalized)];
}

/**
 * 解析用户选择的上下文素材为模型上下文文本。
 * @param userId 当前用户 ID。
 * @param input 上下文素材选择。
 * @returns 拼接后的上下文文本。
 */
export async function resolveContextItems(
  userId: number,
  input: ResolveContextItemsInput,
): Promise<string> {
  await ensureMetadataRefsOwned(userId, {
    novelId: input.novelId,
    chapterId: input.chapterId,
  });
  const ids = normalizeContextItemIds(input.contextItemIds);
  if (!ids.length) return "";

  const bindingNovelId = input.novelId ?? -1;
  const items = await prisma.contextItem.findMany({
    where: {
      id: { in: ids },
      userId,
      isDeleted: false,
      source: { enabled: true },
    },
    include: {
      source: { select: { id: true, name: true } },
      novelBindings: {
        where: {
          userId,
          novelId: bindingNovelId,
          enabled: true,
        },
        select: { id: true, sortOrder: true },
      },
    },
  });

  if (items.length !== ids.length) {
    throw new HttpError("上下文素材不存在或无权使用", 404);
  }

  const itemById = new Map(items.map((item) => [item.id, item]));
  const renderedParts = ids.map((id) => {
    const item = itemById.get(id);
    if (!item) throw new HttpError("上下文素材不存在或无权使用", 404);
    const bound = input.novelId
      ? item.novelBindings.some((binding) => binding.id > 0)
      : false;
    if (!item.isGlobal && !bound) {
      throw new HttpError("上下文素材未绑定当前作品", 422);
    }
    return item.renderedText;
  });

  return renderedParts.filter(Boolean).join("\n\n");
}

/**
 * 查询用户可选择的上下文素材列表。
 * @param userId 当前用户 ID。
 * @param input 查询条件。
 * @returns 可供前端勾选的上下文素材列表。
 */
export async function listContextItemOptions(
  userId: number,
  input: { novelId?: number; keyword?: string } = {},
): Promise<ContextItemOption[]> {
  if (input.novelId) await ensureNovelOwned(userId, input.novelId);
  const keyword = input.keyword?.trim();
  const bindingNovelId = input.novelId ?? -1;
  const items = await prisma.contextItem.findMany({
    where: {
      userId,
      isDeleted: false,
      source: { enabled: true },
      ...(keyword
        ? {
            OR: [
              { title: { contains: keyword } },
              { summary: { contains: keyword } },
            ],
          }
        : {}),
      ...(input.novelId
        ? {
            OR: [
              { isGlobal: true },
              {
                novelBindings: {
                  some: {
                    userId,
                    novelId: input.novelId,
                    enabled: true,
                  },
                },
              },
            ],
          }
        : { isGlobal: true }),
    },
    include: {
      source: { select: { id: true, name: true } },
      novelBindings: {
        where: { userId, novelId: bindingNovelId, enabled: true },
        select: { id: true, sortOrder: true },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });

  return items.map((item) => ({
    id: item.id,
    source: item.source,
    title: item.title,
    summary: item.summary,
    global: item.isGlobal,
    bound: input.novelId
      ? item.novelBindings.some((binding) => binding.id > 0)
      : false,
  }));
}
