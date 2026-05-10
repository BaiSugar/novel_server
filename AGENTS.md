# Novel - AI 网文写作平台后端

## 技术栈

| 层 | 选型 | 版本 |
|---|------|------|
| Runtime | Bun | 最新稳定版 |
| Web 框架 | Elysia | 1.4.x |
| ORM | Prisma | 7.x |
| 数据库 | MySQL (MariaDB 适配器) | — |
| 缓存 | Redis (可选) | — |
| 代码格式 | Biome | 2.x |
| 类型检查 | tsc --noEmit | — |

参考 `package.json` 确定精确版本号。

---

## 架构

### 分层模型

```
请求 → plugins 链 → controller → service → Prisma → MySQL
                         ↑                    ↑
                       $g (仅 controller 层可用)
```

- **plugins**：Elysia 插件链，负责鉴权、数据校验、响应格式化、请求日志、路由挂载。
- **controller**：薄层，负责参数校验(Elysia schema)、调用 service、组装响应。不包含业务逻辑。
- **service**：厚层，承载全部业务逻辑、数据库操作、错误抛出。被 controller 和 plugin 引用。
- **lib**：基础设施，不感知业务。Prisma 客户端、Logger、HttpError、Redis 客户端、全局错误捕获。

### 插件链顺序

```
schemas.plug → macro.plug → auth.plug → [自动路由]
```

1. **schemas.plug**：注册 `app/common/schemas.ts` 中导出的 TypeBox 模型为 `elysia.model()`。
2. **macro.plug**：注册 `res()` 宏，统一包装响应格式校验。
3. **auth.plug**：解析 `Authorization: Bearer <token>`，注入 `currentUser`；注册 `requireAuth` / `requireRole` / `requirePermission` 宏。
4. **自动路由**：`support/script/index.ts` 扫描 `app/controller/**/*.ctrl.ts` 生成 `support/generated/routes.ts`，由 `controller.plug` 挂载。

### 请求生命周期

```
derive(requestId, startTime)
  → onBeforeHandle (脱敏日志，文件落盘)
  → auth.plug derive (currentUser 解析)
  → controller handler
  → onAfterResponse (响应日志 + 彩色开发日志)
  → onError (统一错误格式化，如 handler 抛错)
```

`onAfterResponse` 在正常和异常响应后均会触发。

---

## 目录结构

完整的项目目录树、分层原则、业务域状态见 [`docs/project-structure.md`](docs/project-structure.md)。

**新增/删除/移动文件或文件夹后，必须同步更新 `docs/project-structure.md`。**

---

## 数据模型

### User

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Int (自增) | 主键 |
| username | VarChar(64) UNIQUE | 用户名 |
| email | VarChar(255) UNIQUE | 邮箱 |
| passwordHash | VarChar(255) | Argon2id 哈希 |
| role | enum(ADMIN, AUTHOR) | 默认 AUTHOR |
| status | enum(ACTIVE, BANNED, DELETED) | 默认 ACTIVE |
| lastLoginAt | DateTime? | 最后登录时间 |
| createdAt / updatedAt | DateTime | 自动时间戳 |

### RefreshToken

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Int (自增) | 主键 |
| userId | Int → User | 外键，级联删除 |
| tokenHash | Char(64) UNIQUE | Refresh Token 的 SHA-256 不可逆哈希 |
| family | Char(36) | 令牌族 UUID，用于复用检测和批量撤销 |
| expiresAt | DateTime | 过期时间 |
| revokedAt | DateTime? | 撤销时间（非 null 即已撤销） |

---

## 鉴权系统

### 整体流程

```
注册/登录 → 签发 accessToken (JWT 15min) + refreshToken (随机 48 字节, DB 仅存 SHA-256)
    ↓
后续请求 → Authorization: Bearer <accessToken>
    ↓
auth.plug derive → 验证 JWT → 查 DB 确认用户存在且 ACTIVE → 注入 currentUser
    ↓
过期后 → POST /auth/refresh { refreshToken } → 轮换令牌对 (旧族全部撤销)
```

### 安全特性

- 密码：Argon2id，memoryCost=65536，timeCost=3
- Refresh Token：数据库仅存 SHA-256 哈希，明文只返回一次
- 令牌族：检测 refresh token 复用，一旦复用立即撤销整个族
- 用户枚举防护：账号不存在和密码错误返回相同的 "账号或密码错误"

### 角色与权限

| 角色 | 权限 |
|------|------|
| ADMIN | account.manage, novel.write |
| AUTHOR | novel.write |

权限映射在 `app/common/permission.ts` 集中管理。

---

## 响应约定

### 信封格式

