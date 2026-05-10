import type { UserRole } from "@/app/generated/prisma/enums";

/** Access Token 类型标识。 */
const ACCESS_TOKEN_TYPE = "access";

/** HMAC SHA-256 JWT 算法名。 */
const JWT_ALGORITHM = "HS256";

/** UTF-8 编码器。 */
const textEncoder = new TextEncoder();

/** JWT 头部。 */
interface JwtHeader {
  /** 签名算法。 */
  alg: typeof JWT_ALGORITHM;
  /** 令牌类型。 */
  typ: "JWT";
}

/** Access Token 载荷。 */
export interface AccessTokenPayload {
  /** 用户 ID。 */
  sub: number;
  /** 用户角色。 */
  role: UserRole;
  /** 令牌类型。 */
  type: typeof ACCESS_TOKEN_TYPE;
  /** 签发时间，Unix 秒。 */
  iat: number;
  /** 过期时间，Unix 秒。 */
  exp: number;
}

/** 令牌对。 */
export interface AuthTokens {
  /** Access Token。 */
  accessToken: string;
  /** Refresh Token。 */
  refreshToken: string;
  /** Access Token 有效秒数。 */
  expiresIn: number;
}

/** 有效 Token 最短秒数，低于此值视为配置错误。 */
const MIN_TOKEN_SECONDS = 60;

/**
 * 安全解析环境变量中的秒数值。
 * @param raw 环境变量原始值。
 * @param fallback 默认秒数。
 * @param name 变量名（用于警告日志）。
 * @returns 有效秒数。
 */
function parseTokenSeconds(raw: string | undefined, fallback: number, name: string): number {
  // 去掉可能残留的引号（兼容 Bun 不剥离引号的版本）
  const sanitized = raw?.replace(/^["']|["']$/g, "") ?? "";
  const parsed = Number(sanitized);

  if (Number.isNaN(parsed) || parsed < MIN_TOKEN_SECONDS) {
    console.warn(
      `[token] ${name}="${raw}" 无效，已使用默认值 ${fallback} 秒（${fallback / 3600}h）`,
    );
    return fallback;
  }

  return parsed;
}

/**
 * 获取 Access Token 有效秒数。
 * @returns Access Token 有效秒数。
 */
export function getAccessTokenExpiresIn(): number {
  return parseTokenSeconds(process.env.ACCESS_TOKEN_EXPIRES_IN, 900, "ACCESS_TOKEN_EXPIRES_IN");
}

/**
 * 获取 Refresh Token 有效秒数。
 * @returns Refresh Token 有效秒数。
 */
export function getRefreshTokenExpiresIn(): number {
  return parseTokenSeconds(process.env.REFRESH_TOKEN_EXPIRES_IN, 604800, "REFRESH_TOKEN_EXPIRES_IN");
}

/**
 * Base64URL 编码字节。
 * @param bytes 待编码字节。
 * @returns Base64URL 字符串。
 */
function encodeBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

/**
 * Base64URL 编码 JSON。
 * @param value 待编码值。
 * @returns Base64URL 字符串。
 */
function encodeJson(value: unknown): string {
  return encodeBase64Url(textEncoder.encode(JSON.stringify(value)));
}

/**
 * 解码 Base64URL JSON。
 * @param value Base64URL 字符串。
 * @returns 解码后的未知值。
 */
function decodeJson(value: string): unknown {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

/**
 * 获取 JWT 签名密钥。
 * @returns HMAC CryptoKey。
 */
async function getJwtKey(): Promise<CryptoKey> {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters");
  }

  return crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/**
 * 生成 HMAC SHA-256 签名。
 * @param input 签名输入。
 * @returns Base64URL 签名。
 */
async function signInput(input: string): Promise<string> {
  const key = await getJwtKey();
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode(input),
  );

  return encodeBase64Url(new Uint8Array(signature));
}

/**
 * 判断未知值是否为 Access Token 载荷。
 * @param payload 待判断值。
 * @returns 是 Access Token 载荷时返回 true。
 */
function isAccessTokenPayload(payload: unknown): payload is AccessTokenPayload {
  if (!payload || typeof payload !== "object") return false;

  const data = payload as Partial<AccessTokenPayload>;
  return (
    typeof data.sub === "number" &&
    typeof data.role === "string" &&
    data.type === ACCESS_TOKEN_TYPE &&
    typeof data.iat === "number" &&
    typeof data.exp === "number"
  );
}

/**
 * 签发 Access Token。
 * @param userId 用户 ID。
 * @param role 用户角色。
 * @returns Access Token。
 */
export async function signAccessToken(
  userId: number,
  role: UserRole,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header: JwtHeader = { alg: JWT_ALGORITHM, typ: "JWT" };
  const payload: AccessTokenPayload = {
    sub: userId,
    role,
    type: ACCESS_TOKEN_TYPE,
    iat: now,
    exp: now + getAccessTokenExpiresIn(),
  };
  const input = `${encodeJson(header)}.${encodeJson(payload)}`;
  const signature = await signInput(input);

  return `${input}.${signature}`;
}

/**
 * 验证 Access Token。
 * @param token Access Token。
 * @returns 令牌载荷，非法或过期时返回 null。
 */
export async function verifyAccessToken(
  token: string,
): Promise<AccessTokenPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerPart, payloadPart, signaturePart] = parts;
  if (!headerPart || !payloadPart || !signaturePart) return null;

  const expected = await signInput(`${headerPart}.${payloadPart}`);
  if (expected !== signaturePart) return null;

  const payload = decodeJson(payloadPart);
  if (!isAccessTokenPayload(payload)) return null;
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;

  return payload;
}

/**
 * 生成 Refresh Token 明文。
 * @returns 高熵 Refresh Token。
 */
export function createRefreshToken(): string {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  return encodeBase64Url(bytes);
}

/**
 * 生成令牌族 ID。
 * @returns UUID 字符串。
 */
export function createTokenFamily(): string {
  return crypto.randomUUID();
}

/**
 * 计算 Refresh Token 哈希。
 * @param refreshToken Refresh Token 明文。
 * @returns SHA-256 十六进制哈希。
 */
export async function hashRefreshToken(refreshToken: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    textEncoder.encode(refreshToken),
  );

  return Buffer.from(digest).toString("hex");
}
