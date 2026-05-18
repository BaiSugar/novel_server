/**
 * @file audit.ts
 * @description 结构化审计日志，按业务类别分文件，满 10MB 自动轮转
 *
 * 文件命名规则：
 *   logs/audit/auth/2026-05-10T18-30-00-000Z.log
 *   logs/audit/novel/2026-05-10T19-15-22-456Z.log
 *
 * 轮转逻辑：
 *   当前文件超过 MAX_FILE_BYTES（10MB）时，下次写入自动创建新文件，
 *   新文件名使用当前时间戳。
 *
 * 每行一条独立 JSON，可直接用 jq / grep 查询：
 *   cat logs/audit/auth/*.log | jq 'select(.action=="login")'
 *   grep '"category":"novel"' logs/audit/novel/*.log | wc -l
 *
 * 年度回顾：
 *   文件名含时间戳，可按前缀筛选年份：
 *   cat logs/audit/auth/2026-*.log | jq -s 'group_by(.action) | ...'
 */

import { appendFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

// ─── 类型 ────────────────────────────────────────────────────────────────────

/** 审计日志类别。 */
export type AuditCategory =
  | "auth"
  | "novel"
  | "prompt"
  | "prompt_category"
  | "creative_tool"
  | "ai"
  | "security"
  | "system";

/** 审计日志条目。 */
export interface AuditEntry {
  /** ISO 8601 时间戳。 */
  timestamp: string;
  /** 业务类别。 */
  category: AuditCategory;
  /** 操作动作。 */
  action: string;
  /** 操作用户 ID（未登录时为 null）。 */
  userId: number | null;
  /** 请求追踪 ID。 */
  requestId: string;
  /** 客户端 IP。 */
  ip: string;
  /** 额外上下文数据。 */
  data?: Record<string, unknown>;
}

// ─── 常量 ────────────────────────────────────────────────────────────────────

/** 审计日志根目录。 */
const AUDIT_DIR = "logs/audit";

/** 单文件最大字节数（10MB）。 */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

// ─── 工具 ────────────────────────────────────────────────────────────────────

/**
 * 生成 ISO 时间戳文件名（不含冒号，兼容 Windows）。
 * 格式：2026-05-10T18-30-00-000Z
 */
function timestampName(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const mo = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const h = String(now.getUTCHours()).padStart(2, "0");
  const mi = String(now.getUTCMinutes()).padStart(2, "0");
  const s = String(now.getUTCSeconds()).padStart(2, "0");
  const ms = String(now.getUTCMilliseconds()).padStart(3, "0");
  return `${y}-${mo}-${d}T${h}-${mi}-${s}-${ms}Z`;
}

/**
 * 获取当前活跃文件路径，满 10MB 时自动轮转到新文件。
 * @param dir 类别目录。
 * @param currentPath 当前活跃文件路径（可能已满）。
 * @returns 新的（或当前的）文件路径。
 */
function resolveCurrentFile(dir: string, currentPath: string): string {
  if (currentPath && existsSync(currentPath)) {
    try {
      if (statSync(currentPath).size < MAX_FILE_BYTES) return currentPath;
    } catch {
      /* stat 失败则创建新文件 */
    }
  }
  return join(dir, `${timestampName()}.log`);
}

// ─── 审计 Logger ──────────────────────────────────────────────────────────────

/** 审计日志写入器。单例，进程级别。 */
class AuditLogger {
  /** 当前各分类的活跃文件路径缓存。 */
  private currentPaths = new Map<AuditCategory, string>();

  /**
   * 写入一条审计日志。
   * @param entry 审计条目。
   */
  write(entry: AuditEntry): void {
    const dir = join(AUDIT_DIR, entry.category);

    try {
      mkdirSync(dir, { recursive: true });

      const current = this.currentPaths.get(entry.category) ?? "";
      const filePath = resolveCurrentFile(dir, current);
      this.currentPaths.set(entry.category, filePath);

      const line = JSON.stringify(entry) + "\n";
      appendFileSync(filePath, line);
    } catch (err) {
      process.stderr.write(`[audit] write error: ${err}\n`);
    }
  }

  /**
   * 便捷方法：记录认证事件。
   * @param action 动作（login / register / refresh / logout）。
   * @param userId 用户 ID。
   * @param requestId 请求追踪 ID。
   * @param ip 客户端 IP。
   * @param data 额外数据。
   */
  auth(
    action: string,
    userId: number | null,
    requestId: string,
    ip: string,
    data?: Record<string, unknown>,
  ): void {
    this.write({
      timestamp: new Date().toISOString(),
      category: "auth",
      action,
      userId,
      requestId,
      ip,
      data,
    });
  }

  /**
   * 便捷方法：记录作品事件。
   * @param action 动作（create / update / delete）。
   * @param userId 用户 ID。
   * @param requestId 请求追踪 ID。
   * @param ip 客户端 IP。
   * @param data 额外数据（如 bookId、title）。
   */
  novel(
    action: string,
    userId: number,
    requestId: string,
    ip: string,
    data?: Record<string, unknown>,
  ): void {
    this.write({
      timestamp: new Date().toISOString(),
      category: "novel",
      action,
      userId,
      requestId,
      ip,
      data,
    });
  }

  /**
   * 便捷方法：记录提示词事件。
   * @param action 动作（create / update / delete / approve / restore_version）。
   * @param userId 用户 ID。
   * @param requestId 请求追踪 ID。
   * @param ip 客户端 IP。
   * @param data 额外数据（如 promptId、name）。
   */
  prompt(
    action: string,
    userId: number,
    requestId: string,
    ip: string,
    data?: Record<string, unknown>,
  ): void {
    this.write({
      timestamp: new Date().toISOString(),
      category: "prompt",
      action,
      userId,
      requestId,
      ip,
      data,
    });
  }

  /**
   * 便捷方法：记录 AI 生成事件。
   * @param action 动作。
   * @param userId 用户 ID。
   * @param requestId 请求追踪 ID。
   * @param ip 客户端 IP。
   * @param data 额外数据。
   */
  ai(
    action: string,
    userId: number,
    requestId: string,
    ip: string,
    data?: Record<string, unknown>,
  ): void {
    this.write({
      timestamp: new Date().toISOString(),
      category: "ai",
      action,
      userId,
      requestId,
      ip,
      data,
    });
  }

  /**
   * 便捷方法：记录安全事件。
   * @param action 动作（rate_limited / token_reuse / banned_login / password_changed）。
   * @param userId 用户 ID（可能为 null）。
   * @param requestId 请求追踪 ID。
   * @param ip 客户端 IP。
   * @param data 额外数据。
   */
  security(
    action: string,
    userId: number | null,
    requestId: string,
    ip: string,
    data?: Record<string, unknown>,
  ): void {
    this.write({
      timestamp: new Date().toISOString(),
      category: "security",
      action,
      userId,
      requestId,
      ip,
      data,
    });
  }

  /**
   * 便捷方法：记录系统事件。
   * @param action 动作（startup / shutdown / migration / error）。
   * @param requestId 请求追踪 ID。
   * @param data 额外数据。
   */
  system(
    action: string,
    requestId: string,
    data?: Record<string, unknown>,
  ): void {
    this.write({
      timestamp: new Date().toISOString(),
      category: "system",
      action,
      userId: null,
      requestId,
      ip: "",
      data,
    });
  }
}

/** 全局审计日志单例。 */
export const audit = new AuditLogger();