```typescript
{
  code: string;      // "SUCCESS" | "UNAUTHORIZED" | "FORBIDDEN" | "INTERNAL_ERROR" | ...
  message: string;   // 人类可读描述
  data?: T;          // 仅成功时存在
  requestId?: string; // 请求追踪 ID
  details?: unknown;  // 仅校验错误时存在
}
```

### 错误码映射

| HTTP | 错误码 | 说明 |
|------|------|------|
| 400 | INVALID_PARAMS | 参数不合法 |
| 401 | UNAUTHORIZED | 未登录或 token 无效 |
| 403 | FORBIDDEN | 无权限 |
| 404 | NOT_FOUND | 资源不存在 |
| 409 | CONFLICT | 资源冲突 |
| 422 | VALIDATION_ERROR | Elysia schema 校验失败 |
| 500 | INTERNAL_ERROR | 未预期异常 |

### 错误处理流程

service 层通过 `throw new HttpError(message, status)` 抛错 → `controller.plug.ts` 的 `onError` 统一拦截 → 返回标准信封。

---

## 开发日志

`DEV_LOG` 环境变量控制彩色开发日志（默认开启）：

```
  GET    200  /auth/me       12ms
  POST   401  /auth/login    45ms
  GET    404  /api/unknown    3ms
  GET    500  /api/error    108ms
```

颜色：方法=青色，2xx=绿色，3xx=黄色，4xx+=红色，耗时 <100ms=绿色 / <500ms=黄色 / >=500ms=红色。
设为 `DEV_LOG=false` 关闭。

---

## 业务域规划

完整的业务域规划、路由前缀、状态表见 [`docs/project-structure.md`](docs/project-structure.md)。

### 扩展新业务域

1. 创建 `app/service/<domain>/<domain>.service.ts`
2. 创建 `app/controller/v1/<domain>/<domain>.ctrl.ts`（路由路径不带前缀，目录名自动成为 URL 前缀）
3. 运行 `bun run generate_script` 重新生成路由
4. 更新 `docs/project-structure.md` 同步目录树
5. 运行 `bunx --bun tsc --noEmit` 类型检查

---

## 编码约定

- TypeScript 严格模式，所有导出必须有 JSDoc 注释。
- 不可变值用 `const`，变量用 `let`，禁用 `var`。
- 函数不使用 `const` 声明（`function` 关键字或 `export async function`）。
- 逻辑嵌套 ≤ 3 层。
- 禁止硬编码：所有配置、错误提示、业务枚举集中在 `config/` / `common/` / 环境变量中。
- Controller 只做参数校验和响应组装，业务逻辑全部在 service 层。
- 创建/删除/移动文件后必须执行 `bun run generate_script`。
- 创建/删除/移动文件后必须更新 `docs/project-structure.md`。
- 不写无意义的注释（如 `// 设置状态码`），注释应解释"为什么"，而非"是什么"。

---

## 常用命令

| 命令 | 作用 |
|------|------|
| `bun run dev` | 启动开发服务器 (watch 模式 + 路由热更新) |
| `bun run generate_script` | 手动重新生成路由 |
| `bun run fix` | Biome 格式化 |
| `bunx --bun tsc --noEmit` | TypeScript 类型检查 |
| `bun run prisma_generate` | 生成 Prisma 客户端 |
| `bunx --bun prisma validate` | Prisma schema 校验 |
| `bun run prisma_studio` | Prisma Studio 数据查看 |

---

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| PORT | 4000 | 服务端口 |
| DATABASE_TYPE | — | 数据库类型 |
| DATABASE_HOST | — | 数据库主机 |
| DATABASE_PORT | — | 数据库端口 |
| DATABASE_NAME | — | 数据库名 |
| DATABASE_USER | — | 数据库用户 |
| DATABASE_PASSWORD | — | 数据库密码 |
| JWT_SECRET | — | JWT 签名密钥 (≥32 字符) |
| CHAPTER_ENCRYPTION_KEY | — | 章节正文加密密钥 (32 字节 hex/base64) |
| ACCESS_TOKEN_EXPIRES_IN | 900 | Access Token 有效期 (秒) |
| REFRESH_TOKEN_EXPIRES_IN | 604800 | Refresh Token 有效期 (秒) |
| BOOTSTRAP_ADMIN_* | — | 首次启动管理员凭据 |
| REDIS_URL | "" | Redis 连接串 (空则不启用) |
| CLUSTER_ENABLED | false | 是否启用集群模式 |
| DEV_LOG | true | 是否输出彩色开发日志 |

---

## AI 网文业务约定

- 生成内容相关模块需区分：题材 (genre)、设定 (setting)、人物 (character)、章节 (chapter)、提示词模板 (prompt template)。
- 用户输入、模型返回和持久化内容均按不可信数据处理。
- 模型调用、鉴权、额度控制、内容审核与持久化均由后端承接。