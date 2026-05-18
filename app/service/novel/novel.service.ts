import type { NovelType } from "@/app/generated/prisma/enums";
import { HttpError } from "@/app/lib/httpError";
import { prisma } from "@/app/lib/prisma";

/** 作品列表查询参数。 */
export interface BookListParams {
  /** 页码（从 1 开始）。 */
  page?: number;
  /** 每页数量。 */
  pageSize?: number;
  /** 是否归档。 */
  archived?: boolean;
  /** 是否回收站。 */
  isTrash?: boolean | number;
  /** 搜索关键词（匹配名称）。 */
  keyword?: string;
}

/** 创建作品入参。 */
export interface CreateBookInput {
  /** 作品名称。 */
  name: string;
  /** 作品简介。 */
  description?: string;
  /** 作品类型。 */
  type?: NovelType;
}

/** 更新作品入参。 */
export interface UpdateBookInput {
  /** 作品名称。 */
  name?: string;
  /** 作品简介。 */
  description?: string;
  /** 作品类型。 */
  type?: NovelType | null;
}

/** 安全字段选择。 */
const BOOK_SELECT = {
  id: true,
  userId: true,
  name: true,
  description: true,
  type: true,
  totalWords: true,
  order: true,
  archived: true,
  isTrash: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * 分页查询作品列表。
 * @param userId 作者用户 ID。
 * @param params 查询参数。
 * @returns 分页结果。
 */
export async function list(userId: number, params: BookListParams = {}) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;
  const archived = params.archived ?? false;
  const isTrash = params.isTrash != null ? Boolean(params.isTrash) : false;

  const where: Record<string, unknown> = { userId, archived, isTrash };
  if (params.keyword) {
    where.name = { contains: params.keyword };
  }

  const [items, total] = await Promise.all([
    prisma.novelBook.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: BOOK_SELECT,
      orderBy: [{ order: "asc" }, { id: "desc" }],
    }),
    prisma.novelBook.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

/**
 * 获取作品详情。
 * @param bookId 作品 ID。
 * @param userId 作者用户 ID。
 * @returns 作品信息。
 */
export async function detail(bookId: number, userId: number) {
  const book = await prisma.novelBook.findFirst({
    where: { id: bookId, userId },
    select: BOOK_SELECT,
  });

  if (!book) throw new HttpError("作品不存在", 404);
  return book;
}

/**
 * 创建作品。
 * @param userId 作者用户 ID。
 * @param input 创建入参。
 * @returns 新作品。
 */
export async function create(userId: number, input: CreateBookInput) {
  const maxOrder = await prisma.novelBook.aggregate({
    where: { userId, archived: false, isTrash: false },
    _max: { order: true },
  });

  return prisma.novelBook.create({
    data: {
      userId,
      name: input.name,
      description: input.description,
      type: input.type,
      order: (maxOrder._max.order ?? -1) + 1,
    },
    select: BOOK_SELECT,
  });
}

/**
 * 更新作品。
 * @param bookId 作品 ID。
 * @param userId 作者用户 ID。
 * @param input 更新入参。
 * @returns 更新后的作品。
 */
export async function update(
  bookId: number,
  userId: number,
  input: UpdateBookInput,
) {
  const book = await prisma.novelBook.findFirst({
    where: { id: bookId, userId },
    select: { id: true },
  });

  if (!book) throw new HttpError("作品不存在", 404);

  return prisma.novelBook.update({
    where: { id: bookId },
    data: input,
    select: BOOK_SELECT,
  });
}

/**
 * 归档/取消归档作品。
 * @param bookId 作品 ID。
 * @param userId 作者用户 ID。
 * @param archived 是否归档。
 * @returns 更新后的作品。
 */
export async function toggleArchive(
  bookId: number,
  userId: number,
  archived: boolean,
) {
  const book = await prisma.novelBook.findFirst({
    where: { id: bookId, userId },
    select: { id: true },
  });

  if (!book) throw new HttpError("作品不存在", 404);

  return prisma.novelBook.update({
    where: { id: bookId },
    data: { archived },
    select: BOOK_SELECT,
  });
}

/**
 * 软删除作品（移入回收站）。
 * @param bookId 作品 ID。
 * @param userId 作者用户 ID。
 */
export async function remove(bookId: number, userId: number): Promise<void> {
  const book = await prisma.novelBook.findFirst({
    where: { id: bookId, userId },
    select: { id: true },
  });

  if (!book) throw new HttpError("作品不存在", 404);

  await prisma.novelBook.update({
    where: { id: bookId },
    data: { isTrash: true },
  });
}

/**
 * 恢复回收站作品。
 * @param bookId 作品 ID。
 * @param userId 作者用户 ID。
 * @returns 恢复后的作品。
 */
export async function restore(bookId: number, userId: number) {
  const book = await prisma.novelBook.findFirst({
    where: { id: bookId, userId, isTrash: true },
    select: { id: true },
  });

  if (!book) throw new HttpError("作品不存在", 404);

  return prisma.novelBook.update({
    where: { id: bookId },
    data: { isTrash: false },
    select: BOOK_SELECT,
  });
}

/**
 * 永久删除作品。
 * @param bookId 作品 ID。
 * @param userId 作者用户 ID。
 */
export async function permanentDelete(
  bookId: number,
  userId: number,
): Promise<void> {
  const book = await prisma.novelBook.findFirst({
    where: { id: bookId, userId, isTrash: true },
    select: { id: true },
  });

  if (!book) throw new HttpError("作品不存在", 404);

  await prisma.novelBook.delete({ where: { id: bookId } });
}

/**
 * 更新作品字数统计。
 * @param bookId 作品 ID。
 */
export async function recountWords(bookId: number): Promise<void> {
  const result = await prisma.novelChapter.aggregate({
    where: { bookId },
    _sum: { wordCount: true },
  });

  await prisma.novelBook.update({
    where: { id: bookId },
    data: { totalWords: result._sum.wordCount ?? 0 },
  });
}
