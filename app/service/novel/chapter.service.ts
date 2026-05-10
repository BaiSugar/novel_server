import type { NovelChapterModel } from "@/app/generated/prisma/models/NovelChapter";
import { HttpError } from "@/app/lib/httpError";
import { prisma } from "@/app/lib/prisma";
import {
  decodeChapterContent,
  encodeChapterContent,
} from "@/app/utils/chapterContentCodec";
import { recountWords } from "./novel.service";

/** 创建章节入参。 */
export interface CreateChapterInput {
  /** 章节标题。 */
  title: string;
  /** 章节正文。 */
  content?: string;
}

/** 更新章节入参。 */
export interface UpdateChapterInput {
  /** 章节标题。 */
  title?: string;
  /** 章节正文。 */
  content?: string;
}

/** API 返回的章节信息。 */
export type ChapterOutput = Omit<NovelChapterModel, "content"> & {
  /** 解密解压后的章节正文。 */
  content: string | null;
};

/** 章节安全字段选择。 */
const CHAPTER_SELECT = {
  id: true,
  bookId: true,
  title: true,
  content: true,
  order: true,
  wordCount: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * 获取作品下所有章节。
 * @param bookId 作品 ID。
 * @returns 章节列表。
 */
export async function listByBook(bookId: number): Promise<ChapterOutput[]> {
  const chapters = await prisma.novelChapter.findMany({
    where: { bookId },
    select: CHAPTER_SELECT,
    orderBy: [{ order: "asc" }, { id: "asc" }],
  });

  return chapters.map(decodeChapterOutput);
}

/**
 * 获取章节详情。
 * @param chapterId 章节 ID。
 * @returns 章节信息。
 */
export async function detail(chapterId: number): Promise<ChapterOutput> {
  const chapter = await prisma.novelChapter.findUnique({
    where: { id: chapterId },
    select: CHAPTER_SELECT,
  });

  if (!chapter) throw new HttpError("章节不存在", 404);
  return decodeChapterOutput(chapter);
}

/**
 * 创建章节。
 * @param bookId 作品 ID。
 * @param input 创建入参。
 * @returns 新章节。
 */
export async function create(bookId: number, input: CreateChapterInput) {
  const maxOrder = await prisma.novelChapter.aggregate({
    where: { bookId },
    _max: { order: true },
  });

  const chapter = await prisma.novelChapter.create({
    data: {
      bookId,
      title: input.title,
      content: input.content === undefined ? undefined : encodeChapterContent(input.content),
      order: (maxOrder._max.order ?? -1) + 1,
      wordCount: input.content ? input.content.length : 0,
    },
    select: CHAPTER_SELECT,
  });

  await recountWords(bookId);
  return decodeChapterOutput(chapter);
}

/**
 * 更新章节。
 * @param chapterId 章节 ID。
 * @param input 更新入参。
 * @returns 更新后的章节。
 */
export async function update(chapterId: number, input: UpdateChapterInput) {
  const chapter = await prisma.novelChapter.findUnique({
    where: { id: chapterId },
    select: { id: true, bookId: true },
  });

  if (!chapter) throw new HttpError("章节不存在", 404);

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.content !== undefined) {
    data.content = encodeChapterContent(input.content);
    data.wordCount = input.content.length;
  }

  const updated = await prisma.novelChapter.update({
    where: { id: chapterId },
    data,
    select: CHAPTER_SELECT,
  });

  await recountWords(chapter.bookId);
  return decodeChapterOutput(updated);
}

function decodeChapterOutput(chapter: NovelChapterModel): ChapterOutput {
  return {
    ...chapter,
    content: chapter.content ? decodeChapterContent(chapter.content) : null,
  };
}

/**
 * 删除章节。
 * @param chapterId 章节 ID。
 */
export async function remove(chapterId: number): Promise<void> {
  const chapter = await prisma.novelChapter.findUnique({
    where: { id: chapterId },
    select: { id: true, bookId: true },
  });

  if (!chapter) throw new HttpError("章节不存在", 404);

  await prisma.novelChapter.delete({ where: { id: chapterId } });
  await recountWords(chapter.bookId);
}

/**
 * 重新排序章节。
 * @param bookId 作品 ID。
 * @param chapterIds 新排序的章节 ID 列表（按顺序）。
 */
export async function reorder(bookId: number, chapterIds: number[]): Promise<void> {
  const updates = chapterIds.map((id, index) =>
    prisma.novelChapter.update({
      where: { id, bookId },
      data: { order: index },
    }),
  );

  await prisma.$transaction(updates);
}