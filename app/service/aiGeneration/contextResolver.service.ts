import { createHash } from "node:crypto";
import { CategoryType, PromptPrivacy } from "@/app/generated/prisma/enums";
import { HttpError } from "@/app/lib/httpError";
import { prisma } from "@/app/lib/prisma";
import { decodeChapterContent } from "@/app/utils/chapterContentCodec";
import { resolveContextItems } from "./contextItem.service";

export interface GenerationCategoryContext {
  categoryId: number;
  content: string;
}

export interface GenerationContextInput {
  promptTemplateIds?: number[];
  promptInputs?: Record<string, unknown>;
  metadata?: {
    novelId?: number;
    chapterId?: number;
    promptTemplateId?: number;
    scene?: string;
    quickWriting?: {
      chapterFullTextCount?: number;
    };
  };
  contextItemIds?: number[];
  chapterIds?: number[];
  chapterSummaryIds?: number[];
  categoryContexts?: GenerationCategoryContext[];
  userMessage?: string;
}

export interface ResolvedGenerationContext {
  systemPromptText: string;
  renderedPrompt: string;
  contextText: string;
  finalUserPrompt: string;
  promptHash: string;
}

type EditorWritingActionId =
  | "aiContinueInline"
  | "aiPlotAdvice"
  | "aiExpandSelection";

const EDITOR_WRITING_ACTION_SCENES = new Set<string>([
  "aiContinueInline",
  "aiPlotAdvice",
  "aiExpandSelection",
]);

function resolveWritingActionId(
  scene: string | undefined,
): EditorWritingActionId | null {
  if (!scene || !EDITOR_WRITING_ACTION_SCENES.has(scene)) return null;
  return scene as EditorWritingActionId;
}

/** 判断 scene 是否为作品编辑器 AI 快捷写作动作标识。 */
export function isEditorWritingActionScene(scene: string | undefined): boolean {
  return resolveWritingActionId(scene) !== null;
}

