import { Elysia } from "elysia";

/** 限流存储条目。 */
interface RateEntry {
  /** 当前窗口剩余请求数。 */
  remaining: number;
  /** 窗口过期时间戳（ms）。 */
  resetAt: number;
}

/** 内存限流存储：`ip:path` → RateEntry */
const store = new Map<string, RateEntry>();

/** 定时清理过期条目（每 60 秒）。 */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}, 60_000).unref();

/** 限流选项。 */
export interface RateLimitOptions {
  /** 时间窗口（秒）。 */
  windowSeconds?: number;
  /** 窗口内最大请求数。 */
  maxRequests?: number;
}

/**
 * 内存 IP 限流插件。
 * 通过 `requireRateLimit` 宏按路由启用。
 *
 * 超过限制时返回 429 + 标准错误信封，响应头包含 `X-RateLimit-*` 信息。
 */
export default new Elysia({ name: "rateLimit" })
  .macro({
    /**
     * 限制当前路由的请求频率（基于 IP + 路径）。
     * @param options 限流选项。
     * @returns Elysia beforeHandle 钩子。
     */
    requireRateLimit(options?: RateLimitOptions) {
      if (!options) return {};

      const windowMs = (options.windowSeconds ?? 60) * 1000;
      const max = options.maxRequests ?? 10;

      return {
        beforeHandle({ request, set }) {
          const ip =
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
            request.headers.get("x-real-ip") ??
            "127.0.0.1";

          const pathname = new URL(request.url).pathname;
          const key = `${ip}:${pathname}`;

          const now = Date.now();
          let entry = store.get(key);

          if (!entry || entry.resetAt <= now) {
            entry = { remaining: max - 1, resetAt: now + windowMs };
            store.set(key, entry);
          } else {
            entry.remaining--;
          }

          set.headers["X-RateLimit-Limit"] = String(max);
          set.headers["X-RateLimit-Remaining"] = String(Math.max(0, entry.remaining));
          set.headers["X-RateLimit-Reset"] = String(Math.ceil(entry.resetAt / 1000));

          if (entry.remaining < 0) {
            set.status = 429;
            return {
              code: "RATE_LIMITED",
              message: `请求过于频繁，请 ${Math.ceil((entry.resetAt - now) / 1000)} 秒后重试`,
            };
          }
        },
      };
    },
  });