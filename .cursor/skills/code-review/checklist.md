# 审查检查清单

## 1. 禁止硬编码

| 检查项 | 应存放位置 | 说明 |
|--------|-----------|------|
| 接口地址/路径 | Controller 内通过 Elysia schema 定义路由 | service 和 controller 中不得出现 HTTP 路径字符串用于发起请求 |
| 配置值 | `.env` + `app/config/` | 超时、密钥、地址等不得写死 |
| 错误提示 | 通过 `throw new HttpError(message, status)` 统一抛出 | 不得在 service 中返回自定义错误对象 |
| 业务枚举 | Prisma schema enum 或 `app/common/` 常量 | 状态值、类型标签等 |

**检查方法**：
- 搜索数字/字符串字面量出现在函数体中但无全局来源
- 搜索 `"http://`、`"https://` 等 URI
- 搜索硬编码的错误消息中文文本

## 2. 禁止无意义内容

| 检查项 | 判断标准 |
|--------|---------|
| 空包装函数 | 函数仅调用另一个函数，无额外逻辑或类型转换 |
| 占位实现 | `return {}`、`throw new Error("TODO")` 等未完成代码 |
| 无用注释 | `// 获取数据`、`// 返回结果` 等描述代码表面行为 |
| 无用依赖 | `package.json` 中存在但代码中未 import 的依赖 |
| 无用文件 | 未被任何地方引用的 `.ts` 文件 |
| 未引用导出 | 导出了但未被任何地方 import 的函数/类型/常量 |

## 3. 禁止 OOT（偏离当前任务）

| 检查项 | 判断标准 |
|--------|---------|
| 范围外功能 | 是否实现了任务要求之外的 API、数据模型、工具函数 |
| 过度拆分 | 是否将 < 10 行的函数独立成文件，或创建了无独立业务语义的函数 |
| 未来预留 | 是否添加了"以后会用"的参数、字段、配置项、空目录 |

## 4. 项目结构同步

| 检查项 | 判断标准 |
|--------|---------|
| `project-structure.md` | 新增/删除/移动文件后，`docs/project-structure.md` 是否已更新 |
| 路由同步 | 新增/删除/移动 controller 文件后，是否执行了 `bun run generate_script` |
| 命名规范 | 文件名是否符合 `*.ctrl.ts` / `*.service.ts` / `*.plug.ts` 后缀约定 |

## 5. JSDoc 与类型安全

| 检查项 | 判断标准 |
|--------|---------|
| JSDoc | 所有 export 的函数、接口、类型是否有 `/** */` 注释 |
| 入参类型 | 函数入参是否有明确类型（禁止 `any`） |
| 返回值类型 | 函数是否有明确返回类型（禁止隐式 `any`） |
| 类型完整性 | Controller 中 body/params/query 是否都有 Elysia schema 校验 |

## 6. Controller / Service 分层

| 检查项 | 判断标准 |
|--------|---------|
| Controller 薄 | Controller 只做参数校验 + 调用 service + 组装响应 |
| Service 厚 | 所有业务逻辑、数据库操作在 service 层 |
| 错误抛出 | Service 通过 `throw new HttpError()` 抛错，不在 controller 中手动构建错误响应 |
| 鉴权依赖 | Controller 不直接调用 Prisma 或 token 工具，通过 service 获取 |

## 7. 响应格式一致性

| 检查项 | 判断标准 |
|--------|---------|
| 成功响应 | 必须通过 `$g.success(data, message?)` 返回 |
| 错误响应 | 必须通过 `throw new HttpError(message, status)` |
| 信封完整 | 所有响应必须包含 `code`、`message`、`requestId` |