import type { Prisma } from "@/app/generated/prisma/client";
import { HttpError } from "@/app/lib/httpError";
import { prisma } from "@/app/lib/prisma";
import * as FolderService from "./contextFolder.service";
import type { ContextLibrarySourceKey } from "./contextSource.service";
import * as SourceService from "./contextSource.service";

/** 上下文素材列表查询参数。 */
export interface ContextItemListQuery {
  page?: number;
  pageSize?: number;
  novelId: number;
  sourceKey?: string;
  folderId?: number | null;
  keyword?: string;
}

/** 创建上下文素材入参。 */
export interface CreateContextItemInput {
  novelId: number;
  sourceKey: string;
  folderId?: number | null;
  data?: Record<string, unknown>;
}

/** 更新上下文素材入参。 */
export interface UpdateContextItemInput {
  folderId?: number | null;
  data?: Record<string, unknown>;
}

/** 自动同步角色/词条素材入参。 */
export interface UpsertContextItemByTitleInput {
  novelId: number;
  sourceKey: "character" | "glossary";
  folderPath?: string[];
  data: Record<string, unknown>;
}

export interface UpsertContextItemByTitleResult {
  item: ContextLibraryItem;
  action: "created" | "updated";
}

/** 整理已有角色/词条素材文件夹入参。 */
export interface OrganizeContextItemFoldersInput {
  novelId: number;
  items: Array<{
    id: number;
    sourceKey: "character" | "glossary";
    folderPath: string[];
  }>;
}

export interface OrganizeContextItemFoldersResult {
  ok: true;
  novelId: number;
  movedCount: number;
  items: Array<{
    id: number;
    title: string;
    sourceKey: "character" | "glossary";
    folderId: number | null;
    folderPath: string[];
  }>;
}

/** 上下文素材响应项。 */
export interface ContextLibraryItem {
  id: number;
  source: { id: number; key: string; name: string };
  folderId: number | null;
  title: string;
  summary: string | null;
  data: unknown;
  renderedText: string;
  createdAt: Date;
  updatedAt: Date;
}

const ITEM_SELECT = {
  id: true,
  folderId: true,
  title: true,
  summary: true,
  data: true,
  renderedText: true,
  createdAt: true,
  updatedAt: true,
  source: { select: { id: true, key: true, name: true } },
} as const;

type ContextItemRow = {
  id: number;
  folderId: number | null;
  title: string;
  summary: string | null;
  data: unknown;
  renderedText: string;
  createdAt: Date;
  updatedAt: Date;
  source: { id: number; key: string; name: string };
};

function mapItem(row: ContextItemRow): ContextLibraryItem {
  return row;
}

function textField(
  data: Record<string, unknown>,
  key: string,
  label: string,
  options: { required?: boolean; maxLength?: number } = {},
): string {
  const raw = data[key];
  const value = typeof raw === "string" ? raw.trim() : "";
  if (options.required && !value) throw new HttpError(`${label}不能为空`, 422);
  if (options.maxLength && value.length > options.maxLength) {
    throw new HttpError(`${label}过长`, 422);
  }
  return value;
}

function compactSummary(...parts: string[]): string | null {
  const summary = parts.find((part) => part.trim())?.trim() ?? "";
  if (!summary) return null;
  return summary.length > 500 ? `${summary.slice(0, 497)}...` : summary;
}

function line(label: string, value: string): string {
  return value ? `- ${label}：${value}` : `- ${label}：未设定`;
}

function normalizeCharacter(data: Record<string, unknown>): {
  title: string;
  summary: string | null;
  data: Record<string, string>;
  renderedText: string;
} {
  const name = textField(data, "name", "姓名", {
    required: true,
    maxLength: 128,
  });
  const gender = textField(data, "gender", "性别", { maxLength: 32 });
  const personality = textField(data, "personality", "角色性格", {
    maxLength: 2000,
  });
  const background = textField(data, "background", "角色设定与背景", {
    maxLength: 4000,
  });
  const appearance = textField(data, "appearance", "外貌", { maxLength: 2000 });
  const normalized = { name, gender, personality, background, appearance };

  return {
    title: name,
    summary: compactSummary(personality, background, appearance),
    data: normalized,
    renderedText: [
      `## 角色：${name}`,
      line("性别", gender),
      line("性格", personality),
      line("设定与背景", background),
      line("外貌", appearance),
    ].join("\n"),
  };
}

