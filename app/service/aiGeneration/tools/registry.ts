import { PromptPrivacy } from "@/app/generated/prisma/enums";
import { HttpError } from "@/app/lib/httpError";
import { prisma } from "@/app/lib/prisma";
import type { ChatToolDefinition } from "@/app/service/aiModel/adapter/types";
import * as ChapterService from "@/app/service/novel/chapter.service";
import * as NovelService from "@/app/service/novel/novel.service";
import * as PromptService from "@/app/service/prompt/prompt.service";
import { decodeChapterContent } from "@/app/utils/chapterContentCodec";
import type { AgentToolContext, AgentToolDefinition } from "./types";

function asObject(value: unknown, toolName: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(`${toolName} 的参数必须是对象`, 422);
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown, field: string): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  throw new HttpError(`参数 ${field} 必须是字符串`, 422);
}

function readOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return readString(value, "value");
}

function readNumber(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed))
    throw new HttpError(`参数 ${field} 必须是数字`, 422);
  return parsed;
}

function readOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return readNumber(value, "value");
}

function readBoolean(value: unknown, field: string): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new HttpError(`参数 ${field} 必须是布尔值`, 422);
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return readBoolean(value, "value");
}

function truncate(text: string, maxChars = 8192): string {
  return text.length > maxChars
    ? `${text.slice(0, maxChars)}\n...[TRUNCATED]`
    : text;
}

function serializeResult(result: unknown): string {
  if (typeof result === "string") return truncate(result);
  try {
    return truncate(JSON.stringify(result, null, 2) ?? String(result));
  } catch {
    return truncate(String(result));
  }
}

function ensureNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new HttpError("客户端已断开", 499, "CLIENT_DISCONNECTED");
  }
}

const TOOL_DEFINITIONS: AgentToolDefinition[] = [
  {
    name: "novel.list",
    description: "列出当前用户的作品列表，仅返回只读摘要信息。",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", minimum: 1 },
        pageSize: { type: "number", minimum: 1, maximum: 100 },
        archived: { type: "boolean" },
        isTrash: { type: "boolean" },
        keyword: { type: "string", maxLength: 128 },
      },
      additionalProperties: false,
    },
    async execute({ userId }, input) {
      const args = asObject(input, "novel.list");
      return NovelService.list(userId, {
        page: readOptionalNumber(args.page),
        pageSize: readOptionalNumber(args.pageSize),
        archived: readOptionalBoolean(args.archived),
        isTrash: readOptionalBoolean(args.isTrash),
        keyword: readOptionalString(args.keyword),
      });
    },
  },
  {
    name: "novel.detail",
    description: "获取当前用户某个作品的详情。",
    inputSchema: {
      type: "object",
      properties: {
        bookId: { type: "number", minimum: 1 },
      },
      required: ["bookId"],
      additionalProperties: false,
    },
    async execute({ userId }, input) {
      const args = asObject(input, "novel.detail");
      return NovelService.detail(readNumber(args.bookId, "bookId"), userId);
    },
  },
  {
    name: "chapter.list",
    description: "列出指定作品下的章节。",
    inputSchema: {
      type: "object",
      properties: {
        bookId: { type: "number", minimum: 1 },
      },
      required: ["bookId"],
      additionalProperties: false,
    },
    async execute({ userId }, input) {
      const args = asObject(input, "chapter.list");
      const bookId = readNumber(args.bookId, "bookId");
      await NovelService.detail(bookId, userId);
      return ChapterService.listByBook(bookId);
    },
  },
  {
    name: "chapter.detail",
    description: "获取指定章节的详情。",
    inputSchema: {
      type: "object",
      properties: {
        chapterId: { type: "number", minimum: 1 },
      },
      required: ["chapterId"],
      additionalProperties: false,
    },
    async execute({ userId }, input) {
      const args = asObject(input, "chapter.detail");
      const chapterId = readNumber(args.chapterId, "chapterId");
      const chapter = await prisma.novelChapter.findFirst({
        where: { id: chapterId, book: { userId } },
        select: {
          id: true,
          bookId: true,
          title: true,
          content: true,
          order: true,
          wordCount: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      if (!chapter) throw new HttpError("章节不存在", 404);
      return {
        ...chapter,
        content: chapter.content ? decodeChapterContent(chapter.content) : null,
      };
    },
  },
  {
    name: "prompt.list",
    description: "列出当前用户可访问的提示词模板。",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", minimum: 1 },
        pageSize: { type: "number", minimum: 1, maximum: 100 },
        keyword: { type: "string", maxLength: 128 },
        categoryId: { type: "number", minimum: 1 },
        privacy: {
          type: "string",
          enum: [PromptPrivacy.PRIVATE, PromptPrivacy.SHARED],
        },
        approved: { type: "boolean" },
      },
      additionalProperties: false,
    },
    async execute({ userId }, input) {
      const args = asObject(input, "prompt.list");
      return PromptService.list(userId, {
        page: readOptionalNumber(args.page),
        pageSize: readOptionalNumber(args.pageSize),
        keyword: readOptionalString(args.keyword),
        categoryId: readOptionalNumber(args.categoryId),
        privacy:
          typeof args.privacy === "string"
            ? (args.privacy as PromptPrivacy)
            : undefined,
        approved: readOptionalBoolean(args.approved),
      });
    },
  },
  {
    name: "prompt.detail",
    description: "获取指定提示词模板的详情。",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", minimum: 1 },
      },
      required: ["id"],
      additionalProperties: false,
    },
    async execute({ userId }, input) {
      const args = asObject(input, "prompt.detail");
      return PromptService.detail(readNumber(args.id, "id"), userId);
    },
  },
];

const TOOL_MAP = new Map(
  TOOL_DEFINITIONS.map((tool) => [tool.name, tool] as const),
);

/**
 * 获取可用于模型调用的工具定义。
 * @param allowedNames 工具白名单，未传时返回全部内部只读工具。
 * @returns 模型工具定义。
 */
export function listAgentToolDefinitions(
  allowedNames?: string[],
): ChatToolDefinition[] {
  if (!allowedNames?.length) {
    return TOOL_DEFINITIONS.map(
      ({ execute: _execute, ...definition }) => definition,
    );
  }

  const names = [
    ...new Set(allowedNames.map((name) => name.trim()).filter(Boolean)),
  ];
  for (const name of names) {
    if (!TOOL_MAP.has(name))
      throw new HttpError(`不支持的内部工具：${name}`, 422);
  }
  return names.map((name) => {
    const tool = TOOL_MAP.get(name)!;
    const { execute: _execute, ...definition } = tool;
    return definition;
  });
}

/**
 * 执行内部只读工具。
 * @param context 工具执行上下文。
 * @param toolName 工具名。
 * @param input 工具参数。
 * @returns 工具原始结果。
 */
export async function executeAgentTool(
  context: AgentToolContext,
  toolName: string,
  input: unknown,
): Promise<unknown> {
  ensureNotAborted(context.signal);
  const tool = TOOL_MAP.get(toolName);
  if (!tool) throw new HttpError(`不支持的内部工具：${toolName}`, 422);
  const result = await tool.execute(context, input as Record<string, unknown>);
  ensureNotAborted(context.signal);
  return result;
}

/**
 * 将工具结果序列化为可回填给模型的文本。
 * @param result 工具执行结果。
 * @returns 序列化后的文本。
 */
export function serializeAgentToolResult(result: unknown): string {
  return serializeResult(result);
}
