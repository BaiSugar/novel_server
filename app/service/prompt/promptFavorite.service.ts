import { prisma } from "@/app/lib/prisma";
import { HttpError } from "@/app/lib/httpError";

export interface PromptFavoriteItem {
  id: number;
  name: string;
  description: string | null;
  usageGuide: string | null;
  userId: number;
  authorName: string | null;
  categoryId: number | null;
  categoryName: string | null;
  favoritedAt: Date;
}

export interface PromptFavoriteListResult {
  items: PromptFavoriteItem[];
  total: number;
  page: number;
  pageSize: number;
}

async function resolvePromptSnapshots(
  promptTemplateIds: number[],
): Promise<Map<number, Omit<PromptFavoriteItem, "favoritedAt">>> {
  if (!promptTemplateIds.length) return new Map();
  const prompts = await prisma.promptTemplate.findMany({
    where: { id: { in: promptTemplateIds }, isDeleted: false },
    select: {
      id: true,
      name: true,
      description: true,
      usageGuide: true,
      userId: true,
      user: { select: { username: true } },
      categoryId: true,
      category: { select: { name: true } },
    },
  });
  const map = new Map<number, Omit<PromptFavoriteItem, "favoritedAt">>();
  for (const p of prompts) {
    map.set(p.id, {
      id: p.id,
      name: p.name,
      description: p.description,
      usageGuide: p.usageGuide,
      userId: p.userId,
      authorName: p.user?.username ?? null,
      categoryId: p.categoryId,
      categoryName: p.category?.name ?? null,
    });
  }
  return map;
}

/** 获取用户收藏的提示词列表。 */
export async function list(
  userId: number,
  page = 1,
  pageSize = 20,
): Promise<PromptFavoriteListResult> {
  const [rows, total] = await Promise.all([
    prisma.userPromptFavorite.findMany({
      where: { userId },
      select: { promptTemplateId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.userPromptFavorite.count({ where: { userId } }),
  ]);
  if (!rows.length) return { items: [], total, page, pageSize };
  const promptIds = rows.map((r) => r.promptTemplateId);
  const snapshots = await resolvePromptSnapshots(promptIds);
  const items = rows
    .map((r) => {
      const snap = snapshots.get(r.promptTemplateId);
      return snap
        ? {
            ...snap,
            favoritedAt: r.createdAt,
          }
        : null;
    })
    .filter((item): item is PromptFavoriteItem => item !== null);
  return { items, total, page, pageSize };
}

/** 收藏提示词。 */
export async function add(userId: number, promptTemplateId: number): Promise<PromptFavoriteItem> {
  const prompt = await prisma.promptTemplate.findFirst({
    where: { id: promptTemplateId, isDeleted: false },
    select: {
      id: true,
      name: true,
      description: true,
      usageGuide: true,
      userId: true,
      user: { select: { username: true } },
      privacy: true,
      categoryId: true,
      category: { select: { name: true } },
    },
  });
  if (!prompt) throw new HttpError("提示词不存在", 404);

  const row = await prisma.userPromptFavorite.upsert({
    where: { userId_promptTemplateId: { userId, promptTemplateId } },
    create: { userId, promptTemplateId },
    update: {},
    select: { createdAt: true },
  });

  return {
    id: prompt.id,
    name: prompt.name,
    description: prompt.description,
    usageGuide: prompt.usageGuide,
    userId: prompt.userId,
    authorName: prompt.user?.username ?? null,
    categoryId: prompt.categoryId,
    categoryName: prompt.category?.name ?? null,
    favoritedAt: row.createdAt,
  };
}

/** 取消收藏提示词。如果该提示词是某个分类的上次选择，同步清掉。 */
export async function remove(userId: number, promptTemplateId: number): Promise<void> {
  await prisma.userPromptFavorite.deleteMany({
    where: { userId, promptTemplateId },
  });
  await prisma.userPromptState.updateMany({
    where: { userId, promptTemplateId },
    data: { promptTemplateId: null },
  });
}