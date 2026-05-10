import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { getChapterEncryptionKey } from "@/app/config/encryption";

const VERSION = 1;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const HEADER_BYTES = 1 + IV_BYTES + AUTH_TAG_BYTES;
const ALGORITHM = "aes-256-gcm";

/**
 * 将章节明文压缩并加密为数据库存储值。
 * @param content 章节明文。
 * @returns 压缩加密后的二进制内容。
 */
export function encodeChapterContent(content: string): Uint8Array<ArrayBuffer> {
  const key = getChapterEncryptionKey();
  const iv = randomBytes(IV_BYTES);
  const compressed = gzipSync(Buffer.from(content, "utf8"));
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_BYTES });
  const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const output = Buffer.alloc(HEADER_BYTES + encrypted.length);
  output[0] = VERSION;
  output.set(iv, 1);
  output.set(authTag, 1 + IV_BYTES);
  output.set(encrypted, HEADER_BYTES);
  return new Uint8Array(output);
}

/**
 * 将数据库中的章节内容解密解压为明文。
 * @param stored 数据库二进制内容。
 * @returns 章节明文。
 */
export function decodeChapterContent(stored: Uint8Array): string {
  if (stored.length < HEADER_BYTES || stored[0] !== VERSION) {
    throw new Error("Invalid encrypted chapter content format");
  }

  const key = getChapterEncryptionKey();
  const iv = stored.subarray(1, 1 + IV_BYTES);
  const authTag = stored.subarray(1 + IV_BYTES, HEADER_BYTES);
  const encrypted = stored.subarray(HEADER_BYTES);

  if (authTag.length !== AUTH_TAG_BYTES) {
    throw new Error("Invalid encrypted chapter content authentication tag");
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_BYTES,
  });
  decipher.setAuthTag(authTag);
  const compressed = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return gunzipSync(compressed).toString("utf8");
}
