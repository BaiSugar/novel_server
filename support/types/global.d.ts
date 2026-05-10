import type * as common from "@/app/common";
import type controller from "@/app/plugins/controller.plug";
import type { CurrentUser } from "@/app/service/auth.service";

declare global {
  /** 唯一全局变量（不建议增加更多了） */
  const $g: typeof common;
  type Ctrl = typeof controller;
  /** 带认证上下文的控制器处理上下文。 */
  interface AuthContext {
    /** 当前请求用户，未登录时为 null。 */
    currentUser: CurrentUser | null;
  }
}
