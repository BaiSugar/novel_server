import { HttpError } from "@/app/lib/httpError";
import { prisma } from "@/app/lib/prisma";
import * as SourceService from "./contextSource.service";

/** 上下文文件夹树节点。 */
export interface ContextFolderNode {
  id: number;
  novelId: number | null;
  sourceId: number;
  parentId: number | null;
  name: string;
  sortOrder: number;
  children: ContextFolderNode[];
  createdAt: Date;
  updatedAt: Date;
}

/** 创建文件夹入参。 */
export interface CreateContextFolderInput {
  novelId: number;
  sourceKey: string;
  parentId?: number | null;
  name: string;
  sortOrder?: number;
}

/** 更新文件夹入参。 */
export interface UpdateContextFolderInput {
  name?: string;
  sortOrder?: number;
}

/** 移动文件夹入参。 */
export interface MoveContextFolderInput {
  parentId?: number | null;
}

const FOLDER_SELECT = {
  id: true,
  novelId: true,
  sourceId: true,
  parentId: true,
  name: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} as const;

type ContextFolderRow = Omit<ContextFolderNode, "children">;

function ensureNovelScopedFolder(folder: ContextFolderRow): number {
  if (folder.novelId === null) throw new HttpError("文件夹不属于作品素材库", 422);
  return folder.novelId;
}

function mapFolder(row: ContextFolderRow): ContextFolderNode {
  return { ...row, children: [] };
}

function normalizeName(name: string): string {
  const normalized = name.trim();
  if (!normalized) throw new HttpError("文件夹名称不能为空", 422);
  if (normalized.length > 128) throw new HttpError("文件夹名称过长", 422);
  return normalized;
}

async function ensureNovelOwned(userId: number, novelId: number): Promise<void> {
  const novel = await prisma.novelBook.findFirst({
    where: { id: novelId, userId, isTrash: false },
    select: { id: true },
  });
  if (!novel) throw new HttpError("作品不存在", 404);
}

async function ensureFolderOwned(
  userId: number,
  folderId: number,
): Promise<ContextFolderRow> {
  const folder = await prisma.contextFolder.findFirst({
    where: { id: folderId, userId, isDeleted: false },
    select: FOLDER_SELECT,
  });
  if (!folder) throw new HttpError("文件夹不存在", 404);
  return folder;
}

async function ensureParentValid(
  userId: number,
  novelId: number,
  sourceId: number,
  parentId: number | null | undefined,
): Promise<number | null> {
  if (parentId == null) return null;
  const parent = await ensureFolderOwned(userId, parentId);
  if (parent.novelId !== novelId) throw new HttpError("父文件夹不属于当前作品", 422);
  if (parent.sourceId !== sourceId) throw new HttpError("父文件夹来源不一致", 422);
  return parent.id;
}

