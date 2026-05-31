import { CategoryType, PromptPrivacy } from "@/app/generated/prisma/enums";
import type { PromptTemplateModel } from "@/app/generated/prisma/models/PromptTemplate";
import { HttpError } from "@/app/lib/httpError";
import { prisma } from "@/app/lib/prisma";
import * as CategoryService from "@/app/service/category/category.service";

// ---------- 类型定义 ----------

/** 提示词列表查询参数。 */
export interface PromptListParams {
  /** 页码（从 1 开始）。 */
  page?: number;
  /** 每页数量。 */
  pageSize?: number;
  /** 按隐私设置筛选。 */
  privacy?: PromptPrivacy;
  /** 按审核状态筛选。 */
  approved?: boolean;
  /** 搜索关键词（匹配名称/介绍）。 */
  keyword?: string;
  /** 按分类筛选；不传或 0 表示全部。 */
  categoryId?: number;
}

/** 创建提示词入参。 */
export interface CreatePromptInput {
  name: string;
  content: string;
  presetOptions?: unknown;
  description?: string;
  privacy: PromptPrivacy;
  usageGuide?: string;
  categoryId?: number | null;
}

/** 更新提示词入参。 */
export interface UpdatePromptInput {
  name?: string;
  content?: string;
  presetOptions?: unknown;
  description?: string | null;
  privacy?: PromptPrivacy;
  usageGuide?: string | null;
  categoryId?: number | null;
}

/** API 返回的提示词详情：作者编辑场景可包含正文，其它场景仅返回参数和元数据。 */
export type PromptOutput = Omit<PromptTemplateModel, "content"> & {
  content?: string;
  /** 历史版本数量。 */
  versionCount: number;
  /** 所属分类显示名（未分类为 null）。 */
  category: string | null;
  /** 作者用户名。 */
  authorName: string | null;
};

/** API 返回的提示词列表项（不含 content，含 presetOptions）。 */
export type PromptListItem = Omit<PromptOutput, "content"> & {
  /** 作者用户名。 */
  authorName: string | null;
};

/** 版本列表项。 */
export interface VersionListItem {
  id: number;
  version: number;
  name: string;
  description: string | null;
  usageGuide: string | null;
  changeNote: string | null;
  createdAt: Date;
}

/** 版本详情：作者编辑场景可包含正文，仍保留参数快照。 */
export type VersionDetail = VersionListItem & {
  content?: string;
  presetOptions: unknown | null;
};

// ---------- 字段选择 ----------

const PROMPT_SELECT = {
  id: true,
  userId: true,
  name: true,
  content: true,
  presetOptions: true,
  description: true,
  privacy: true,
  categoryId: true,
  usageGuide: true,
  isApproved: true,
  isDeleted: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { name: true } },
  user: { select: { username: true } },
  _count: { select: { versions: true } },
} as const;

const PROMPT_LIST_SELECT = {
  id: true,
  userId: true,
  name: true,
  presetOptions: true,
  description: true,
  privacy: true,
  categoryId: true,
  usageGuide: true,
  isApproved: true,
  isDeleted: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { name: true } },
  user: { select: { username: true } },
  _count: { select: { versions: true } },
} as const;

// ---------- 查询辅助 ----------

function mapPromptOutput(
  row: Record<string, unknown>,
  includeContent = false,
): PromptOutput {
  const count = (row._count as { versions: number })?.versions ?? 0;
  const category = (row.category as { name: string } | null)?.name ?? null;
  const authorName =
    (row.user as { username: string } | null | undefined)?.username ?? null;
  const { _count: _, category: __, content, user: __user, ...rest } = row;
  return {
    ...rest,
    ...(includeContent && typeof content === "string" ? { content } : {}),
    versionCount: count,
    category,
    authorName,
  } as PromptOutput;
}

function mapPromptListItem(row: Record<string, unknown>): PromptListItem {
  const authorName =
    (row.user as { username: string } | null | undefined)?.username ?? null;
  const { user: _, ...rest } = row;
  return {
    ...mapPromptOutput(rest),
    authorName,
  };
}

/**
 * 是否计入分类公开提示词数量。
 * promptCount 只统计 SHARED + isApproved=true 的提示词。
 */
