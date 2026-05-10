import { Elysia } from "elysia";
import * as $c from "@/app/common";
import type { Permission } from "@/app/common/permission";
import type { UserRole } from "@/app/generated/prisma/enums";
import {
  currentUserHasPermission,
  getCurrentUserByAccessToken,
} from "@/app/service/auth/auth.service";

/**
 * 提取 Bearer Token。
 * @param headers 请求头。
 * @returns Access Token，不存在时返回 null。
 */
function extractBearerToken(headers: Headers): string | null {
  const authorization = headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;

  const token = authorization.slice(7).trim();
  return token.length > 0 ? token : null;
}

/** 鉴权插件。 */
export default new Elysia({ name: __filename })
  .derive({ as: "global" }, async ({ request }) => {
    const token = extractBearerToken(request.headers);

    return {
      currentUser: token ? await getCurrentUserByAccessToken(token) : null,
    };
  })
  .macro({
    /**
     * 要求当前请求已登录。
     * @param enabled 是否启用登录校验。
     * @returns Elysia beforeHandle 钩子。
     */
    requireAuth(enabled?: boolean) {
      if (!enabled) return {};

      return {
        beforeHandle({ currentUser, set }) {
          if (currentUser) return;

          set.status = 401;
          return $c.error("未登录", "UNAUTHORIZED");
        },
      };
    },

    /**
     * 要求当前用户具备指定角色。
     * @param role 允许访问的角色。
     * @returns Elysia beforeHandle 钩子。
     */
    requireRole(role?: UserRole) {
      if (!role) return {};

      return {
        beforeHandle({ currentUser, set }) {
          if (currentUser?.role === role) return;

          set.status = currentUser ? 403 : 401;
          return $c.error(
            currentUser ? "无权限" : "未登录",
            currentUser ? "FORBIDDEN" : "UNAUTHORIZED",
          );
        },
      };
    },

    /**
     * 要求当前用户具备指定权限。
     * @param permission 权限标识。
     * @returns Elysia beforeHandle 钩子。
     */
    requirePermission(permission?: Permission) {
      if (!permission) return {};

      return {
        beforeHandle({ currentUser, set }) {
          if (
            currentUser &&
            currentUserHasPermission(currentUser, permission)
          ) {
            return;
          }

          set.status = currentUser ? 403 : 401;
          return $c.error(
            currentUser ? "无权限" : "未登录",
            currentUser ? "FORBIDDEN" : "UNAUTHORIZED",
          );
        },
      };
    },
  });
