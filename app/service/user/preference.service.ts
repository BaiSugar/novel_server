import { prisma } from "@/app/lib/prisma";

type EditorAiQuickActionId =
  | "aiContinueInline"
  | "aiPlotAdvice"
  | "aiExpandSelection";

type EditorAiPromptMode = "default" | "custom";
type EditorAiContextMode = "auto" | "cursorWindow" | "fullChapter";

export interface EditorAiQuickActionBinding {
  actionId: EditorAiQuickActionId;
  key: string;
  enabled: boolean;
}

export interface EditorAiQuickActionSetting {
  actionId: EditorAiQuickActionId;
  promptMode: EditorAiPromptMode;
  promptCategoryId: number | null;
  promptCategoryName: string | null;
  promptTemplateId: number | null;
  promptTemplateLabel: string | null;
  customPrompt: string;
  contextMode: EditorAiContextMode;
  contextBeforeMaxLength: number;
  contextAfterMaxLength: number;
  chapterFullTextCount: number;
}

export interface EditorAiQuickActionsPreference {
  version: 4;
  bindings: EditorAiQuickActionBinding[];
  actionSettings: EditorAiQuickActionSetting[];
  updatedAt: string | null;
}

interface UserPreferenceRow {
  value: unknown;
  updatedAt: Date | string;
}

const EDITOR_AI_QUICK_ACTIONS_KEY = "editor-ai-quick-actions";
const VERSION = 4 as const;
const ACTION_IDS = [
  "aiContinueInline",
  "aiPlotAdvice",
  "aiExpandSelection",
] as const satisfies readonly EditorAiQuickActionId[];

const DEFAULT_BINDINGS: Record<
  EditorAiQuickActionId,
  Omit<EditorAiQuickActionBinding, "actionId">
> = {
  aiContinueInline: { key: "Alt+1", enabled: true },
  aiPlotAdvice: { key: "Alt+2", enabled: true },
  aiExpandSelection: { key: "Alt+3", enabled: true },
};

