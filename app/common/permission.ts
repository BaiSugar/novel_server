import { UserRole } from "@/app/generated/prisma/enums";

/** 权限标识。 */
export type Permission = "account.manage" | "novel.write" | "prompt.approve" | "prompt.write" | "prompt.read";

/** 权限常量，避免硬编码字符串。 */
export const PERM = {
  ACCOUNT_MANAGE: "account.manage",
  NOVEL_WRITE: "novel.write",
  PROMPT_APPROVE: "prompt.approve",
  PROMPT_WRITE: "prompt.write",
  PROMPT_READ: "prompt.read",
} as const satisfies Record<string, Permission>;

/** 角色权限映射。 */
const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  [UserRole.ADMIN]: new Set(["account.manage", "novel.write", "prompt.approve", "prompt.write", "prompt.read"]),
  [UserRole.AUTHOR]: new Set(["novel.write", "prompt.write", "prompt.read"]),
};

/**
 * 判断角色是否拥有权限。
 * @param role 用户角色。
 * @param permission 权限标识。
 * @returns 拥有权限时返回 true。
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}
