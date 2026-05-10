/** 数据库环境配置。 */
export interface DatabaseEnv {
  /** 环境变量索引。 */
  [key: string]: string | undefined;
  /** 数据库类型。 */
  DATABASE_TYPE?: string;
  /** 数据库主机。 */
  DATABASE_HOST?: string;
  /** 数据库端口。 */
  DATABASE_PORT?: string;
  /** 默认数据库名。 */
  DATABASE_NAME?: string;
  /** 数据库用户。 */
  DATABASE_USER?: string;
  /** 数据库密码。 */
  DATABASE_PASSWORD?: string;
}

/**
 * 基于环境配置生成数据库连接串。
 * @param env 数据库环境配置。
 * @param databaseName 数据库名称，默认使用 env.DATABASE_NAME。
 * @returns 数据库连接串。
 */
export function buildDatabaseUrl(
  env: DatabaseEnv,
  databaseName = env.DATABASE_NAME,
): string {
  const type = env.DATABASE_TYPE?.trim();
  const host = env.DATABASE_HOST?.trim();
  const port = env.DATABASE_PORT?.trim();
  const name = databaseName?.trim();
  const user = env.DATABASE_USER?.trim();
  const password = env.DATABASE_PASSWORD;

  if (!type || !host || !port || !name || !user || password === undefined) {
    throw new Error(
      "DATABASE_TYPE, DATABASE_HOST, DATABASE_PORT, DATABASE_NAME, DATABASE_USER and DATABASE_PASSWORD are required",
    );
  }

  const username = encodeURIComponent(user);
  const encodedPassword = encodeURIComponent(password);
  const database = encodeURIComponent(name);

  return `${type}://${username}:${encodedPassword}@${host}:${port}/${database}`;
}