function isPublicCounted(prompt: {
  categoryId: number | null;
  privacy: PromptPrivacy;
  isApproved: boolean;
  isDeleted?: boolean;
}): prompt is typeof prompt & { categoryId: number } {
  return Boolean(
    prompt.categoryId &&
      prompt.privacy === PromptPrivacy.SHARED &&
      prompt.isApproved &&
      !prompt.isDeleted,
  );
}

/**
 * 根据更新前后状态维护 promptCount 冗余字段。
 * @param before 更新前状态。
 * @param after 更新后状态。
 */
async function syncPromptCount(
  before: {
    categoryId: number | null;
    privacy: PromptPrivacy;
    isApproved: boolean;
    isDeleted?: boolean;
  },
  after: {
    categoryId: number | null;
    privacy: PromptPrivacy;
    isApproved: boolean;
    isDeleted?: boolean;
  },
): Promise<void> {
  const beforeCounted = isPublicCounted(before);
  const afterCounted = isPublicCounted(after);

  if (
    beforeCounted &&
    (!afterCounted || before.categoryId !== after.categoryId)
  ) {
    await CategoryService.adjustPromptCount(before.categoryId, -1);
  }
  if (
    afterCounted &&
    (!beforeCounted || before.categoryId !== after.categoryId)
  ) {
    await CategoryService.adjustPromptCount(after.categoryId, 1);
  }
}

// ---------- 列表 ----------

/**
 * 分页查询提示词列表。
 * @param currentUserId 当前用户 ID。
 * @param params 查询参数。
 * @returns 分页结果。
 */
export async function list(
  currentUserId: number,
  params: PromptListParams = {},
) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;

  const where: Record<string, unknown> = { isDeleted: false };
  if (params.privacy !== undefined) where.privacy = params.privacy;
  if (params.approved !== undefined) where.isApproved = params.approved;
  if (params.categoryId !== undefined && params.categoryId > 0) {
    where.categoryId = params.categoryId;
  }
  if (params.keyword) {
    where.OR = [
      { name: { contains: params.keyword } },
      { description: { contains: params.keyword } },
    ];
  }

  // 隐私过滤：PRIVATE 只能看自己的，SHARED 所有人可见
  where.AND = [
    {
      OR: [{ privacy: PromptPrivacy.SHARED }, { userId: currentUserId }],
    },
  ];

  const [items, total] = await Promise.all([
    prisma.promptTemplate.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: PROMPT_LIST_SELECT,
      orderBy: [{ updatedAt: "desc" }],
    }),
    prisma.promptTemplate.count({ where }),
  ]);

  return {
    items: items.map((item) => mapPromptListItem(item)),
    total,
    page,
    pageSize,
  };
}

// ---------- 详情 ----------

/**
 * 获取提示词详情。
 * @param id 提示词 ID。
 * @param currentUserId 当前用户 ID。
 * @returns 提示词详情。
 */
export async function detail(
  id: number,
  currentUserId: number,
  options: { includeContent?: boolean } = {},
): Promise<PromptOutput> {
  const prompt = await prisma.promptTemplate.findUnique({
    where: { id },
    select: PROMPT_SELECT,
  });

  if (!prompt || prompt.isDeleted) throw new HttpError("提示词不存在", 404);
  if (prompt.userId !== currentUserId && prompt.privacy !== PromptPrivacy.SHARED) {
    throw new HttpError("无权查看该提示词", 403);
  }
  return mapPromptOutput(
    prompt,
    Boolean(options.includeContent && prompt.userId === currentUserId),
  );
}

// ---------- 创建 ----------

/**
 * 创建提示词。
 * @param userId 创建者用户 ID。
 * @param input 创建入参。
 * @returns 新提示词。
 */
export async function create(
  userId: number,
  input: CreatePromptInput,
): Promise<PromptOutput> {
  if (input.categoryId != null) {
    await CategoryService.assertExists(input.categoryId, CategoryType.PROMPT);
  }
  const prompt = await prisma.promptTemplate.create({
    data: {
      userId,
      name: input.name,
      content: input.content,
      presetOptions: input.presetOptions ?? undefined,
      description: input.description,
      privacy: input.privacy,
      usageGuide: input.usageGuide,
      categoryId: input.categoryId ?? null,
    },
    select: PROMPT_SELECT,
  });

  // 新创建的提示词默认未审核（isApproved=false），不会计入 promptCount
  return mapPromptOutput(prompt, true);
}