function normalizeGlossary(data: Record<string, unknown>): {
  title: string;
  summary: string | null;
  data: Record<string, string>;
  renderedText: string;
} {
  const name = textField(data, "name", "词条名称", {
    required: true,
    maxLength: 128,
  });
  const definition = textField(data, "definition", "词条释义", {
    required: true,
    maxLength: 4000,
  });
  const normalized = { name, definition };

  return {
    title: name,
    summary: compactSummary(definition),
    data: normalized,
    renderedText: [`## 词条：${name}`, definition].join("\n"),
  };
}

function normalizeMemo(data: Record<string, unknown>): {
  title: string;
  summary: string | null;
  data: Record<string, string>;
  renderedText: string;
} {
  const title = textField(data, "title", "备忘录标题", {
    required: true,
    maxLength: 128,
  });
  const content = textField(data, "content", "备忘录内容", {
    required: true,
    maxLength: 20000,
  });
  const normalized = { title, content };

  return {
    title,
    summary: compactSummary(content),
    data: normalized,
    renderedText: [`## 作品备忘录：${title}`, content].join("\n"),
  };
}
function normalizeItemData(
  sourceKey: ContextLibrarySourceKey,
  data: Record<string, unknown> | undefined,
): {
  title: string;
  summary: string | null;
  data: Record<string, string>;
  renderedText: string;
} {
  const input = data ?? {};
  if (sourceKey === "character") return normalizeCharacter(input);
  if (sourceKey === "memo") return normalizeMemo(input);
  return normalizeGlossary(input);
}

function mergeItemData(
  current: unknown,
  next: Record<string, string>,
): Record<string, string> {
  const currentData =
    current && typeof current === "object" && !Array.isArray(current)
      ? (current as Record<string, unknown>)
      : {};
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(currentData)) {
    if (typeof value === "string") merged[key] = value;
  }
  for (const [key, value] of Object.entries(next)) {
    if (value.trim()) merged[key] = value;
  }
  return merged;
}

function normalizeFolderPath(folderPath: string[] | undefined): string[] {
  if (!folderPath?.length) return [];
  const names: string[] = [];
  for (const rawName of folderPath) {
    const name = rawName.trim().slice(0, 128);
    if (!name) continue;
    names.push(name);
    if (names.length >= 1) break;
  }
  return names;
}