const DEFAULT_CONTEXT_MODE: Record<EditorAiQuickActionId, EditorAiContextMode> =
  {
    aiContinueInline: "auto",
    aiPlotAdvice: "fullChapter",
    aiExpandSelection: "auto",
  };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isActionId(value: unknown): value is EditorAiQuickActionId {
  return (
    typeof value === "string" &&
    ACTION_IDS.includes(value as EditorAiQuickActionId)
  );
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nullablePositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function integerValue(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function clampInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  return Math.min(max, Math.max(min, integerValue(value, fallback)));
}

function chapterFullTextCount(value: unknown): number {
  return clampInteger(value, 3, 0, 20);
}

function promptMode(value: unknown): EditorAiPromptMode {
  return value === "custom" ? "custom" : "default";
}

function contextMode(
  value: unknown,
  actionId: EditorAiQuickActionId,
): EditorAiContextMode {
  if (value === "auto" || value === "cursorWindow" || value === "fullChapter") {
    return value;
  }
  return DEFAULT_CONTEXT_MODE[actionId];
}

function defaultSetting(
  actionId: EditorAiQuickActionId,
): EditorAiQuickActionSetting {
  return {
    actionId,
    promptMode: "default",
    promptCategoryId: null,
    promptCategoryName: null,
    promptTemplateId: null,
    promptTemplateLabel: null,
    customPrompt: "",
    contextMode: DEFAULT_CONTEXT_MODE[actionId],
    contextBeforeMaxLength: 4000,
    contextAfterMaxLength: 1200,
    chapterFullTextCount: 3,
  };
}

function normalizeBinding(
  actionId: EditorAiQuickActionId,
  raw: unknown,
): EditorAiQuickActionBinding {
  const source = isRecord(raw) ? raw : {};
  const fallback = DEFAULT_BINDINGS[actionId];
  return {
    actionId,
    key: stringValue(source.key, fallback.key).trim() || fallback.key,
    enabled: booleanValue(source.enabled, fallback.enabled),
  };
}

function normalizeSetting(
  actionId: EditorAiQuickActionId,
  raw: unknown,
): EditorAiQuickActionSetting {
  const fallback = defaultSetting(actionId);
  const source = isRecord(raw) ? raw : {};
  const mode = promptMode(source.promptMode);
  return {
    actionId,
    promptMode: mode,
    promptCategoryId:
      mode === "custom"
        ? null
        : nullablePositiveInteger(source.promptCategoryId),
    promptCategoryName:
      mode === "custom" ? null : nullableString(source.promptCategoryName),
    promptTemplateId:
      mode === "custom"
        ? null
        : nullablePositiveInteger(source.promptTemplateId),
    promptTemplateLabel:
      mode === "custom" ? null : nullableString(source.promptTemplateLabel),
    customPrompt: stringValue(source.customPrompt).trim().slice(0, 1200),
    contextMode: contextMode(source.contextMode, actionId),
    contextBeforeMaxLength: clampInteger(
      source.contextBeforeMaxLength,
      fallback.contextBeforeMaxLength,
      200,
      20000,
    ),
    contextAfterMaxLength: clampInteger(
      source.contextAfterMaxLength,
      fallback.contextAfterMaxLength,
      200,
      20000,
    ),
    chapterFullTextCount: chapterFullTextCount(source.chapterFullTextCount),
  };
}

function byActionId(items: unknown): Map<EditorAiQuickActionId, unknown> {
  const map = new Map<EditorAiQuickActionId, unknown>();
  if (!Array.isArray(items)) return map;
  for (const item of items) {
    if (!isRecord(item) || !isActionId(item.actionId)) continue;
    map.set(item.actionId, item);
  }
  return map;
}

function toIsoDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function normalizePreference(
  value: unknown,
  updatedAt: Date | string | null,
): EditorAiQuickActionsPreference {
  const source = isRecord(value) ? value : {};
  const bindingsByAction = byActionId(source.bindings);
  const settingsByAction = byActionId(source.actionSettings);
  return {
    version: VERSION,
    bindings: ACTION_IDS.map((actionId) =>
      normalizeBinding(actionId, bindingsByAction.get(actionId)),
    ),
    actionSettings: ACTION_IDS.map((actionId) =>
      normalizeSetting(actionId, settingsByAction.get(actionId)),
    ),
    updatedAt: toIsoDate(updatedAt),
  };
}

function parseStoredValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** 获取编辑器 AI 快捷写作偏好。 */
export async function getEditorAiQuickActions(
  userId: number,
): Promise<EditorAiQuickActionsPreference> {
  const rows = await prisma.$queryRaw<UserPreferenceRow[]>`
    SELECT value, updated_at AS updatedAt
    FROM user_preferences
    WHERE user_id = ${userId} AND \`key\` = ${EDITOR_AI_QUICK_ACTIONS_KEY}
    LIMIT 1
  `;
  const row = rows[0];
  return normalizePreference(
    row ? parseStoredValue(row.value) : null,
    row?.updatedAt ?? null,
  );
}

/** 保存编辑器 AI 快捷写作偏好。 */
export async function saveEditorAiQuickActions(
  userId: number,
  input: unknown,
): Promise<EditorAiQuickActionsPreference> {
  const normalized = normalizePreference(input, null);
  const persistedValue = {
    version: normalized.version,
    bindings: normalized.bindings,
    actionSettings: normalized.actionSettings,
  };
  await prisma.$executeRaw`
    INSERT INTO user_preferences (user_id, \`key\`, value, created_at, updated_at)
    VALUES (${userId}, ${EDITOR_AI_QUICK_ACTIONS_KEY}, ${JSON.stringify(persistedValue)}, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
    ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = CURRENT_TIMESTAMP(3)
  `;
  return getEditorAiQuickActions(userId);
}
