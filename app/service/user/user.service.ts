import { HttpError } from "@/app/lib/httpError";
import { prisma } from "@/app/lib/prisma";

/** 用户列表查询参数。 */
export interface UserListParams {
  /** 页码（从 1 开始）。 */
  page?: number;
  /** 每页数量。 */
  pageSize?: number;
}

/**
 * 获取用户列表。
 * @param params 查询参数。
 * @returns 用户列表。
 */
export async function list(params: UserListParams = {}) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
      orderBy: { id: "desc" },
    }),
    prisma.user.count(),
  ]);

  return { items, total, page, pageSize };
}

/**
 * 获取用户详情。
 * @param userId 用户 ID。
 * @returns 用户信息。
 */
export async function detail(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      status: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) throw new HttpError("用户不存在", 404);
  return user;
}