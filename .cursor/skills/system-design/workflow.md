# 设计工作流（五阶段）

每阶段必须产出明确结果，才能进入下一阶段；若中途发现上一阶段缺漏，回到对应阶段补齐。

---

## 阶段 1：需求澄清

目标：把模糊描述转成可设计的需求清单。

必须明确：

| 维度 | 内容 |
|------|------|
| 业务目标 | 一句话说明这个功能解决什么问题 |
| 使用者 | 面向哪些角色（ADMIN / AUTHOR / 未登录） |
| 核心操作 | 创建/读取/更新/删除/列表/其他特殊动作（发布、归档、审核…） |
| 输入输出 | 关键字段；哪些是用户输入、哪些是服务端派生 |
| 鉴权要求 | 是否需要登录？是否需要角色或权限？是否需要资源归属校验（userId 匹配）？ |
| 限流要求 | 是否需要 IP 或用户级限流（参考 `ratelimit.plug.ts`） |
| 审计要求 | 是否为敏感/重要操作，需要记录审计日志（类别 + 动作） |
| 幂等性 | POST 是否需要防重入；是否需要唯一键约束 |
| 非功能约束 | 数据量级、并发、延迟、是否涉及加密存储 |

产出：**需求清单**（列表形式，不写代码）。

卡壳信号：如果任一维度无法明确，调用 `AskQuestion` 向用户确认，而不是自行臆测。

---

## 阶段 2：数据模型设计

目标：确定 Prisma schema 变更，并与既有模型保持一致。

必须覆盖：

1. **新增/修改的实体**
   - 实体名（PascalCase 单数）
   - 所属业务域（与 service 目录对应）
   - 业务含义（一句话）

2. **字段清单**（逐字段列出）
   - 名称（camelCase）
   - Prisma 类型（含长度约束，如 `VarChar(128)`）
   - 可空性（`?` 或必填）
   - 默认值
   - 是否唯一 / 是否索引
   - 业务含义与取值范围

3. **关系**
   - 外键指向
   - 级联策略（`onDelete: Cascade / SetNull / Restrict`）
   - 反向关系名

4. **枚举**
   - 枚举名与取值
   - 是否已有类似枚举可复用（避免重复定义）

5. **索引策略**
   - 常用查询条件是否有索引覆盖
   - 复合索引列顺序

6. **迁移策略**
   - 新表 / 加列 / 改列 / 删列
   - 是否需要数据回填
   - 是否破坏性变更（DROP / 类型收窄）

产出：**Prisma 片段 + 字段表 + 迁移说明**。

反模式检查：

- ❌ 把多个无关业务放进同一张表
- ❌ 用 JSON 字段塞结构化数据（除非确实是非结构化附加信息）
- ❌ 冗余字段可以由其他字段派生
- ❌ 命名不遵循既有约定（如 `userId` 写成 `uid`、`createdAt` 写成 `created_time`）

---

## 阶段 3：接口契约设计

目标：列全所有对外 HTTP 端点，确定路径、方法、schema、错误码。

每个端点必须包含：

| 项目 | 说明 |
|------|------|
| 方法 + 路径 | 如 `POST /v1/novel/books` |
| 鉴权 | `requireAuth` / `requireRole('ADMIN')` / `requirePermission('novel.write')` / 公开 |
| 参数 | path / query / body 各自的 TypeBox schema 概要 |
| 响应 | `$g.success(data)` 的 data 结构 |
| 错误场景 | 触发的 `HttpError` 列表与错误码（400/401/403/404/409/422） |
| 幂等 | 是否幂等；非幂等 POST 是否需要唯一键或前端重试保护 |
| 审计 | 是否记录，类别 + 动作名 |
| 限流 | 是否需要特殊限流策略 |

路径约定：

- `/v1/<domain>/<resource>`；URL 前缀由 controller 目录名决定，不在代码里硬写
- 资源名用复数（`books` / `chapters` / `prompts`）
- 子资源嵌套不超过 2 层（`books/:bookId/chapters` OK；`books/:bookId/chapters/:chapterId/comments/:commentId` 过深）

