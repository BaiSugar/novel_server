export { logger } from "@/app/lib/logger";
export { prisma } from "@/app/lib/prisma";
export { redis } from "@/app/lib/redis";
export { ResSchemaFun } from "./schemaDerive";

import type controller from "@/app/plugins/controller.plug";
import type { ResType } from "./schemaDerive";

/** 控制器工厂 */
export const ctrl = <T>(fun: (app: typeof controller) => T) => fun;

/** 成功响应 */
export function success<T>(data: T, message = ""): ResType<T> {
  return { message, code: "SUCCESS", data };
}

/** 错误响应 */
export function error(message = "", code = "ERROR"): ResType<null> {
  return { message, code };
}
