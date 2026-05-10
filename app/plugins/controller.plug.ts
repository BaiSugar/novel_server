import { Elysia } from "elysia";
import { isHttpError } from "@/app/lib/httpError";
import { logger } from "@/app/lib/logger";
import plug_auth from "./auth.plug";
import plug_macro from "./macro.plug";
import plug_schemas from "./schemas.plug";

/** 请求体脱敏字段。 */
const SENSITIVE_KEYS = new Set([
  "password",
  "accessToken",
  "refreshToken",
  "token",
]);

/** 开发日志开关，默认开启（`DEV_LOG=false` 关闭） */
const DEV_LOG = process.env.DEV_LOG !== "false";

/** ANSI 颜色 */
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

/**
 * 递归脱敏请求体，避免密码和令牌进入日志。
 * @param value 待脱敏值。
 * @returns 脱敏后的值。
 */
function redactSensitive(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redactSensitive);

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = SENSITIVE_KEYS.has(key)
      ? "[REDACTED]"
      : redactSensitive(item);
  }

  return result;
}

/**
 * 按 HTTP 状态码返回对应 ANSI 颜色。
 * @param code HTTP 状态码。
 * @returns ANSI 颜色码。
 */
function statusColor(code: number): string {
  if (code < 300) return GREEN;
  if (code < 400) return YELLOW;
  return RED;
}

/**
 * 按耗时返回对应 ANSI 颜色。
 * @param ms 耗时毫秒数。
 * @returns ANSI 颜色码。
 */
function elapsedColor(ms: number): string {
  if (ms < 100) return GREEN;
  if (ms < 500) return YELLOW;
  return RED;
}

/**
 * 输出一行开发日志到 stdout（请求到达时）。
 * 格式：`→ METHOD /path`
 * @param method  HTTP 方法。
 * @param pathname 请求路径。
 */
function printDevRequest(method: string, pathname: string): void {
  if (!DEV_LOG) return;
  console.log(`  ${CYAN}→ ${method.padEnd(6)}${RESET} ${pathname}`);
}

/**
 * 输出一行开发日志到 stdout（响应完成时）。
 * 格式：`  METHOD STATUS  /path  ELAPSED`
 * @param method  HTTP 方法。
 * @param status  HTTP 状态码。
 * @param pathname 请求路径。
 * @param elapsed  耗时毫秒数。
 */
function printDevLog(method: string, status: number, pathname: string, elapsed: number): void {
  if (!DEV_LOG) return;

  const m = method.padEnd(6);
  const s = status.toString();
  const c = statusColor(status);
  const e = elapsedColor(elapsed);
  const ms = `${elapsed}ms`.padStart(7);

  console.log(
    `  ${CYAN}${m}${RESET} ${c}${s}${RESET}  ${pathname}  ${e}${ms}${RESET}`,
  );
}

/**
 * 将 Elysia TypeBox 校验错误详情转为中文消息。
 * @param details 校验错误详情对象（`errors` 数组）。
 * @returns 中文错误提示。
 */
function formatValidationMessage(details: Record<string, unknown>): string {
  const errors = (details?.errors as Array<Record<string, unknown>>) ?? [];
  if (!errors.length) return "请求参数校验失败";

  const parts = errors.map((error) => {
    const path = String(error.path ?? "").replace(/^\//, "");
    const schema = error.schema as Record<string, unknown> | undefined;

    if (schema?.minLength !== undefined && schema?.maxLength !== undefined) {
      return `${path} 长度需为 ${schema.minLength}-${schema.maxLength} 位`;
    }
    if (schema?.minLength !== undefined) {
      return `${path} 长度不能少于 ${schema.minLength} 位`;
    }
    if (schema?.maxLength !== undefined) {
      return `${path} 长度不能超过 ${schema.maxLength} 位`;
    }
    if (schema?.format === "email") {
      return `${path} 格式不正确，请输入有效的邮箱地址`;
    }
    if (schema?.pattern) {
      return `${path} 格式不正确`;
    }

    const msg = String(error.message ?? "");
    if (msg.includes("minLength")) return `${path} 长度不足`;
    if (msg.includes("maxLength")) return `${path} 长度超出限制`;
    if (msg.includes("format") || msg.includes("pattern")) return `${path} 格式不正确`;

    return `${path}: ${error.summary || error.message || "校验失败"}`;
  });

  return parts.join("；");
}

/** 控制器插件 */
export default new Elysia({ name: __filename })
  .use(plug_schemas)
  .use(plug_macro)
  .use(plug_auth)
  .derive({ as: "global" }, () => ({
    requestId: crypto.randomUUID(),
    /** 请求开始时间戳，用于计算耗时 */
    startTime: Date.now(),
  }))
  .onBeforeHandle(({ request, body }) => {
    const pathname = new URL(request.url).pathname;
    printDevRequest(request.method, pathname);
    logger.info(
      `[request] ${request.method} ${request.url}`,
      body !== undefined ? { body: redactSensitive(body) } : body,
    );
  })
  .onAfterResponse(({ set, request, startTime }) => {
    const elapsed = Date.now() - startTime;
    const pathname = new URL(request.url).pathname;
    const status = Number(set.status) || 200;

    logger.info(`[response] ${request.method} ${pathname} ${status} ${elapsed}ms`);

    printDevLog(request.method, status, pathname, elapsed);
  })
  .onError(({ error: errObj, code, request, set, requestId }) => {
    const err = errObj instanceof Error ? errObj : new Error(String(errObj));
    let errorCode = "INTERNAL_ERROR";
    let details: unknown;

    if (isHttpError(errObj)) {
      set.status = errObj.status;
      errorCode = errObj.errorCode;
    }

    try {
      if (code === "VALIDATION") {
        set.status = 400;
        errorCode = "VALIDATION_ERROR";
        const parsed = JSON.parse(err.message);
        details = parsed;
      }
    } catch (parseError) {
      logger.error((parseError as Error).message, parseError as Error);
    }

    if (typeof set.status !== "number") set.status = 500;

    logger.error(`${request.method} ${new URL(request.url).pathname}`, {
      errorCode,
      msg: err.message,
      stack: err.stack,
    });

    const message = details
      ? formatValidationMessage(details as Record<string, unknown>)
      : err.message;

    set.headers["content-type"] = "application/json";
    return {
      code: errorCode,
      message,
      requestId,
      ...(details ? { details } : {}),
    };
  });
