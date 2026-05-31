import type { Prisma } from "@/app/generated/prisma/client";
import { HttpError } from "@/app/lib/httpError";
import { prisma } from "@/app/lib/prisma";

/** 备忘录作用域。 */
export type MemoScope = "GLOBAL" | "NOVEL";

/** 备忘录文件夹树节点。 */
export interface MemoFolderNode {
  id: number;
  scope: MemoScope;
  novelId: number | null;
  parentId: number | null;
  name: string;
  sortOrder: number;
  children: MemoFolderNode[];
  createdAt: Date;
  updatedAt: Date;
}

/** 备忘录列表查询参数。 */
export interface MemoListQuery {
  page?: number;
  pageSize?: number;
  scope?: MemoScope;
  novelId?: number;
  folderId?: number | null;
  keyword?: string;
}

/** 创建备忘录文件夹入参。 */
export interface CreateMemoFolderInput {
  scope: MemoScope;
  novelId?: number;
  parentId?: number | null;
  name: string;
  sortOrder?: number;
}

/** 更新备忘录文件夹入参。 */
export interface UpdateMemoFolderInput {
  name?: string;
  sortOrder?: number;
}

/** 移动备忘录文件夹入参。 */
export interface MoveMemoFolderInput {
  parentId?: number | null;
}

/** 创建备忘录入参。 */
export interface CreateMemoInput {
  scope: MemoScope;
  novelId?: number;
  folderId?: number | null;
  title: string;
  content: string;
  sortOrder?: number;
}

/** 更新备忘录入参。 */
export interface UpdateMemoInput {
  folderId?: number | null;
  title?: string;
  content?: string;
  sortOrder?: number;
}

