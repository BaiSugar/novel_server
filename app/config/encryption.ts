/** 章节内容加密环境配置。 */
export interface EncryptionEnv {
  /** 环境变量索引。 */
  [key: string]: string | undefined;
  /** 章节内容加密密钥。 */
  CHAPTER_ENCRYPTION_KEY?: string;
}

const AES_256_KEY_BYTES = 32;
const HEX_KEY_LENGTH = AES_256_KEY_BYTES * 2;
const BASE64_KEY_MIN_LENGTH = 43;

/**
 * 获取章节内容 AES-256 加密密钥。
 * @param env 环境变量。
 * @returns 32 字节加密密钥。
 */
export function getChapterEncryptionKey(
  env: EncryptionEnv = process.env,
): Uint8Array {
  const rawKey = env.CHAPTER_ENCRYPTION_KEY?.trim();
  if (!rawKey) {
    throw new Error("CHAPTER_ENCRYPTION_KEY is required");
  }

  if (/^[\da-f]+$/i.test(rawKey) && rawKey.length === HEX_KEY_LENGTH) {
    return Buffer.from(rawKey, "hex");
  }

  if (rawKey.length >= BASE64_KEY_MIN_LENGTH) {
    const key = Buffer.from(rawKey, "base64");
    if (key.length === AES_256_KEY_BYTES) return key;
  }

  throw new Error(
    "CHAPTER_ENCRYPTION_KEY must be a 32-byte key encoded as 64 hex chars or base64",
  );
}
