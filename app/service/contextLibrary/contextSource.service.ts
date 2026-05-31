import { HttpError } from "@/app/lib/httpError";
import { prisma } from "@/app/lib/prisma";

/** 支持的上下文素材来源键。 */
export type ContextLibrarySourceKey = "character" | "glossary" | "memo";

/** 上下文素材来源项。 */
export interface ContextLibrarySourceItem {
  id: number;
  key: string;
  name: string;
  description: string | null;
  fieldSchema: unknown;
  renderTemplate: string | null;
  enabled: boolean;
  sortOrder: number;
}

export const CONTEXT_LIBRARY_SOURCE_KEYS = [
  "character",
  "glossary",
  "memo",
] as const satisfies readonly ContextLibrarySourceKey[];

const SOURCE_SELECT = {
  id: true,
  key: true,
  name: true,
  description: true,
  fieldSchema: true,
  renderTemplate: true,
  enabled: true,
  sortOrder: true,
} as const;

/**
 * 判断来源键是否属于角色库或词条库。
 * @param value 待判断值。
 * @returns 属于上下文库来源时返回 true。
 */
export function isContextLibrarySourceKey(
  value: string,
): value is ContextLibrarySourceKey {
  return CONTEXT_LIBRARY_SOURCE_KEYS.includes(
    value as ContextLibrarySourceKey,
  );
}

/**
 * 查询启用的角色库/词条库来源配置。
 * @returns 来源配置列表。
 */
export async function listSources(): Promise<ContextLibrarySourceItem[]> {
  return prisma.contextSource.findMany({
    where: { key: { in: [...CONTEXT_LIBRARY_SOURCE_KEYS] }, enabled: true },
    select: SOURCE_SELECT,
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
}

/**
 * 按来源键获取启用的来源配置。
 * @param sourceKey 来源键。
 * @returns 来源配置。
 */
export async function getSourceByKey(
  sourceKey: string,
): Promise<ContextLibrarySourceItem> {
  if (!isContextLibrarySourceKey(sourceKey)) {
    throw new HttpError("上下文来源不支持", 422);
  }

  const source = await prisma.contextSource.findUnique({
    where: { key: sourceKey },
    select: SOURCE_SELECT,
  });
  if (!source || !source.enabled) throw new HttpError("上下文来源不存在", 404);
  return source;
}

/**
 * 按来源 ID 获取启用的来源配置，并限制为角色库/词条库。
 * @param sourceId 来源 ID。
 * @returns 来源配置。
 */
export async function getSourceById(
  sourceId: number,
): Promise<ContextLibrarySourceItem> {
  const source = await prisma.contextSource.findUnique({
    where: { id: sourceId },
    select: SOURCE_SELECT,
  });
  if (!source || !source.enabled || !isContextLibrarySourceKey(source.key)) {
    throw new HttpError("上下文来源不存在", 404);
  }
  return source;
}