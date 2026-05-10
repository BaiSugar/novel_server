// 这里导出的模型都将使用 elysia.model() 注册，也只能导出 具名 TypeBox schema
import { t } from "elysia";

export * from "@/support/generated/schema";

/** 响应模型 */
export const ResSchema = t.Object({
  /** 业务状态码 */
  code: t.String(),
  /** 人类可读的描述信息 */
  message: t.String(),
  /** 响应数据 */
  data: t.Optional(t.Unknown()),
  /** 请求追踪 ID */
  requestId: t.Optional(t.String()),
  /** 额外错误详情 */
  details: t.Optional(t.Unknown()),
});