// ---------- 更新（含快照） ----------

/**
 * 更新提示词，自动创建历史版本快照。
 * @param id 提示词 ID。
 * @param currentUserId 当前用户 ID。
 * @param input 更新入参。
 * @returns 更新后的提示词。
 */
export async function update(
  id: number,
  currentUserId: number,
  input: UpdatePromptInput,
): Promise<PromptOutput> {
  const prompt = await prisma.promptTemplate.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      name: true,
      content: true,
      presetOptions: true,
      description: true,
      usageGuide: true,
      categoryId: true,
      privacy: true,
      isApproved: true,
      versions: {
        select: { version: true },
        orderBy: { version: "desc" },
        take: 1,
      },
      isDeleted: true,
    },
  });

  if (!prompt || prompt.isDeleted) throw new HttpError("提示词不存在", 404);
  if (prompt.userId !== currentUserId)
    throw new HttpError("无权编辑该提示词", 403);

  const hasContentChange =
    (input.content !== undefined && input.content !== prompt.content) ||
    (input.presetOptions !== undefined &&
      JSON.stringify(input.presetOptions) !==
        JSON.stringify(prompt.presetOptions)) ||
    (input.name !== undefined && input.name !== prompt.name) ||
    (input.description !== undefined &&
      input.description !== prompt.description) ||
    (input.usageGuide !== undefined && input.usageGuide !== prompt.usageGuide);

  if (input.categoryId !== undefined && input.categoryId !== null) {
    await CategoryService.assertExists(input.categoryId, CategoryType.PROMPT);
  }

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.content !== undefined) data.content = input.content;
  if (input.presetOptions !== undefined)
    data.presetOptions = input.presetOptions;
  if (input.description !== undefined) data.description = input.description;
  if (input.privacy !== undefined) data.privacy = input.privacy;
  if (input.usageGuide !== undefined) data.usageGuide = input.usageGuide;
  if (input.categoryId !== undefined) data.categoryId = input.categoryId;

  const nextVersion = (prompt.versions[0]?.version ?? 0) + 1;

  if (hasContentChange) {
    await prisma.promptTemplateVersion.create({
      data: {
        promptTemplateId: prompt.id,
        version: nextVersion,
        name: prompt.name,
        content: prompt.content,
        presetOptions: prompt.presetOptions ?? undefined,
        description: prompt.description,
        usageGuide: prompt.usageGuide,
      },
    });
  }

  const updated = await prisma.promptTemplate.update({
    where: { id },
    data,
    select: PROMPT_SELECT,
  });

  await syncPromptCount(prompt, updated);

  return mapPromptOutput(updated, true);
}

// ---------- 软删除 ----------

/**
 * 软删除提示词。
 * @param id 提示词 ID。
 * @param currentUserId 当前用户 ID。
 */
export async function remove(id: number, currentUserId: number): Promise<void> {
  const prompt = await prisma.promptTemplate.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      categoryId: true,
      privacy: true,
      isApproved: true,
      isDeleted: true,
    },
  });

  if (!prompt || prompt.isDeleted) throw new HttpError("提示词不存在", 404);
  if (prompt.userId !== currentUserId)
    throw new HttpError("无权删除该提示词", 403);

  const updated = await prisma.promptTemplate.update({
    where: { id },
    data: { isDeleted: true },
    select: {
      categoryId: true,
      privacy: true,
      isApproved: true,
      isDeleted: true,
    },
  });

  await syncPromptCount(prompt, updated);
}

// ---------- 审核 ----------

/**
 * 审核提示词（管理员）。
 * @param id 提示词 ID。
 * @param approved 是否通过。
 * @returns 更新后的提示词。
 */
export async function approve(
  id: number,
  approved: boolean,
): Promise<PromptOutput> {
  const prompt = await prisma.promptTemplate.findUnique({
    where: { id },
    select: {
      id: true,
      categoryId: true,
      privacy: true,
      isApproved: true,
      isDeleted: true,
    },
  });

  if (!prompt || prompt.isDeleted) throw new HttpError("提示词不存在", 404);

  const updated = await prisma.promptTemplate.update({
    where: { id },
    data: { isApproved: approved },
    select: PROMPT_SELECT,
  });

  await syncPromptCount(prompt, updated);

  return mapPromptOutput(updated);
}

// ---------- 版本列表 ----------