产出：**端点表 + 每个端点的 schema 概要**。

检查：

- 是否所有端点都能在 `AUDIT_REGISTRY.prefix` 下被正确归类
- 列表端点是否有分页（`page` / `pageSize` 或 `cursor`）和排序参数
- 是否遵循 REST 语义（GET 幂等、DELETE 幂等、POST 创建、PUT/PATCH 更新）

---

## 阶段 4：分层与模块拆分

目标：列清全部文件改动，明确函数签名与跨文件依赖。

按下表逐层列出：

### Controller 层

| 文件 | 新增/修改 | 端点 | 依赖的 service 函数 |
|------|-----------|------|---------------------|
| `app/controller/v1/<domain>/<name>.ctrl.ts` | 新增 | GET/POST/... | `<Service>.xxx` |

Controller 只做三件事：参数校验（Elysia schema）、调用 service、用 `$g.success()` 组装响应。

### Service 层

| 文件 | 函数 | 入参类型 | 返回类型 | 业务职责 |
|------|------|----------|----------|----------|
| `app/service/<domain>/<name>.service.ts` | `create` | `CreateInput` | `Promise<Entity>` | 写入 + 审计前置 |

每个 service 函数必须：

- 显式入参类型（禁止 `any`）
- 显式 `Promise<T>` 返回类型
- JSDoc 注释
- 通过 `throw new HttpError()` 抛错，不返回错误对象
- 不直接操作 HTTP 对象（`set`、`headers`、`cookie`）

### Lib / Utils

| 文件 | 内容 | 是否已有 |
|------|------|----------|
| `app/lib/xxx.ts` | 基础设施（无业务语义） | — |
| `app/utils/xxx.ts` | 纯函数工具 | — |

判断归属：

- 基础设施（Prisma/Logger/Redis/HttpError/Audit）→ `lib/`
- 纯函数工具（密码哈希、编码解码、字数统计）→ `utils/`
- 业务逻辑 → `service/`

### Common

- 新增权限 → `app/common/permission.ts` 的 `Permission` 联合类型与 `ROLE_PERMISSIONS`
- 新增跨域共享 schema → `app/common/schemas.ts`

### Plugins

一般不需要改动，除非：

- 新增全局鉴权/校验/装饰器 → 修改 `plugins/`
- 新增审计类别 → `AUDIT_REGISTRY` + `AuditCategory`

产出：**文件清单表 + 每个导出函数的签名**。

---

## 阶段 5：落地清单

把前四阶段汇总成可执行的改动列表，按顺序排列：

1. **Prisma schema 变更**
   - 修改 `prisma/schema.prisma`
   - 创建迁移：`bunx --bun prisma migrate dev --name <description>`
   - 生成客户端：`bun run prisma_generate`

2. **Common 层变更**（如有）
   - `app/common/permission.ts` 扩展权限
   - `app/common/schemas.ts` 导出新 schema

3. **Service 层实现**
   - 按文件清单逐个实现
   - 每个函数写 JSDoc 与返回类型

4. **Controller 层实现**
   - 按文件清单逐个实现
   - 定义 Elysia schema、挂鉴权宏

5. **路由与文档同步**
   - 执行 `bun run generate_script`
   - 更新 `docs/project-structure.md`（新增/删除/移动文件）
   - 更新 `docs/api.md`（新增端点）

6. **审计登记**（如涉及敏感操作）
   - `app/plugins/controller.plug.ts` 的 `AUDIT_REGISTRY` 追加
   - 如新类别：`app/lib/audit.ts` 的 `AuditCategory` 扩展

7. **类型与格式检查**
   - `bunx --bun tsc --noEmit`
   - `bun run fix`

8. **风险验证**
   - 列出需要人工验证的场景（破坏性迁移、密钥变更、跨域影响）

产出：**按顺序的落地步骤清单**，每一步可独立执行与验证。