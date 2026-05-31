import { $ } from "bun";
import { buildDatabaseUrl } from "@/app/config/database";
import { logger } from "@/app/lib/logger";

/**
 * 启动时自动应用待执行的 Prisma 迁移。
 * 迁移已应用时幂等跳过，多进程场景下 Prisma 内置 advisory lock 防止并发。
 * @returns 无返回值。
 */
export async function applyMigrations(): Promise<void> {
  try {
    await $`bunx --bun prisma migrate deploy`
      .env({ ...process.env, DATABASE_URL: buildDatabaseUrl(process.env) })
      .quiet();
    logger.info("[bootstrap] migrations applied");
  } catch (error) {
    logger.error("[bootstrap] migration failed", error as Error);
    throw error;
  }
}