async function assertSiblingNameAvailable(
  userId: number,
  novelId: number,
  sourceId: number,
  parentId: number | null,
  name: string,
  excludeId?: number,
): Promise<void> {
  const exists = await prisma.contextFolder.findFirst({
    where: {
      userId,
      novelId,
      sourceId,
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
  novelId: number,
  folderId: number,
  targetParentId: number | null,
): Promise<void> {
  let cursor = targetParentId;
  while (cursor != null) {
    if (cursor === folderId) throw new HttpError("不能移动到自身或子级下", 422);
    const parent = await prisma.contextFolder.findFirst({
      where: { id: cursor, userId, novelId, isDeleted: false },
      select: { id: true, parentId: true },
    });
    if (!parent) throw new HttpError("目标父文件夹不存在", 404);
    cursor = parent.parentId;
  }
}

function buildTree(rows: ContextFolderRow[]): ContextFolderNode[] {
  const nodeById = new Map<number, ContextFolderNode>();
  const roots: ContextFolderNode[] = [];

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

/**
 * 查询指定来源下的文件夹树。
 * @param userId 当前用户 ID。
 * @param novelId 作品 ID。
 * @param sourceKey 来源键。
 * @returns 文件夹树。
 */
export async function tree(
  userId: number,
  novelId: number,
  sourceKey: string,
): Promise<ContextFolderNode[]> {
  await ensureNovelOwned(userId, novelId);
  const source = await SourceService.getSourceByKey(sourceKey);
  const rows = await prisma.contextFolder.findMany({
    where: { userId, novelId, sourceId: source.id, isDeleted: false },
    select: FOLDER_SELECT,
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  return buildTree(rows);
}

/**
 * 创建上下文素材文件夹。
 * @param userId 当前用户 ID。
 * @param input 创建入参。
 * @returns 新文件夹。
 */
export async function create(
  userId: number,
  input: CreateContextFolderInput,
): Promise<ContextFolderNode> {
  await ensureNovelOwned(userId, input.novelId);
  const source = await SourceService.getSourceByKey(input.sourceKey);
  const name = normalizeName(input.name);
  const parentId = await ensureParentValid(userId, input.novelId, source.id, input.parentId);
  await assertSiblingNameAvailable(userId, input.novelId, source.id, parentId, name);

  const row = await prisma.contextFolder.create({
    data: {
      userId,
      novelId: input.novelId,
      sourceId: source.id,
      parentId,
      name,
      sortOrder: input.sortOrder ?? 0,
    },
    select: FOLDER_SELECT,
  });
  return mapFolder(row);
}

/**
 * 更新上下文素材文件夹。
 * @param userId 当前用户 ID。
 * @param folderId 文件夹 ID。
 * @param input 更新入参。
 * @returns 更新后的文件夹。
 */
export async function update(
  userId: number,
  folderId: number,
  input: UpdateContextFolderInput,
): Promise<ContextFolderNode> {
  const folder = await ensureFolderOwned(userId, folderId);
  const novelId = ensureNovelScopedFolder(folder);
  const name = input.name === undefined ? undefined : normalizeName(input.name);
  if (name !== undefined) {
    await assertSiblingNameAvailable(
      userId,
      novelId,
      folder.sourceId,
      folder.parentId,
      name,
      folder.id,
    );
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
 * 移动上下文素材文件夹。
 * @param userId 当前用户 ID。
 * @param folderId 文件夹 ID。
 * @param input 移动入参。
 * @returns 移动后的文件夹。
 */
export async function move(
  userId: number,
  folderId: number,
  input: MoveContextFolderInput,
): Promise<ContextFolderNode> {
  const folder = await ensureFolderOwned(userId, folderId);
  const novelId = ensureNovelScopedFolder(folder);
  const parentId = await ensureParentValid(userId, novelId, folder.sourceId, input.parentId);
  await assertNoCycle(userId, novelId, folder.id, parentId);
  await assertSiblingNameAvailable(
    userId,
    novelId,
    folder.sourceId,
    parentId,
    folder.name,
    folder.id,
  );

  const row = await prisma.contextFolder.update({
    where: { id: folder.id },
    data: { parentId },
    select: FOLDER_SELECT,
  });
  return mapFolder(row);
}

/**
 * 软删除上下文素材文件夹，并将子级和素材移到当前上级。
 * @param userId 当前用户 ID。
 * @param folderId 文件夹 ID。
 */
export async function remove(userId: number, folderId: number): Promise<void> {
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
    prisma.contextFolder.update({
      where: { id: folder.id },
      data: { isDeleted: true, parentId: null },
    }),
  ]);
}

/**
 * 校验文件夹属于当前用户和指定来源。
 * @param userId 当前用户 ID。
 * @param novelId 作品 ID。
 * @param sourceId 来源 ID。
 * @param folderId 文件夹 ID。
 * @returns 归一化文件夹 ID。
 */
export async function normalizeFolderId(
  userId: number,
  novelId: number,
  sourceId: number,
  folderId: number | null | undefined,
): Promise<number | null> {
  if (folderId == null) return null;
  const folder = await ensureFolderOwned(userId, folderId);
  if (folder.novelId !== novelId) throw new HttpError("文件夹不属于当前作品", 422);
  if (folder.sourceId !== sourceId) throw new HttpError("文件夹来源不一致", 422);
  return folder.id;
}