import { t } from "elysia";
import { UserRole, UserStatus } from "@/app/generated/prisma/enums";
import * as AuthService from "@/app/service/auth/auth.service";

/** 安全用户响应。 */
interface SafeUserResponse {
  /** 用户 ID。 */
  id: number;
  /** 用户名。 */
  username: string;
  /** 邮箱。 */
  email: string;
  /** 用户角色。 */
  role: UserRole;
  /** 用户状态。 */
  status: UserStatus;
  /** 最后登录时间。 */
  lastLoginAt: string | null;
  /** 创建时间。 */
  createdAt: string;
  /** 更新时间。 */
  updatedAt: string;
}

/** 角色响应模型。 */
const UserRoleSchema = t.Union([
  t.Literal(UserRole.ADMIN),
  t.Literal(UserRole.AUTHOR),
]);

/** 状态响应模型。 */
const UserStatusSchema = t.Union([
  t.Literal(UserStatus.ACTIVE),
  t.Literal(UserStatus.BANNED),
  t.Literal(UserStatus.DELETED),
]);

/** 安全用户响应模型。 */
const SafeUserSchema = t.Object({
  /** 用户 ID。 */
  id: t.Number(),
  /** 用户名。 */
  username: t.String(),
  /** 邮箱。 */
  email: t.String(),
  /** 用户角色。 */
  role: UserRoleSchema,
  /** 用户状态。 */
  status: UserStatusSchema,
  /** 最后登录时间。 */
  lastLoginAt: t.Union([t.String(), t.Null()]),
  /** 创建时间。 */
  createdAt: t.String(),
  /** 更新时间。 */
  updatedAt: t.String(),
});

/** 令牌响应模型。 */
const AuthTokensSchema = t.Object({
  /** Access Token。 */
  accessToken: t.String(),
  /** Refresh Token。 */
  refreshToken: t.String(),
  /** Access Token 有效秒数。 */
  expiresIn: t.Number(),
});

/** 认证响应模型。 */
const AuthResultSchema = t.Object({
  /** 用户信息。 */
  user: SafeUserSchema,
  /** 令牌信息。 */
  tokens: AuthTokensSchema,
});

/** 注册请求模型。 */
const RegisterBodySchema = t.Object({
  /** 用户名。 */
  username: t.String({
    minLength: 3,
    maxLength: 64,
    pattern: "^[a-zA-Z0-9_-]{3,64}$",
  }),
  /** 邮箱。 */
  email: t.String({ format: "email", maxLength: 255 }),
  /** 明文密码。 */
  password: t.String({ minLength: 8, maxLength: 128 }),
});

/** 登录请求模型。 */
const LoginBodySchema = t.Object({
  /** 邮箱或用户名。 */
  account: t.String({ minLength: 1, maxLength: 255 }),
  /** 明文密码。 */
  password: t.String({ minLength: 8, maxLength: 128 }),
});

/** Refresh Token 请求模型。 */
const RefreshTokenBodySchema = t.Object({
  /** Refresh Token。 */
  refreshToken: t.String({ minLength: 32, maxLength: 256 }),
});

/**
 * 转换用户响应。
 * @param user 安全用户信息。
 * @returns 安全用户响应。
 */
function toSafeUserResponse(user: AuthService.SafeUser): SafeUserResponse {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

/**
 * 转换认证响应。
 * @param result 认证结果。
 * @returns 认证响应。
 */
function toAuthResponse(result: AuthService.AuthResult) {
  return {
    user: toSafeUserResponse(result.user),
    tokens: result.tokens,
  };
}

export default $g.ctrl((app) =>
  app
    .post(
      "register",
      async ({ body }) =>
        $g.success(toAuthResponse(await AuthService.register(body))),
      {
        audit: { category: "auth", action: "register" },
        body: RegisterBodySchema,
        res: AuthResultSchema,
        requireRateLimit: { windowSeconds: 60, maxRequests: 5 },
      },
    )
    .post(
      "login",
      async ({ body }) =>
        $g.success(toAuthResponse(await AuthService.login(body))),
      {
        audit: { category: "auth", action: "login" },
        body: LoginBodySchema,
        res: AuthResultSchema,
        requireRateLimit: { windowSeconds: 60, maxRequests: 10 },
      },
    )
    .post(
      "refresh",
      async ({ body }) =>
        $g.success(
          toAuthResponse(await AuthService.refresh(body.refreshToken)),
        ),
      {
        audit: { category: "auth", action: "refresh" },
        body: RefreshTokenBodySchema,
        res: AuthResultSchema,
        requireRateLimit: { windowSeconds: 60, maxRequests: 10 },
      },
    )
    .post(
      "logout",
      async ({ body }) =>
        $g.success(await AuthService.logout(body.refreshToken)),
      {
        audit: { category: "auth", action: "logout" },
        requireAuth: true,
        body: RefreshTokenBodySchema,
        res: t.Boolean(),
      },
    )
    .get(
      "me",
      async ({ currentUser }) =>
        $g.success(
          toSafeUserResponse(await AuthService.getMe(currentUser!.id)),
        ),
      {
        requireAuth: true,
        res: SafeUserSchema,
      },
    ),
);