function renderSceneContext(
  scene: string | undefined,
  writingActionId: EditorWritingActionId | null,
): string {
  if (!scene || writingActionId) return "";
  return `# 创作场景\n${scene}`;
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function renderTemplate(
  content: string,
  inputs: Record<string, unknown>,
): string {
  return content.replace(
    /\{\{\s*([^{}]+?)\s*\}\}/g,
    (_match, rawKey: string) => {
      const key = rawKey.trim();
      const value = inputs[key];
      if (value === undefined || value === null) return "";
      return typeof value === "string" ? value : JSON.stringify(value);
    },
  );
}

async function resolvePromptTemplates(
  userId: number,
  promptTemplateIds: number[] | undefined,
  promptInputs: Record<string, unknown>,
): Promise<string> {
  if (!promptTemplateIds?.length) return "";
  const prompts = await prisma.promptTemplate.findMany({
    where: { id: { in: promptTemplateIds } },
    select: {
      id: true,
      userId: true,
      content: true,
      privacy: true,
      isDeleted: true,
    },
  });

  // 按传入顺序排列
  const promptMap = new Map(prompts.map((p) => [p.id, p]));
  return promptTemplateIds
    .map((id) => {
      const prompt = promptMap.get(id);
      if (!prompt || prompt.isDeleted) throw new HttpError("提示词不存在", 404);
      if (
        prompt.privacy === PromptPrivacy.PRIVATE &&
        prompt.userId !== userId
      ) {
        throw new HttpError("无权使用该提示词", 403);
      }
      return renderTemplate(prompt.content, promptInputs);
    })
    .join("\n\n");
}

interface NormalizedGenerationCategoryContext {
  categoryId: number;
  content: string;
}

function normalizeCategoryContexts(
  categoryContexts: GenerationCategoryContext[] | undefined,
): NormalizedGenerationCategoryContext[] {
  if (!categoryContexts?.length) return [];
  const latestByCategory = new Map<number, string>();
  for (const item of categoryContexts) {
    const categoryId = Number(item.categoryId);
    if (!Number.isInteger(categoryId) || categoryId <= 0) continue;
    const content = item.content?.trim();
    if (!content) continue;
    latestByCategory.set(categoryId, content);
  }
  return [...latestByCategory.entries()].map(([categoryId, content]) => ({
    categoryId,
    content,
  }));
}

async function resolveCategoryNames(
  categoryIds: number[],
): Promise<Map<number, string>> {
  if (!categoryIds.length) return new Map();
  const categories = await prisma.category.findMany({
    where: { id: { in: categoryIds }, type: CategoryType.PROMPT },
    select: { id: true, name: true },
  });
  return new Map(categories.map((category) => [category.id, category.name]));
}

async function renderCategoryContexts(
  categoryContexts: NormalizedGenerationCategoryContext[],
): Promise<string> {
  const categoryNames = await resolveCategoryNames(
    categoryContexts.map((item) => item.categoryId),
  );
  return categoryContexts
    .map((item) => {
      const label = categoryNames.get(item.categoryId);
      return label ? `# ${label}\n${item.content}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

async function resolveUserPromptStateTemplateIds(
  userId: number,
  categoryContexts: NormalizedGenerationCategoryContext[],
): Promise<number[] | undefined> {
  const categoryIds = categoryContexts.map((item) => item.categoryId);
  if (!categoryIds.length) return undefined;

  const rows = await prisma.userPromptState.findMany({
    where: { userId, categoryId: { in: categoryIds } },
    select: { categoryId: true, promptTemplateId: true },
  });
  const promptPairs = categoryIds.flatMap((categoryId) => {
    const row = rows.find((item) => item.categoryId === categoryId);
    return row?.promptTemplateId
      ? [{ categoryId, promptTemplateId: row.promptTemplateId }]
      : [];
  });
  if (!promptPairs.length) return undefined;

  const prompts = await prisma.promptTemplate.findMany({
    where: { id: { in: promptPairs.map((item) => item.promptTemplateId) } },
    select: {
      id: true,
      userId: true,
      categoryId: true,
      privacy: true,
      isDeleted: true,
    },
  });
  const promptMap = new Map(prompts.map((prompt) => [prompt.id, prompt]));
  const resolvedIds: number[] = [];
  const seenIds = new Set<number>();

  for (const pair of promptPairs) {
    const prompt = promptMap.get(pair.promptTemplateId);
    if (!prompt || prompt.isDeleted) continue;
    if (prompt.categoryId !== pair.categoryId) continue;
    if (prompt.privacy === PromptPrivacy.PRIVATE && prompt.userId !== userId) {
      continue;
    }
    if (seenIds.has(prompt.id)) continue;
    seenIds.add(prompt.id);
    resolvedIds.push(prompt.id);
  }

  return resolvedIds.length ? resolvedIds : undefined;
}

async function resolveEffectivePromptTemplateIds(
  userId: number,
  input: GenerationContextInput,
  writingActionId: EditorWritingActionId | null,
  categoryContexts: NormalizedGenerationCategoryContext[],
): Promise<number[] | undefined> {
  const explicitPromptTemplateIds =
    input.promptTemplateIds ??
    (input.metadata?.promptTemplateId
      ? [input.metadata.promptTemplateId]
      : undefined);
  if (explicitPromptTemplateIds?.length) return explicitPromptTemplateIds;
  if (!writingActionId) return undefined;
  return resolveUserPromptStateTemplateIds(userId, categoryContexts);
}

function chapterBody(chapter: { content: Uint8Array | null }): string {
  if (!chapter.content) return "";
  try {
    return decodeChapterContent(chapter.content);
  } catch {
    return "[章节正文解密失败]";
  }
}

function normalizeQuickWritingChapterFullTextCount(
  quickWriting: unknown,
): number | null {
  if (
    !quickWriting ||
    typeof quickWriting !== "object" ||
    Array.isArray(quickWriting)
  ) {
    return null;
  }
  const value = (quickWriting as Record<string, unknown>).chapterFullTextCount;
  const parsed = Number(value);
  const count = Number.isFinite(parsed) ? Math.trunc(parsed) : 3;
  return Math.min(20, Math.max(0, count));
}

/**
 * 按章节 ID 获取章节内容，拼接为前文。chapterIds 用正文，chapterSummaryIds 用概要。
 * @param userId 当前用户 ID。
 * @param novelId 作品 ID。
 * @param fullChapterIds 正文章节 ID 数组。
 * @param summaryChapterIds 概要章节 ID 数组。
 * @returns 前文文本。
 */
async function resolveChapterContents(
  userId: number,
  novelId: number,
  fullChapterIds: number[],
  summaryChapterIds: number[],
): Promise<string> {
  const normalize = (ids: number[]) => [
    ...new Set(
      ids.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0),
    ),
  ];
  const fullIds = normalize(fullChapterIds);
  const summaryIds = normalize(summaryChapterIds);
  const allIds = [...new Set([...fullIds, ...summaryIds])];
  if (!allIds.length) return "";
  const chapters = await prisma.novelChapter.findMany({
    where: {
      id: { in: allIds },
      book: { id: novelId, userId, isTrash: false },
    },
    select: {
      id: true,
      title: true,
      summary: true,
      content: true,
      order: true,
    },
    orderBy: { order: "asc" },
  });
  if (chapters.length !== allIds.length) {
    throw new HttpError("章节不存在或无权访问", 404);
  }
  const summarySet = new Set(summaryIds);
  const rendered = chapters.map((chapter) => {
    let body = "";
    if (summarySet.has(chapter.id)) {
      body = chapter.summary ?? "";
    } else {
      body = chapterBody(chapter);
    }
    return `## 第${chapter.order}章：${chapter.title}\n${body}`;
  });
  return rendered.join("\n\n");
}

function hasExplicitChapterSelection(input: GenerationContextInput): boolean {
  return !!(input.chapterIds?.length || input.chapterSummaryIds?.length);
}

async function resolveQuickWritingChapterContents(
  userId: number,
  novelId: number | undefined,
  chapterId: number | undefined,
  fullTextCount: number | null,
): Promise<string> {
  if (fullTextCount === null) return "";
  if (!novelId || !chapterId) return "";
  if (
    !Number.isInteger(novelId) ||
    novelId <= 0 ||
    !Number.isInteger(chapterId) ||
    chapterId <= 0
  ) {
    return "";
  }

  const currentChapter = await prisma.novelChapter.findFirst({
    where: {
      id: chapterId,
      book: { id: novelId, userId, isTrash: false },
    },
    select: { order: true },
  });
  if (!currentChapter) throw new HttpError("章节不存在或无权访问", 404);

  const chapters = await prisma.novelChapter.findMany({
    where: {
      bookId: novelId,
      order: { lt: currentChapter.order },
      book: { userId, isTrash: false },
    },
    select: {
      id: true,
      title: true,
      summary: true,
      content: true,
      order: true,
    },
    orderBy: [{ order: "asc" }, { id: "asc" }],
  });
  if (!chapters.length) return "";

  const fullTextStartIndex = Math.max(0, chapters.length - fullTextCount);
  return chapters
    .map((chapter, index) => {
      const summary = chapter.summary?.trim() ?? "";
      const body =
        index >= fullTextStartIndex
          ? chapterBody(chapter)
          : summary || chapterBody(chapter);
      return `## 第${chapter.order}章：${chapter.title}\n${body}`;
    })
    .join("\n\n");
}

function normalizeRenderedPrompt(
  renderedTemplate: string,
  userMessage: string | undefined,
): string {
  const renderedPrompt = userMessage?.trim() ?? "";
  if (!renderedTemplate && !renderedPrompt) {
    throw new HttpError(
      "必须提供 promptTemplateIds、userMessage 或分类提示词状态",
      422,
    );
  }
  return renderedPrompt;
}

/**
 * 解析前端结构化生成输入为最终 prompt 与上下文块。
 * @param userId 当前用户 ID。
 * @param input 生成上下文输入。
 * @returns 渲染后的 prompt 与上下文。
 */
export async function resolveGenerationContext(
  userId: number,
  input: GenerationContextInput,
): Promise<ResolvedGenerationContext> {
  const promptInputs = input.promptInputs ?? {};
  const writingActionId = resolveWritingActionId(input.metadata?.scene);
  const normalizedCategoryContexts = normalizeCategoryContexts(
    input.categoryContexts,
  );
  const promptTemplateIds = await resolveEffectivePromptTemplateIds(
    userId,
    input,
    writingActionId,
    normalizedCategoryContexts,
  );
  const renderedTemplate = await resolvePromptTemplates(
    userId,
    promptTemplateIds,
    promptInputs,
  );
  const selectedContext = await resolveContextItems(userId, {
    novelId: input.metadata?.novelId,
    chapterId: input.metadata?.chapterId,
    contextItemIds: input.contextItemIds,
  });

  const renderedPrompt = normalizeRenderedPrompt(
    renderedTemplate,
    input.userMessage,
  );
  const categoryContextText = await renderCategoryContexts(
    normalizedCategoryContexts,
  );
  const explicitChapterSelection = hasExplicitChapterSelection(input);
  const quickWritingChapterFullTextCount = explicitChapterSelection
    ? null
    : normalizeQuickWritingChapterFullTextCount(input.metadata?.quickWriting);
  const chapterText = explicitChapterSelection
    ? input.metadata?.novelId
      ? await resolveChapterContents(
          userId,
          input.metadata.novelId,
          input.chapterIds ?? [],
          input.chapterSummaryIds ?? [],
        )
      : ""
    : await resolveQuickWritingChapterContents(
        userId,
        input.metadata?.novelId,
        input.metadata?.chapterId,
        quickWritingChapterFullTextCount,
      );
  const contextText = [
    renderSceneContext(input.metadata?.scene, writingActionId),
    selectedContext ? `# 用户选择的上下文素材\n${selectedContext}` : "",
    categoryContextText,
    chapterText ? `# 前文\n${chapterText}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const finalUserPrompt = [contextText, renderedPrompt]
    .filter(Boolean)
    .join("\n\n");
  const systemPromptText = renderedTemplate;

  return {
    systemPromptText,
    renderedPrompt,
    contextText,
    finalUserPrompt,
    promptHash: sha256(`${systemPromptText}\n\n${finalUserPrompt}`),
  };
}
