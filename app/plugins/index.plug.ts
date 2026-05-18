import { openapi } from "@elysia/openapi";
import { staticPlugin } from "@elysia/static";
import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import routes from "@/support/generated/routes";
import plug_controller from "./controller.plug";

/**
 * 前端跨域来源，逗号分隔多个域名。
 * 开发环境默认 localhost:3000，生产环境按实际部署域名设置。
 */
function buildOrigins(): string | string[] {
  const raw = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";
  const origins = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return origins.length === 1 ? origins[0]! : origins;
}

/** 插件入口 */
export default new Elysia({ name: __filename })
  .use(
    cors({
      origin: buildOrigins(),
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  )
  .use(openapi())
  .use(staticPlugin())
  .use(plug_controller.use(routes));