async function resolveFolderPath(
  userId: number,
  novelId: number,
  sourceId: number,
  folderPath: string[] | undefined,
): Promise<number | null> {
  const names = normalizeFolderPath(folderPath);
  let parentId: number | null = null;
  for (const name of names) {
    const existing: { id: number } | null =
      await prisma.contextFolder.findFirst({
        where: {
          userId,
          novelId,
          sourceId,
          parentId,
          name,
          isDeleted: false,
        },
        select: { id: true },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      });
    if (existing) {
      parentId = existing.id;
      continue;
    }
    const created: { id: number } = await prisma.contextFolder.create({
      data: { userId, novelId, sourceId, parentId, name },
      select: { id: true },
    });
    parentId = created.id;
  }
  return parentId;
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

async function ensureItemOwned(
  userId: number,
  id: number,
): Promise<{
  id: number;
  sourceId: number;
  sourceKey: ContextLibrarySourceKey;
}> {
  const item = await prisma.contextItem.findFirst({
    where: { id, userId, isDeleted: false },
    select: { id: true, sourceId: true, source: { select: { key: true } } },
  });
  if (!item || !SourceService.isContextLibrarySourceKey(item.source.key)) {
    throw new HttpError("上下文素材不存在", 404);
  }
  return { id: item.id, sourceId: item.sourceId, sourceKey: item.source.key };
}

/**
 * 分页查询角色库/词条库素材。
 * @param userId 当前用户 ID。
 * @param query 查询参数。
 * @returns 分页素材列表。
 */
export async function list(userId: number, query: ContextItemListQuery) {
  await ensureNovelOwned(userId, query.novelId);
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const source = query.sourceKey
    ? await SourceService.getSourceByKey(query.sourceKey)
    : null;
  const keyword = query.keyword?.trim();
  const where: Prisma.ContextItemWhereInput = {
    userId,
    isDeleted: false,
    source: source
      ? { id: source.id, enabled: true }
      : {
          key: { in: [...SourceService.CONTEXT_LIBRARY_SOURCE_KEYS] },
          enabled: true,
        },
    novelBindings: {
      some: { userId, novelId: query.novelId, enabled: true },
    },
    ...(query.folderId !== undefined ? { folderId: query.folderId } : {}),
    ...(keyword
      ? {
          OR: [
            { title: { contains: keyword } },
            { summary: { contains: keyword } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.contextItem.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: ITEM_SELECT,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    }),
    prisma.contextItem.count({ where }),
  ]);

  return { items: items.map(mapItem), total, page, pageSize };
}

/**
 * 查询角色库/词条库素材详情。
 * @param userId 当前用户 ID。
 * @param novelId 作品 ID。
 * @param id 素材 ID。
 * @returns 素材详情。
 */
export async function detail(
  userId: number,
  novelId: number,
  id: number,
): Promise<ContextLibraryItem> {
  await ensureNovelOwned(userId, novelId);
  const item = await prisma.contextItem.findFirst({
    where: {
      id,
      userId,
      isDeleted: false,
      source: { key: { in: [...SourceService.CONTEXT_LIBRARY_SOURCE_KEYS] } },
      novelBindings: { some: { userId, novelId, enabled: true } },
    },
    select: ITEM_SELECT,
  });
  if (!item) throw new HttpError("上下文素材不存在", 404);
  return mapItem(item);
}

/**
 * 创建角色库/词条库素材。
 * @param userId 当前用户 ID。
 * @param input 创建入参。
 * @returns 新素材。
 */
export async function create(
  userId: number,
  input: CreateContextItemInput,
): Promise<ContextLibraryItem> {
  await ensureNovelOwned(userId, input.novelId);
  const source = await SourceService.getSourceByKey(input.sourceKey);
  const normalized = normalizeItemData(
    source.key as ContextLibrarySourceKey,
    input.data,
  );
  const folderId = await FolderService.normalizeFolderId(
    userId,
    input.novelId,
    source.id,
    input.folderId,
  );
  if (source.key === "memo") {
    throw new HttpError("全局备忘录请使用备忘录接口管理", 422);
  }

  const row = await prisma.$transaction(async (tx) => {
    const item = await tx.contextItem.create({
      data: {
        userId,
        sourceId: source.id,
        folderId,
        title: normalized.title,
        summary: normalized.summary,
        data: normalized.data as Prisma.InputJsonValue,
        renderedText: normalized.renderedText,
        isGlobal: false,
      },
      select: ITEM_SELECT,
    });
    await tx.novelContextBinding.create({
      data: {
        userId,
        novelId: input.novelId,
        contextItemId: item.id,
      },
    });
    return item;
  });
  return mapItem(row);
}

/**
 * 更新角色库/词条库素材。
 * @param userId 当前用户 ID。
 * @param novelId 作品 ID。
 * @param id 素材 ID。
 * @param input 更新入参。
 * @returns 更新后的素材。
 */
export async function update(
  userId: number,
  novelId: number,
  id: number,
  input: UpdateContextItemInput,
): Promise<ContextLibraryItem> {
  await ensureNovelOwned(userId, novelId);
  const item = await ensureItemOwned(userId, id);
  const binding = await prisma.novelContextBinding.findFirst({
    where: { userId, novelId, contextItemId: item.id, enabled: true },
    select: { id: true },
  });
  if (!binding) throw new HttpError("上下文素材不属于当前作品素材库", 404);
  const folderId =
    input.folderId === undefined
      ? undefined
      : await FolderService.normalizeFolderId(
          userId,
          novelId,
          item.sourceId,
          input.folderId,
        );
  const normalized =
    input.data === undefined
      ? null
      : normalizeItemData(item.sourceKey, input.data);

  const row = await prisma.contextItem.update({
    where: { id: item.id },
    data: {
      ...(folderId !== undefined ? { folderId } : {}),
      ...(normalized
        ? {
            title: normalized.title,
            summary: normalized.summary,
            data: normalized.data as Prisma.InputJsonValue,
            renderedText: normalized.renderedText,
          }
        : {}),
    },
    select: ITEM_SELECT,
  });
  return mapItem(row);
}

/**
 * 按作品、来源和同名标题创建或合并更新角色/词条素材。
 * @param userId 当前用户 ID。
 * @param input 自动同步入参。
 * @returns 创建或更新后的素材。
 */
export async function upsertByTitle(
  userId: number,
  input: UpsertContextItemByTitleInput,
): Promise<UpsertContextItemByTitleResult> {
  await ensureNovelOwned(userId, input.novelId);
  const source = await SourceService.getSourceByKey(input.sourceKey);
  const normalized = normalizeItemData(
    source.key as ContextLibrarySourceKey,
    input.data,
  );
  const folderId =
    input.folderPath === undefined
      ? undefined
      : await resolveFolderPath(
          userId,
          input.novelId,
          source.id,
          input.folderPath,
        );
  const existing = await prisma.contextItem.findFirst({
    where: {
      userId,
      sourceId: source.id,
      title: normalized.title,
      isDeleted: false,
      novelBindings: {
        some: { userId, novelId: input.novelId, enabled: true },
      },
    },
    select: { id: true, data: true },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });

  if (!existing) {
    const item = await create(userId, {
      novelId: input.novelId,
      sourceKey: input.sourceKey,
      ...(folderId !== undefined ? { folderId } : {}),
      data: normalized.data,
    });
    return { item, action: "created" };
  }

  const merged = normalizeItemData(
    source.key as ContextLibrarySourceKey,
    mergeItemData(existing.data, normalized.data),
  );
  const row = await prisma.contextItem.update({
    where: { id: existing.id },
    data: {
      title: merged.title,
      summary: merged.summary,
      data: merged.data as Prisma.InputJsonValue,
      renderedText: merged.renderedText,
      ...(folderId !== undefined ? { folderId } : {}),
    },
    select: ITEM_SELECT,
  });
  return { item: mapItem(row), action: "updated" };
}

/**
 * 按素材 ID 整理当前作品下角色库/词条库素材的文件夹归属。
 * @param userId 当前用户 ID。
 * @param input 整理入参。
 * @returns 整理结果。
 */
export async function organizeFolders(
  userId: number,
  input: OrganizeContextItemFoldersInput,
): Promise<OrganizeContextItemFoldersResult> {
  await ensureNovelOwned(userId, input.novelId);
  if (!input.items.length) throw new HttpError("整理项不能为空", 422);
  if (input.items.length > 50) throw new HttpError("单次整理项过多", 422);

  const seenIds = new Set<number>();
  const sourceByKey = new Map(
    await Promise.all(
      (["character", "glossary"] as const).map(async (sourceKey) => {
        const source = await SourceService.getSourceByKey(sourceKey);
        return [sourceKey, source] as const;
      }),
    ),
  );
  let movedCount = 0;
  const organizedItems: OrganizeContextItemFoldersResult["items"] = [];

  for (const rawItem of input.items) {
    const id = rawItem.id;
    if (!Number.isInteger(id) || id <= 0)
      throw new HttpError("素材 ID 不合法", 422);
    if (seenIds.has(id)) throw new HttpError("整理项包含重复素材", 422);
    seenIds.add(id);

    const folderPath = normalizeFolderPath(rawItem.folderPath);
    if (!folderPath.length) throw new HttpError("文件夹路径不能为空", 422);
    const source = sourceByKey.get(rawItem.sourceKey);
    if (!source) throw new HttpError("素材来源不支持整理", 422);
    const item = await prisma.contextItem.findFirst({
      where: {
        id,
        userId,
        sourceId: source.id,
        isDeleted: false,
        novelBindings: {
          some: { userId, novelId: input.novelId, enabled: true },
        },
      },
      select: { id: true, title: true, folderId: true },
    });
    if (!item) throw new HttpError("上下文素材不存在或无权访问", 404);

    const folderId = await resolveFolderPath(
      userId,
      input.novelId,
      source.id,
      folderPath,
    );
    if (item.folderId !== folderId) {
      await prisma.contextItem.update({
        where: { id: item.id },
        data: { folderId },
      });
      movedCount += 1;
    }
    organizedItems.push({
      id: item.id,
      title: item.title,
      sourceKey: rawItem.sourceKey,
      folderId,
      folderPath,
    });
  }

  return {
    ok: true,
    novelId: input.novelId,
    movedCount,
    items: organizedItems,
  };
}

/**
 * 软删除角色库/词条库素材。
 * @param userId 当前用户 ID。
 * @param novelId 作品 ID。
 * @param id 素材 ID。
 */
export async function remove(
  userId: number,
  novelId: number,
  id: number,
): Promise<void> {
  await ensureNovelOwned(userId, novelId);
  const item = await ensureItemOwned(userId, id);
  const binding = await prisma.novelContextBinding.findFirst({
    where: { userId, novelId, contextItemId: item.id, enabled: true },
    select: { id: true },
  });
  if (!binding) throw new HttpError("上下文素材不属于当前作品素材库", 404);
  await prisma.contextItem.update({
    where: { id: item.id },
    data: { isDeleted: true },
  });
}
