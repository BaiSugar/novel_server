import {
  CategoryType,
  type CreativeToolIcon,
} from "@/app/generated/prisma/enums";
import { HttpError } from "@/app/lib/httpError";
import { prisma } from "@/app/lib/prisma";
import * as CategoryService from "@/app/service/category/category.service";

// ---------- 类型定义 ----------

/** 创意工具列表查询参数。 */
export interface CreativeToolListParams {
  /** 按提示词分类筛选；不传或 0 表示全部。 */
  categoryId?: number;
}

/** 创意工具 API 响应项。 */
export interface CreativeToolItem {
  id: number;
  name: string;
  description: string;
  icon: CreativeToolIcon;
  /** 对应提示词分类 ID。 */
  categoryId: number | null;
  /** 对应提示词分类名。 */
  category: string | null;
  isNew: boolean;
}

/** 创意工具创建入参。 */
export interface CreateCreativeToolInput {
  name: string;
  description: string;
  icon: CreativeToolIcon;
  categoryId?: number | null;
  isNew?: boolean;
  order?: number;
}

/** 创意工具更新入参。 */
export interface UpdateCreativeToolInput {
  name?: string;
  description?: string;
  icon?: CreativeToolIcon;
  categoryId?: number | null;
  isNew?: boolean;
  order?: number;
}

const CREATIVE_TOOL_SELECT = {
  id: true,
  name: true,
  description: true,
  icon: true,
  categoryId: true,
  isNew: true,
  category: { select: { name: true } },
} as const;

function mapCreativeTool(row: {
  id: number;
  name: string;
  description: string;
  icon: CreativeToolIcon;
  categoryId: number | null;
  isNew: boolean;
  category: { name: string } | null;
}): CreativeToolItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    categoryId: row.categoryId,
    category: row.category?.name ?? null,
    isNew: row.isNew,
  };
}

// ---------- 列表 ----------

/**
 * 获取创意工具列表，按提示词分类筛选。
 * @param params 查询参数。
 * @returns 创意工具列表。
 */
export async function list(
  params: CreativeToolListParams = {},
): Promise<CreativeToolItem[]> {
  const where: Record<string, unknown> = {};
  if (params.categoryId !== undefined && params.categoryId > 0) {
    where.categoryId = params.categoryId;
  }

  const rows = await prisma.creativeTool.findMany({
    where,
    select: CREATIVE_TOOL_SELECT,
    orderBy: [{ order: "asc" }, { id: "asc" }],
  });
  return rows.map(mapCreativeTool);
}

// ---------- 创建 ----------

/**
 * 创建创意工具。
 * @param input 创建入参。
 * @returns 新创意工具。
 */
export async function create(
  input: CreateCreativeToolInput,
): Promise<CreativeToolItem> {
  if (input.categoryId != null) {
    await CategoryService.assertExists(input.categoryId, CategoryType.PROMPT);
  }

  const row = await prisma.creativeTool.create({
    data: {
      name: input.name,
      description: input.description,
      icon: input.icon,
      categoryId: input.categoryId ?? null,
      isNew: input.isNew ?? false,
      order: input.order ?? 0,
    },
    select: CREATIVE_TOOL_SELECT,
  });
  return mapCreativeTool(row);
}

// ---------- 更新 ----------

/**
 * 更新创意工具。
 * @param id 工具 ID。
 * @param input 更新入参。
 * @returns 更新后的创意工具。
 */
export async function update(
  id: number,
  input: UpdateCreativeToolInput,
): Promise<CreativeToolItem> {
  const exists = await prisma.creativeTool.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) throw new HttpError("创意工具不存在", 404);

  if (input.categoryId !== undefined && input.categoryId !== null) {
    await CategoryService.assertExists(input.categoryId, CategoryType.PROMPT);
  }

  const row = await prisma.creativeTool.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
      ...(input.categoryId !== undefined
        ? { categoryId: input.categoryId }
        : {}),
      ...(input.isNew !== undefined ? { isNew: input.isNew } : {}),
      ...(input.order !== undefined ? { order: input.order } : {}),
    },
    select: CREATIVE_TOOL_SELECT,
  });
  return mapCreativeTool(row);
}

// ---------- 删除 ----------

/**
 * 删除创意工具。
 * @param id 工具 ID。
 */
export async function remove(id: number): Promise<void> {
  const exists = await prisma.creativeTool.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) throw new HttpError("创意工具不存在", 404);
  await prisma.creativeTool.delete({ where: { id } });
}
