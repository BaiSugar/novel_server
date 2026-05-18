import { UserRole } from "@/app/generated/prisma/enums";

/** 权限标识。 */
export type Permission =
  | "account.manage"
  | "novel.write"
  | "prompt.approve"
  | "prompt.write"
  | "prompt.read"
  | "prompt.category.manage"
  | "creative_tool.manage"
  | "ai.model.manage"
  | "ai.conversation.manage"
  | "ai.generation.invoke"
  | "ai.image.generate";

/** 权限常量，避免硬编码字符串。 */
export const PERM = {
  ACCOUNT_MANAGE: "account.manage", // 账号管理
  NOVEL_WRITE: "novel.write", // 小说写作
  PROMPT_APPROVE: "prompt.approve", // 提示词审批
  PROMPT_WRITE: "prompt.write", // 提示词编辑
  PROMPT_READ: "prompt.read", // 提示词查看
  PROMPT_CATEGORY_MANAGE: "prompt.category.manage", // 提示词分类管理
  CREATIVE_TOOL_MANAGE: "creative_tool.manage", // 创作工具管理
  AI_MODEL_MANAGE: "ai.model.manage", // AI模型管理
  AI_CONVERSATION_MANAGE: "ai.conversation.manage", // AI对话管理
  AI_GENERATION_INVOKE: "ai.generation.invoke", // AI生成调用
  AI_IMAGE_GENERATE: "ai.image.generate", // AI图片生成
} as const satisfies Record<string, Permission>;

/** 角色权限映射。 */
const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  [UserRole.ADMIN]: new Set([
    "account.manage",
    "novel.write",
    "prompt.approve",
    "prompt.write",
    "prompt.read",
    "prompt.category.manage",
    "creative_tool.manage",
    "ai.model.manage",
    "ai.conversation.manage",
    "ai.generation.invoke",
    "ai.image.generate",
  ]),
  [UserRole.AUTHOR]: new Set([
    "novel.write",
    "prompt.write",
    "prompt.read",
    "ai.conversation.manage",
    "ai.generation.invoke",
    "ai.image.generate",
  ]),
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