/** 备忘录响应项。 */
export interface MemoItem {
  id: number;
  scope: MemoScope;
  novelId: number | null;
  folderId: number | null;
  title: string;
  content: string;
  summary: string | null;
  renderedText: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const MEMO_SOURCE_KEY = "memo";

const FOLDER_SELECT = {
  id: true,
  novelId: true,
  parentId: true,
  name: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} as const;

const ITEM_SELECT = {
  id: true,
  folderId: true,
  title: true,
  summary: true,
  data: true,
  renderedText: true,
  isGlobal: true,
  createdAt: true,
  updatedAt: true,
  novelBindings: { select: { novelId: true, sortOrder: true } },
} as const;

type MemoFolderRow = {
  id: number;
  novelId: number | null;
  parentId: number | null;
  name: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

type MemoItemRow = {
  id: number;
  folderId: number | null;
  title: string;
  summary: string | null;
  data: unknown;
  renderedText: string;
  isGlobal: boolean;
  createdAt: Date;
  updatedAt: Date;
  novelBindings: Array<{ novelId: number; sortOrder: number }>;
};

function normalizeScope(scope: unknown): MemoScope {
  if (scope === "GLOBAL" || scope === "NOVEL") return scope;
  throw new HttpError("备忘录作用域不合法", 422);
}

function scopeNovelId(scope: MemoScope, novelId: number | undefined): number | null {
  if (scope === "GLOBAL") return null;
  const id = Number(novelId);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError("作品 ID 不合法", 422);
  return id;
}

function normalizeName(name: string): string {
  const normalized = name.trim();
  if (!normalized) throw new HttpError("文件夹名称不能为空", 422);
  if (normalized.length > 128) throw new HttpError("文件夹名称过长", 422);
  return normalized;
}

function normalizeTitle(title: string): string {
  const normalized = title.trim();
  if (!normalized) throw new HttpError("备忘录标题不能为空", 422);
  if (normalized.length > 128) throw new HttpError("备忘录标题过长", 422);
  return normalized;
}

function normalizeContent(content: string): string {
  const normalized = content.trim();
  if (normalized.length > 100000) throw new HttpError("备忘录内容过长", 422);
  return normalized;
}

function compactSummary(content: string): string | null {
  const summary = content.trim();
  if (!summary) return null;
  return summary.length > 500 ? `${summary.slice(0, 497)}...` : summary;
}

function renderedMemo(title: string, content: string, scope: MemoScope): string {
  const scopeLabel = scope === "GLOBAL" ? "全局" : "作品";
  return [`## ${scopeLabel}备忘录：${title}`, content].join("\n");
}

function itemContent(row: MemoItemRow): string {
  if (!row.data || typeof row.data !== "object" || Array.isArray(row.data)) return "";
  const content = (row.data as Record<string, unknown>).content;
  return typeof content === "string" ? content : "";
}

function mapFolder(row: MemoFolderRow): MemoFolderNode {
  return {
    id: row.id,
    scope: row.novelId === null ? "GLOBAL" : "NOVEL",
    novelId: row.novelId,
    parentId: row.parentId,
    name: row.name,
    sortOrder: row.sortOrder,
    children: [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapItem(row: MemoItemRow): MemoItem {
  const binding = row.novelBindings[0];
  return {
    id: row.id,
    scope: row.isGlobal ? "GLOBAL" : "NOVEL",
    novelId: row.isGlobal ? null : (binding?.novelId ?? null),
    folderId: row.folderId,
    title: row.title,
    content: itemContent(row),
    summary: row.summary,
    renderedText: row.renderedText,
    sortOrder: binding?.sortOrder ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function buildTree(rows: MemoFolderRow[]): MemoFolderNode[] {
  const nodeById = new Map<number, MemoFolderNode>();
  const roots: MemoFolderNode[] = [];
  for (const row of rows) nodeById.set(row.id, mapFolder(row));
  for (const row of rows) {
    const node = nodeById.get(row.id)!;
    if (row.parentId == null) {
      roots.push(node);
      continue;
    }
    const parent = nodeById.get(row.parentId);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

async function ensureNovelOwned(userId: number, novelId: number): Promise<void> {
  const novel = await prisma.novelBook.findFirst({
    where: { id: novelId, userId, isTrash: false },
    select: { id: true },
  });
  if (!novel) throw new HttpError("作品不存在", 404);
}

async function memoSource(): Promise<{ id: number }> {
  const source = await prisma.contextSource.findUnique({
    where: { key: MEMO_SOURCE_KEY },
    select: { id: true, enabled: true },
  });
  if (!source || !source.enabled) throw new HttpError("备忘录素材来源不存在", 404);
  return source;
}

async function ensureScope(userId: number, scope: MemoScope, novelId?: number): Promise<number | null> {
  const scopedNovelId = scopeNovelId(scope, novelId);
  if (scopedNovelId !== null) await ensureNovelOwned(userId, scopedNovelId);
  return scopedNovelId;
}

async function ensureFolderOwned(userId: number, folderId: number): Promise<MemoFolderRow> {
  const source = await memoSource();
  const folder = await prisma.contextFolder.findFirst({
    where: { id: folderId, userId, sourceId: source.id, isDeleted: false },
    select: FOLDER_SELECT,
  });
  if (!folder) throw new HttpError("文件夹不存在", 404);
  return folder;
}

async function normalizeFolderId(
  userId: number,
  novelId: number | null,
  folderId: number | null | undefined,
): Promise<number | null> {
  if (folderId == null) return null;
  const folder = await ensureFolderOwned(userId, folderId);
  if (folder.novelId !== novelId) throw new HttpError("文件夹不属于当前备忘录作用域", 422);
  return folder.id;
}

async function ensureParentValid(
  userId: number,
  novelId: number | null,
  parentId: number | null | undefined,
): Promise<number | null> {
  if (parentId == null) return null;
  const parent = await ensureFolderOwned(userId, parentId);
  if (parent.novelId !== novelId) throw new HttpError("父文件夹不属于当前备忘录作用域", 422);
  return parent.id;
}

async function assertSiblingNameAvailable(
  userId: number,
  sourceId: number,
  novelId: number | null,
  parentId: number | null,
  name: string,
  excludeId?: number,
): Promise<void> {
  const exists = await prisma.contextFolder.findFirst({
    where: {
      userId,
      sourceId,
      novelId,
      parentId,
      name,
      isDeleted: false,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (exists) throw new HttpError("同级文件夹名称已存在", 409);
}

async function assertNoCycle(
  userId: number,
  folderId: number,
  targetParentId: number | null,
): Promise<void> {
  let cursor = targetParentId;
  while (cursor != null) {
    if (cursor === folderId) throw new HttpError("不能移动到自身或子级下", 422);
    const parent = await ensureFolderOwned(userId, cursor);
    cursor = parent.parentId;
  }
}

async function ensureMemoOwned(userId: number, id: number): Promise<MemoItemRow> {
  const source = await memoSource();
  const item = await prisma.contextItem.findFirst({
    where: { id, userId, sourceId: source.id, isDeleted: false },
    select: ITEM_SELECT,
  });
  if (!item) throw new HttpError("备忘录不存在", 404);
  return item;
}

function memoWhere(userId: number, sourceId: number, query: MemoListQuery): Prisma.ContextItemWhereInput {
  const scope = query.scope ? normalizeScope(query.scope) : undefined;
  const novelId = query.novelId ? Number(query.novelId) : undefined;
  const keyword = query.keyword?.trim();
  return {
    userId,
    sourceId,
    isDeleted: false,
    ...(query.folderId !== undefined ? { folderId: query.folderId } : {}),
    ...(scope === "GLOBAL" ? { isGlobal: true } : {}),
    ...(scope === "NOVEL" ? { isGlobal: false } : {}),
    ...(scope === "NOVEL" && novelId
      ? { novelBindings: { some: { userId, novelId, enabled: true } } }
      : {}),
    ...(keyword
      ? {
          OR: [
            { title: { contains: keyword } },
            { summary: { contains: keyword } },
            { renderedText: { contains: keyword } },
          ],
        }
      : {}),
  };
}

/**
 * 查询备忘录文件夹树。
 * @param userId 当前用户 ID。
 * @param input 作用域查询参数。
 * @returns 文件夹树。
 */
export async function folderTree(
  userId: number,
  input: { scope: MemoScope; novelId?: number },
): Promise<MemoFolderNode[]> {
  const scope = normalizeScope(input.scope);
  const novelId = await ensureScope(userId, scope, input.novelId);
  const source = await memoSource();
  const rows = await prisma.contextFolder.findMany({
    where: { userId, sourceId: source.id, novelId, isDeleted: false },
    select: FOLDER_SELECT,
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  return buildTree(rows);
}

/**
 * 创建备忘录文件夹。
 * @param userId 当前用户 ID。
 * @param input 创建入参。
 * @returns 新文件夹。
 */
export async function createFolder(
  userId: number,
  input: CreateMemoFolderInput,
): Promise<MemoFolderNode> {
  const scope = normalizeScope(input.scope);
  const novelId = await ensureScope(userId, scope, input.novelId);
  const source = await memoSource();
  const name = normalizeName(input.name);
  const parentId = await ensureParentValid(userId, novelId, input.parentId);
  await assertSiblingNameAvailable(userId, source.id, novelId, parentId, name);
  const row = await prisma.contextFolder.create({
    data: { userId, novelId, sourceId: source.id, parentId, name, sortOrder: input.sortOrder ?? 0 },
    select: FOLDER_SELECT,
  });
  return mapFolder(row);
}

/**
 * 更新备忘录文件夹。
 * @param userId 当前用户 ID。
 * @param folderId 文件夹 ID。
 * @param input 更新入参。
 * @returns 更新后的文件夹。
 */
export async function updateFolder(
  userId: number,
  folderId: number,
  input: UpdateMemoFolderInput,
): Promise<MemoFolderNode> {
  const source = await memoSource();
  const folder = await ensureFolderOwned(userId, folderId);
  const name = input.name === undefined ? undefined : normalizeName(input.name);
  if (name !== undefined) {
    await assertSiblingNameAvailable(userId, source.id, folder.novelId, folder.parentId, name, folder.id);
  }
  const row = await prisma.contextFolder.update({
    where: { id: folder.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
    select: FOLDER_SELECT,
  });
  return mapFolder(row);
}

/**
 * 移动备忘录文件夹。
 * @param userId 当前用户 ID。
 * @param folderId 文件夹 ID。
 * @param input 移动入参。
 * @returns 移动后的文件夹。
 */
export async function moveFolder(
  userId: number,
  folderId: number,
  input: MoveMemoFolderInput,
): Promise<MemoFolderNode> {
  const source = await memoSource();
  const folder = await ensureFolderOwned(userId, folderId);
  const parentId = await ensureParentValid(userId, folder.novelId, input.parentId);
  await assertNoCycle(userId, folder.id, parentId);
  await assertSiblingNameAvailable(userId, source.id, folder.novelId, parentId, folder.name, folder.id);
  const row = await prisma.contextFolder.update({
    where: { id: folder.id },
    data: { parentId },
    select: FOLDER_SELECT,
  });
  return mapFolder(row);
}

/**
 * 删除备忘录文件夹。
 * @param userId 当前用户 ID。
 * @param folderId 文件夹 ID。
 */
export async function removeFolder(userId: number, folderId: number): Promise<void> {
  const folder = await ensureFolderOwned(userId, folderId);
  await prisma.$transaction([
    prisma.contextFolder.updateMany({
      where: { userId, novelId: folder.novelId, parentId: folder.id, isDeleted: false },
      data: { parentId: folder.parentId },
    }),
    prisma.contextItem.updateMany({
      where: { userId, folderId: folder.id, isDeleted: false },
      data: { folderId: folder.parentId },
    }),
    prisma.contextFolder.update({ where: { id: folder.id }, data: { isDeleted: true, parentId: null } }),
  ]);
}

/**
 * 分页查询备忘录。
 * @param userId 当前用户 ID。
 * @param query 查询参数。
 * @returns 分页备忘录列表。
 */
export async function list(userId: number, query: MemoListQuery) {
  if (query.scope === "NOVEL" && query.novelId) await ensureNovelOwned(userId, Number(query.novelId));
  const source = await memoSource();
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const where = memoWhere(userId, source.id, query);
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
 * 查询备忘录详情。
 * @param userId 当前用户 ID。
 * @param id 备忘录 ID。
 * @returns 备忘录详情。
 */
export async function detail(userId: number, id: number): Promise<MemoItem> {
  return mapItem(await ensureMemoOwned(userId, id));
}

/**
 * 创建备忘录。
 * @param userId 当前用户 ID。
 * @param input 创建入参。
 * @returns 新备忘录。
 */
export async function create(userId: number, input: CreateMemoInput): Promise<MemoItem> {
  const scope = normalizeScope(input.scope);
  const novelId = await ensureScope(userId, scope, input.novelId);
  const source = await memoSource();
  const title = normalizeTitle(input.title);
  const content = normalizeContent(input.content);
  const folderId = await normalizeFolderId(userId, novelId, input.folderId);
  const row = await prisma.$transaction(async (tx) => {
    const item = await tx.contextItem.create({
      data: {
        userId,
        sourceId: source.id,
        folderId,
        title,
        summary: compactSummary(content),
        data: { title, content, scope },
        renderedText: renderedMemo(title, content, scope),
        isGlobal: scope === "GLOBAL",
      },
      select: ITEM_SELECT,
    });
    if (novelId !== null) {
      await tx.novelContextBinding.create({
        data: { userId, novelId, contextItemId: item.id, sortOrder: input.sortOrder ?? 0 },
      });
    }
    return item;
  });
  return mapItem(row);
}

/**
 * 更新备忘录。
 * @param userId 当前用户 ID。
 * @param id 备忘录 ID。
 * @param input 更新入参。
 * @returns 更新后的备忘录。
 */
export async function update(userId: number, id: number, input: UpdateMemoInput): Promise<MemoItem> {
  const item = await ensureMemoOwned(userId, id);
  const scope = item.isGlobal ? "GLOBAL" : "NOVEL";
  const novelId = scope === "GLOBAL" ? null : (item.novelBindings[0]?.novelId ?? null);
  if (scope === "NOVEL" && novelId === null) throw new HttpError("备忘录不属于任何作品", 422);
  const title = input.title === undefined ? item.title : normalizeTitle(input.title);
  const content = input.content === undefined ? itemContent(item) : normalizeContent(input.content);
  const folderId =
    input.folderId === undefined
      ? undefined
      : await normalizeFolderId(userId, novelId, input.folderId);
  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.contextItem.update({
      where: { id: item.id },
      data: {
        ...(folderId !== undefined ? { folderId } : {}),
        title,
        summary: compactSummary(content),
        data: { title, content, scope },
        renderedText: renderedMemo(title, content, scope),
      },
      select: ITEM_SELECT,
    });
    if (input.sortOrder !== undefined && novelId !== null) {
      await tx.novelContextBinding.updateMany({
        where: { userId, novelId, contextItemId: item.id },
        data: { sortOrder: input.sortOrder },
      });
    }
    return updated;
  });
  return mapItem(row);
}

/**
 * 软删除备忘录。
 * @param userId 当前用户 ID。
 * @param id 备忘录 ID。
 */
export async function remove(userId: number, id: number): Promise<void> {
  const item = await ensureMemoOwned(userId, id);
  await prisma.contextItem.update({ where: { id: item.id }, data: { isDeleted: true } });
}