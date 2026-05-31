import { logger } from "@/app/lib/logger";
import * as ContextItemService from "@/app/service/contextLibrary/contextItem.service";

const MAX_ITEMS_PER_SOURCE = 12;
const MAX_FIELD_LENGTH = 4000;
const MAX_NAME_LENGTH = 128;

export type SyncSourceKey = "character" | "glossary";

interface ChapterContextSyncInput {
  userId: number;
  novelId: number;
  chapterId: number;
  characters?: unknown;
  glossary?: unknown;
}

interface ExtractedCharacter {
  name: string;
  gender?: string;
  personality?: string;
  background?: string;
  appearance?: string;
  folderPath?: string[];
}

interface ExtractedGlossary {
  name: string;
  definition: string;
  folderPath?: string[];
}

interface NormalizedSyncItem {
  data: Record<string, string>;
  folderPath?: string[];
}

export interface ChapterContextSyncItemResult {
  id: number;
  title: string;
  sourceKey: SyncSourceKey;
  folderId: number | null;
  folderPath: string[];
  action: "created" | "updated";
}

export interface ChapterContextSyncResult {
  ok: true;
  chapterId: number;
  characterCount: number;
  glossaryCount: number;
  createdCount: number;
  updatedCount: number;
  items: ChapterContextSyncItemResult[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeFolderPath(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const names = value
    .map((item) => text(item, 128))
    .filter(Boolean)
    .slice(0, 1);
  return names.length ? names : undefined;
}

function normalizeCharacters(value: unknown): ExtractedCharacter[] {
  if (!Array.isArray(value)) return [];
  const items: ExtractedCharacter[] = [];
  const names = new Set<string>();
  for (const raw of value) {
    if (!isObject(raw)) continue;
    const name = text(raw.name, MAX_NAME_LENGTH);
    if (!name || names.has(name)) continue;
    names.add(name);
    items.push({
      name,
      gender: text(raw.gender, 32),
      personality: text(raw.personality, 2000),
      background: text(raw.background, MAX_FIELD_LENGTH),
      appearance: text(raw.appearance, 2000),
      folderPath: normalizeFolderPath(raw.folderPath),
    });
    if (items.length >= MAX_ITEMS_PER_SOURCE) break;
  }
  return items;
}

function normalizeGlossary(value: unknown): ExtractedGlossary[] {
  if (!Array.isArray(value)) return [];
  const items: ExtractedGlossary[] = [];
  const names = new Set<string>();
  for (const raw of value) {
    if (!isObject(raw)) continue;
    const name = text(raw.name, MAX_NAME_LENGTH);
    const definition = text(raw.definition, MAX_FIELD_LENGTH);
    if (!name || !definition || names.has(name)) continue;
    names.add(name);
    items.push({
      name,
      definition,
      folderPath: normalizeFolderPath(raw.folderPath),
    });
    if (items.length >= MAX_ITEMS_PER_SOURCE) break;
  }
  return items;
}

async function upsertItems(
  input: ChapterContextSyncInput,
  sourceKey: SyncSourceKey,
  items: NormalizedSyncItem[],
): Promise<ChapterContextSyncItemResult[]> {
  const results: ChapterContextSyncItemResult[] = [];
  for (const itemInput of items) {
    const { item, action } = await ContextItemService.upsertByTitle(
      input.userId,
      {
        novelId: input.novelId,
        sourceKey,
        folderPath: itemInput.folderPath,
        data: itemInput.data,
      },
    );
    results.push({
      id: item.id,
      title: item.title,
      sourceKey,
      folderId: item.folderId,
      folderPath: itemInput.folderPath ?? [],
      action,
    });
  }
  return results;
}

/**
 * 章节正文生成过程中，由当前模型通过内部工具同步维护角色和词条。
 */
export async function syncChapterContextItems(
  input: ChapterContextSyncInput,
): Promise<ChapterContextSyncResult> {
  const characters = normalizeCharacters(input.characters);
  const glossary = normalizeGlossary(input.glossary);
  const characterItems = await upsertItems(
    input,
    "character",
    characters.map((item) => ({
      data: {
        name: item.name,
        gender: item.gender ?? "",
        personality: item.personality ?? "",
        background: item.background ?? "",
        appearance: item.appearance ?? "",
      },
      folderPath: item.folderPath,
    })),
  );
  const glossaryItems = await upsertItems(
    input,
    "glossary",
    glossary.map((item) => ({
      data: {
        name: item.name,
        definition: item.definition,
      },
      folderPath: item.folderPath,
    })),
  );
  const characterCount = characterItems.length;
  const glossaryCount = glossaryItems.length;
  const syncedItems = [...characterItems, ...glossaryItems];
  const createdCount = syncedItems.filter(
    (item) => item.action === "created",
  ).length;
  const updatedCount = syncedItems.filter(
    (item) => item.action === "updated",
  ).length;

  logger.info("[aiGeneration] chapter context sync tool executed", {
    jobScope: "chapter-context-sync",
    novelId: input.novelId,
    chapterId: input.chapterId,
    characterCount,
    glossaryCount,
    createdCount,
    updatedCount,
  });

  return {
    ok: true,
    chapterId: input.chapterId,
    characterCount,
    glossaryCount,
    createdCount,
    updatedCount,
    items: syncedItems,
  };
}
