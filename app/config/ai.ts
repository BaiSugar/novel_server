const AES_256_KEY_BYTES = 32;
const HEX_KEY_LENGTH = AES_256_KEY_BYTES * 2;
const BASE64_KEY_MIN_LENGTH = 43;

/** AI 相关环境变量。 */
export interface AiEnv {
  /** 环境变量索引。 */
  [key: string]: string | undefined;
  /** Provider API Key 对称加密密钥。 */
  AI_PROVIDER_KEY_SECRET?: string;
  /** 健康度滑窗样本数。 */
  AI_HEALTH_WINDOW_SIZE?: string;
  /** 前端流畅判定软延迟阈值。 */
  AI_LATENCY_SOFT_LIMIT_MS?: string;
  /** 前端流畅判定硬延迟阈值。 */
  AI_LATENCY_HARD_LIMIT_MS?: string;
  /** 顺序策略头部换头窗口。 */
  AI_HEAD_WINDOW?: string;
  /** 熔断基础窗口。 */
  AI_CIRCUIT_BASE_MS?: string;
  /** 图片默认尺寸。 */
  AI_IMAGE_DEFAULT_SIZE?: string;
  /** 图片默认质量。 */
  AI_IMAGE_DEFAULT_QUALITY?: string;
}

function intEnv(env: AiEnv, key: keyof AiEnv, fallback: number): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

/**
 * 获取 Provider API Key AES-256 加密密钥。
 * @param env 环境变量。
 * @returns 32 字节加密密钥。
 */
export function getAiProviderKeySecret(env: AiEnv = process.env): Uint8Array {
  const rawKey = env.AI_PROVIDER_KEY_SECRET?.trim();
  if (!rawKey) {
    throw new Error("AI_PROVIDER_KEY_SECRET is required");
  }

  if (/^[\da-f]+$/i.test(rawKey) && rawKey.length === HEX_KEY_LENGTH) {
    return Buffer.from(rawKey, "hex");
  }

  if (rawKey.length >= BASE64_KEY_MIN_LENGTH) {
    const key = Buffer.from(rawKey, "base64");
    if (key.length === AES_256_KEY_BYTES) return key;
  }

  throw new Error(
    "AI_PROVIDER_KEY_SECRET must be a 32-byte key encoded as 64 hex chars or base64",
  );
}

/** 获取健康度滑窗样本数。 */
export function getAiHealthWindowSize(env: AiEnv = process.env): number {
  return intEnv(env, "AI_HEALTH_WINDOW_SIZE", 50);
}

/** 获取前端流畅判定软延迟阈值。 */
export function getAiLatencySoftLimitMs(env: AiEnv = process.env): number {
  return intEnv(env, "AI_LATENCY_SOFT_LIMIT_MS", 3000);
}

/** 获取前端流畅判定硬延迟阈值。 */
export function getAiLatencyHardLimitMs(env: AiEnv = process.env): number {
  return intEnv(env, "AI_LATENCY_HARD_LIMIT_MS", 5000);
}

/** 获取顺序策略头部换头窗口大小。 */
export function getAiHeadWindow(env: AiEnv = process.env): number {
  return intEnv(env, "AI_HEAD_WINDOW", 3);
}

/** 获取熔断基础窗口毫秒数。 */
export function getAiCircuitBaseMs(env: AiEnv = process.env): number {
  return intEnv(env, "AI_CIRCUIT_BASE_MS", 60000);
}

/** 获取默认图片尺寸。 */
export function getAiImageDefaultSize(env: AiEnv = process.env): string {
  return env.AI_IMAGE_DEFAULT_SIZE?.trim() || "1024x1024";
}

/** 获取默认图片质量。 */
export function getAiImageDefaultQuality(env: AiEnv = process.env): string {
  return env.AI_IMAGE_DEFAULT_QUALITY?.trim() || "standard";
}