/**
 * 获取提示词历史版本列表。
 * @param promptTemplateId 提示词 ID。
 * @returns 版本列表。
 */
export async function listVersions(
  promptTemplateId: number,
  currentUserId: number,
): Promise<VersionListItem[]> {
  const prompt = await prisma.promptTemplate.findUnique({
    where: { id: promptTemplateId },
    select: { id: true, userId: true, isDeleted: true },
  });

  if (!prompt || prompt.isDeleted) throw new HttpError("提示词不存在", 404);
  if (prompt.userId !== currentUserId) {
    throw new HttpError("无权查看该提示词版本", 403);
  }

  return prisma.promptTemplateVersion.findMany({
    where: { promptTemplateId },
    select: {
      id: true,
      version: true,
      name: true,
      description: true,
      usageGuide: true,
      changeNote: true,
      createdAt: true,
    },
    orderBy: { version: "desc" },
  });
}

// ---------- 版本详情 ----------

/**
 * 获取历史版本详情（作者编辑场景含完整快照）。
 * @param promptTemplateId 提示词 ID。
 * @param versionId 版本 ID。
 * @param currentUserId 当前用户 ID。
 * @returns 版本详情。
 */
export async function versionDetail(
  promptTemplateId: number,
  versionId: number,
  currentUserId: number,
): Promise<VersionDetail> {
  const version = await prisma.promptTemplateVersion.findUnique({
    where: { id: versionId },
    select: {
      id: true,
      promptTemplateId: true,
      promptTemplate: {
        select: { userId: true, isDeleted: true },
      },
      version: true,
      name: true,
      content: true,
      presetOptions: true,
      description: true,
      usageGuide: true,
      changeNote: true,
      createdAt: true,
    },
  });

  if (!version || version.promptTemplateId !== promptTemplateId) {
    throw new HttpError("版本不存在", 404);
  }
  if (version.promptTemplate.isDeleted) throw new HttpError("提示词不存在", 404);
  if (version.promptTemplate.userId !== currentUserId) {
    throw new HttpError("无权查看该版本", 403);
  }

  const { promptTemplate: _promptTemplate, promptTemplateId: _id, ...result } =
    version;
  return result;
}

// ---------- 恢复版本 ----------

/**
 * 恢复历史版本，覆盖当前提示词并创建一条新快照。
 * @param id 提示词 ID。
 * @param versionId 目标版本 ID。
 * @param currentUserId 当前用户 ID。
 * @returns 更新后的提示词。
 */
export async function restoreVersion(
  id: number,
  versionId: number,
  currentUserId: number,
): Promise<PromptOutput> {
  const [prompt, version] = await Promise.all([
    prisma.promptTemplate.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        name: true,
        content: true,
        presetOptions: true,
        description: true,
        usageGuide: true,
        versions: {
          select: { version: true },
          orderBy: { version: "desc" },
          take: 1,
        },
        isDeleted: true,
      },
    }),
    prisma.promptTemplateVersion.findUnique({
      where: { id: versionId },
      select: {
        promptTemplateId: true,
        name: true,
        content: true,
        presetOptions: true,
        description: true,
        usageGuide: true,
      },
    }),
  ]);

  if (!prompt || prompt.isDeleted) throw new HttpError("提示词不存在", 404);
  if (prompt.userId !== currentUserId)
    throw new HttpError("无权编辑该提示词", 403);
  if (!version || version.promptTemplateId !== id)
    throw new HttpError("版本不存在或不属于该提示词", 404);

  const nextVersion = (prompt.versions[0]?.version ?? 0) + 1;

  // 恢复前先保存当前版本快照
  await prisma.promptTemplateVersion.create({
    data: {
      promptTemplateId: prompt.id,
      version: nextVersion,
      name: prompt.name,
      content: prompt.content,
      presetOptions: prompt.presetOptions ?? undefined,
      description: prompt.description,
      usageGuide: prompt.usageGuide,
      changeNote: `恢复自版本 ${versionId}`,
    },
  });

  const updated = await prisma.promptTemplate.update({
    where: { id },
    data: {
      name: version.name,
      content: version.content,
      presetOptions: version.presetOptions ?? undefined,
      description: version.description,
      usageGuide: version.usageGuide,
    },
    select: PROMPT_SELECT,
  });

  return mapPromptOutput(updated, true);
}
