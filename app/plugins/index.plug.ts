import { cors } from "@elysiajs/cors";
import { openapi } from "@elysia/openapi";
import { staticPlugin } from "@elysia/static";
import { Elysia } from "elysia";
import routes from "@/support/generated/routes";
import plug_controller from "./controller.plug";

/**
 * 前端跨域来源。开发环境用 Vite 默认端口，生产环境按实际部署域名设置。
 * 配合前端 client.ts 的被动 token 刷新——前端可能与后端不同源。
 */
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";

/** 插件入口 */
export default new Elysia({ name: __filename })
  .use(
    cors({
      origin: FRONTEND_ORIGIN,
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  )
  .use(openapi())
  .use(staticPlugin())
  .use(plug_controller.use(routes));
