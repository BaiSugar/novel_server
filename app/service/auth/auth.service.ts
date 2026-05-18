import { hasPermission, type Permission } from "@/app/common/permission";
import { type UserRole, UserStatus } from "@/app/generated/prisma/enums";
import { HttpError } from "@/app/lib/httpError";
import { prisma } from "@/app/lib/prisma";
import {
  hashPassword,
  isValidPasswordLength,
  verifyPassword,
} from "@/app/utils/password";
import {
  type AuthTokens,
  createRefreshToken,
  createTokenFamily,
  getAccessTokenExpiresIn,
  getRefreshTokenExpiresIn,
  hashRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from "@/app/utils/token";

/** 安全用户信息。 */
export interface SafeUser {
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
  lastLoginAt: Date | null;
  /** 创建时间。 */
  createdAt: Date;
  /** 更新时间。 */
  updatedAt: Date;
}

/** 注册入参。 */
export interface RegisterInput {
  /** 用户名。 */
  username: string;
  /** 邮箱。 */
  email: string;
  /** 明文密码。 */
  password: string;
}

/** 登录入参。 */
export interface LoginInput {
  /** 邮箱或用户名。 */
  account: string;
  /** 明文密码。 */
  password: string;
}

/** 认证结果。 */
export interface AuthResult {
  /** 安全用户信息。 */
  user: SafeUser;
  /** 认证令牌。 */
  tokens: AuthTokens;
}

/** 当前请求用户。 */
export type CurrentUser = Pick<
  SafeUser,
  "id" | "username" | "email" | "role" | "status"
>;

/** 用户安全字段选择。 */
const SAFE_USER_SELECT = {
  id: true,
  username: true,
  email: true,
  role: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** 登录用户字段选择。 */
const LOGIN_USER_SELECT = {
  ...SAFE_USER_SELECT,
  passwordHash: true,
  tokenVersion: true,
} as const;

/**
 * 签发令牌对。
 * @param userId 用户 ID。
 * @param role 用户角色。
 * @param tokenVersion 令牌版本号。
 * @param family 令牌族。
 * @returns 令牌对。
 */
async function issueTokens(
  userId: number,
  role: UserRole,
  tokenVersion: number,
  family = createTokenFamily(),
): Promise<AuthTokens> {
  const refreshToken = createRefreshToken();
  const tokenHash = await hashRefreshToken(refreshToken);

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      family,
      expiresAt: new Date(Date.now() + getRefreshTokenExpiresIn() * 1000),
    },
  });

  return {
    accessToken: await signAccessToken(userId, role, tokenVersion),
    refreshToken,
    expiresIn: getAccessTokenExpiresIn(),
  };
}

/**
 * 注册账号。
 * @param input 注册入参。
 * @returns 认证结果。
 */
export async function register(input: RegisterInput): Promise<AuthResult> {
  if (!isValidPasswordLength(input.password)) {
    throw new HttpError("密码长度需为 8-128 位", 400);
  }

  const email = input.email.trim().toLowerCase();
  const username = input.username.trim();
  const exists = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
    select: { id: true },
  });

  if (exists) {
    throw new HttpError("用户名或邮箱已存在", 409);
  }

  const user = await prisma.user.create({
    data: {
      email,
      username,
      passwordHash: await hashPassword(input.password),
    },
    select: SAFE_USER_SELECT,
  });

  return {
    user,
    tokens: await issueTokens(user.id, user.role, 1),
  };
}

/**
 * 登录账号。
 * @param input 登录入参。
 * @returns 认证结果。
 */
export async function login(input: LoginInput): Promise<AuthResult> {
  const account = input.account.trim();
  const user = await prisma.user.findUnique({
    where: account.includes("@")
      ? { email: account.toLowerCase() }
      : { username: account },
    select: LOGIN_USER_SELECT,
  });

  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new HttpError("账号或密码错误", 401);
  }

  if (user.status !== UserStatus.ACTIVE) {
    throw new HttpError("账号不可用", 403);
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
    select: SAFE_USER_SELECT,
  });

  return {
    user: updated,
    tokens: await issueTokens(user.id, user.role, user.tokenVersion),
  };
}

/**
 * 刷新令牌。
 * @param refreshToken Refresh Token 明文。
 * @returns 认证结果。
 */
export async function refresh(refreshToken: string): Promise<AuthResult> {
  const tokenHash = await hashRefreshToken(refreshToken);
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!stored) {
    throw new HttpError("刷新令牌无效", 401);
  }

  if (stored.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { family: stored.family, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new HttpError("刷新令牌已失效", 401);
  }

  if (stored.expiresAt <= new Date()) {
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    throw new HttpError("刷新令牌已过期", 401);
  }

  if (stored.user.status !== UserStatus.ACTIVE) {
    throw new HttpError("账号不可用", 403);
  }

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  return {
    user: stored.user,
    tokens: await issueTokens(
      stored.userId,
      stored.user.role,
      stored.user.tokenVersion,
      stored.family,
    ),
  };
}

/**
 * 登出账号。
 * @param refreshToken Refresh Token 明文。
 * @returns 撤销成功时返回 true。
 */
export async function logout(refreshToken: string): Promise<boolean> {
  const tokenHash = await hashRefreshToken(refreshToken);

  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  return true;
}

/**
 * 根据 Access Token 解析当前用户。
 * @param token Access Token。
 * @returns 当前用户，非法或不可用时返回 null。
 */
export async function getCurrentUserByAccessToken(
  token: string,
): Promise<CurrentUser | null> {
  const payload = await verifyAccessToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      status: true,
      tokenVersion: true,
    },
  });

  if (
    !user ||
    user.status !== UserStatus.ACTIVE ||
    payload.tv !== user.tokenVersion
  )
    return null;
  return user;
}

/**
 * 查询当前用户详情。
 * @param userId 用户 ID。
 * @returns 安全用户信息。
 */
export async function getMe(userId: number): Promise<SafeUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: SAFE_USER_SELECT,
  });

  if (!user || user.status !== UserStatus.ACTIVE) {
    throw new HttpError("账号不可用", 403);
  }

  return user;
}

/**
 * 判断当前用户是否具备权限。
 * @param user 当前用户。
 * @param permission 权限标识。
 * @returns 具备权限时返回 true。
 */
export function currentUserHasPermission(
  user: CurrentUser,
  permission: Permission,
): boolean {
  return hasPermission(user.role, permission);
}
