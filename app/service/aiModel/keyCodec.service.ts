import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getAiProviderKeySecret } from "@/app/config/ai";

const VERSION = 1;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const HEADER_BYTES = 1 + IV_BYTES + AUTH_TAG_BYTES;
const ALGORITHM = "aes-256-gcm";

/**
 * 加密 Provider API Key。
 * @param plaintext API Key 明文。
 * @returns base64 存储串。
 */
export function encryptProviderApiKey(plaintext: string): string {
  const key = getAiProviderKeySecret();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_BYTES,
  });
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(plaintext, "utf8")),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  const output = Buffer.alloc(HEADER_BYTES + encrypted.length);
  output[0] = VERSION;
  output.set(iv, 1);
  output.set(authTag, 1 + IV_BYTES);
  output.set(encrypted, HEADER_BYTES);
  return output.toString("base64");
}

/**
 * 解密 Provider API Key。
 * @param stored base64 存储串。
 * @returns API Key 明文。
 */
export function decryptProviderApiKey(stored: string): string {
  const raw = Buffer.from(stored, "base64");
  if (raw.length < HEADER_BYTES || raw[0] !== VERSION) {
    throw new Error("Invalid encrypted provider key format");
  }

  const key = getAiProviderKeySecret();
  const iv = raw.subarray(1, 1 + IV_BYTES);
  const authTag = raw.subarray(1 + IV_BYTES, HEADER_BYTES);
  const encrypted = raw.subarray(HEADER_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_BYTES,
  });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8",
  );
}

/**
 * 掩码显示 Provider API Key。
 * @param apiKey API Key 明文或密文。
 * @returns 掩码字符串。
 */
export function maskProviderApiKey(apiKey: string): string {
  if (!apiKey) return "";
  const tail = apiKey.slice(-4);
  const head = apiKey.slice(0, Math.min(3, apiKey.length));
  return `${head}****${tail}`;
}
