import type { CategoryType } from "@/app/generated/prisma/enums";
import { HttpError } from "@/app/lib/httpError";
import { prisma } from "@/app/lib/prisma";

// ---------- 类型定义 ----------

/** 分类列表项（API 响应）。 */
export interface CategoryItem {
  /** 分类 ID。 */
  id: number;
  /** 分类显示名。 */
  name: string;
  /** 分类下提示词数量（仅统计 SHARED + isApproved=true）。 */
  promptCount: number;
}

/** 分类创建入参。 */
export interface CreateCategoryInput {
  /** 分类显示名。 */
  name: string;
  /** 排序序号，默认 0。 */
  order?: number;
}

/** 分类更新入参。 */
export interface UpdateCategoryInput {
  /** 分类显示名。 */
  name?: string;
  /** 排序序号。 */
  order?: number;
}

// ---------- 列表 ----------

/**
 * 获取指定 type 的分类列表，按 order 升序。
 * @param type 分类类型。
 * @returns 分类列表（含 promptCount）。
 */
export async function list(type: CategoryType): Promise<CategoryItem[]> {
  const rows = await prisma.category.findMany({
    where: { type },
    select: { id: true, name: true, promptCount: true },
    orderBy: [{ order: "asc" }, { id: "asc" }],
  });
  return rows;
}

// ---------- 断言存在 ----------

/**
 * 校验分类存在且类型匹配。
 * @param id 分类 ID。
 * @param type 期望的分类类型。
 * @throws 分类不存在或类型不匹配时抛出 404。
 */
export async function assertExists(
  id: number,
  type: CategoryType,
): Promise<void> {
  const row = await prisma.category.findUnique({
    where: { id },
    select: { id: true, type: true },
  });
  if (!row || row.type !== type) {
    throw new HttpError("分类不存在", 404);
  }
}

// ---------- 创建 ----------

/**
 * 创建分类。
 * @param type 分类类型。
 * @param input 创建入参。
 * @returns 新分类。
 */
export async function create(
  type: CategoryType,
  input: CreateCategoryInput,
): Promise<CategoryItem> {
  const exists = await prisma.category.findUnique({
    where: { type_name: { type, name: input.name } },
    select: { id: true },
  });
  if (exists) throw new HttpError("同名分类已存在", 409);

  const row = await prisma.category.create({
    data: {
      type,
      name: input.name,
      order: input.order ?? 0,
    },
    select: { id: true, name: true, promptCount: true },
  });
  return row;
}

// ---------- 更新 ----------

/**
 * 更新分类。
 * @param id 分类 ID。
 * @param type 分类类型。
 * @param input 更新入参。
 * @returns 更新后的分类。
 */
export async function update(
  id: number,
  type: CategoryType,
  input: UpdateCategoryInput,
): Promise<CategoryItem> {
  await assertExists(id, type);

  if (input.name !== undefined) {
    const conflict = await prisma.category.findUnique({
      where: { type_name: { type, name: input.name } },
      select: { id: true },
    });
    if (conflict && conflict.id !== id) {
      throw new HttpError("同名分类已存在", 409);
    }
  }

  const row = await prisma.category.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.order !== undefined ? { order: input.order } : {}),
    },
    select: { id: true, name: true, promptCount: true },
  });
  return row;
}

// ---------- 删除 ----------

/**
 * 删除分类。提示词和创意工具引用会由数据库外键置空。
 * @param id 分类 ID。
 * @param type 分类类型。
 */
export async function remove(id: number, type: CategoryType): Promise<void> {
  await assertExists(id, type);
  await prisma.category.delete({ where: { id } });
}

// ---------- 计数维护 ----------

/**
 * 调整分类的 promptCount 冗余字段。
 * 仅在提示词满足"SHARED + isApproved=true"可见条件变化时调用。
 * @param categoryId 分类 ID。
 * @param delta 增量（+1 或 -1）。
 */
export async function adjustPromptCount(
  categoryId: number,
  delta: 1 | -1,
): Promise<void> {
  await prisma.category.update({
    where: { id: categoryId },
    data: { promptCount: { increment: delta } },
  });
}
