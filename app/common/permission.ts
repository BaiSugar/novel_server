import { UserRole } from "@/app/generated/prisma/enums";

/** 权限标识。 */
export type Permission = "account.manage" | "novel.write";

/** 角色权限映射。 */
const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  [UserRole.ADMIN]: new Set(["account.manage", "novel.write"]),
  [UserRole.AUTHOR]: new Set(["novel.write"]),
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
