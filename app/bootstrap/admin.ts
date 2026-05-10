import { UserRole, UserStatus } from "@/app/generated/prisma/enums";
import { logger } from "@/app/lib/logger";
import { prisma } from "@/app/lib/prisma";
import { hashPassword, isValidPasswordLength } from "@/app/utils/password";

/** 管理员引导配置。 */
interface BootstrapAdminConfig {
  /** 管理员用户名。 */
  username: string;
  /** 管理员邮箱。 */
  email: string;
  /** 管理员明文密码。 */
  password: string;
}

/** 管理员查询字段。 */
const adminQueryFields = {
  id: true,
  email: true,
} as const;

/**
 * 读取管理员引导配置。
 * @returns 管理员引导配置。
 */
function getBootstrapAdminConfig(): BootstrapAdminConfig {
  const username = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim();
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!username || !email || !password) {
    throw new Error(
      "BOOTSTRAP_ADMIN_USERNAME, BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are required",
    );
  }

  if (!isValidPasswordLength(password)) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD length must be 8-128 chars");
  }

  return { username, email, password };
}

/**
 * 首次启动时创建管理员。
 * @returns 无返回值。
 */
export async function bootstrapAdmin(): Promise<void> {
  const existingAdmin = await prisma.user.findFirst({
    where: { role: UserRole.ADMIN },
    select: adminQueryFields,
  });

  if (existingAdmin) return;

  const config = getBootstrapAdminConfig();
  const passwordHash = await hashPassword(config.password);
  const admin = await prisma.user.upsert({
    where: { email: config.email },
    update: {
      passwordHash,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
    create: {
      username: config.username,
      email: config.email,
      passwordHash,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
    select: adminQueryFields,
  });

  logger.info(`[bootstrap] admin ready: ${admin.email}`);
}
