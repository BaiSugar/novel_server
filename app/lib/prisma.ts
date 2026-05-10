import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { buildDatabaseUrl } from "@/app/config/database";
import { PrismaClient } from "@/app/generated/prisma/client";
import { logger } from "@/app/lib/logger";

/** Prisma MariaDB 适配器。 */
const adapter = new PrismaMariaDb(buildDatabaseUrl(process.env));

/** Prisma 客户端单例。 */
const prisma = new PrismaClient({
  adapter,
  log: ["warn", "error"],
});

prisma
  .$connect()
  .then(() => logger.info("[prisma] connected"))
  .catch((error: unknown) => {
    logger.error("[prisma] connection failed", error as Error);
  });

export { prisma };
export default prisma;
