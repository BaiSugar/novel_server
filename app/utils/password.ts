/** 密码最小长度。 */
export const PASSWORD_MIN_LENGTH = 8;

/** 密码最大长度，限制哈希计算成本。 */
export const PASSWORD_MAX_LENGTH = 128;

/**
 * 校验密码长度。
 * @param password 明文密码。
 * @returns 密码合法时返回 true。
 */
export function isValidPasswordLength(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH
  );
}

/**
 * 生成 Argon2id 密码哈希。
 * @param password 明文密码。
 * @returns 密码哈希。
 */
export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, {
    algorithm: "argon2id",
    memoryCost: 65536,
    timeCost: 3,
  });
}

/**
 * 校验明文密码与密码哈希是否匹配。
 * @param password 明文密码。
 * @param passwordHash 密码哈希。
 * @returns 匹配时返回 true。
 */
export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return Bun.password.verify(password, passwordHash);
}
