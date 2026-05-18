# AI 生成系统设计方案

> 最后更新：2026-05-13
> 适用版本：v1
> 业务域：`aiGeneration`
> 路由前缀：`/v1/ai/conversations`、`/v1/ai/generation`、`/v1/ai/images`
> 状态：已落地，已通过类型检查；待迁移、格式化与端到端验证

---

## 1. 需求摘要

- **业务目标**：为前端创作场景提供统一的 AI 生成能力入口，支持 **标准一次性生成** 与 **Agent 多轮工具循环** 两种模式，对话全流程结构化落库，保留"重试任意历史消息"的能力。
- **使用者**：登录用户（`AUTHOR` / `ADMIN`），通过 `Authorization: Bearer` 鉴权访问；未登录返回 `401 / UNAUTHORIZED`。
- **核心模式**：
  - `STANDARD`：单轮输入 → 单轮输出，不调用工具；上下文可选择性附带历史。
  - `AGENT`：模型 + 工具循环，模型返回 `tool_calls` → 后端执行内部工具 → 将 `tool_result` 回填下一轮，直到模型给出纯文本 `final`。MVP 只开放 **内部只读工具**（小说、章节、提示词模板等本系统已有资源），**不联网、不执行代码、不开放 MCP**。
- **关键约束**：
  - 鉴权：全部端点 `requireAuth`；归属校验按 `AiConversation.userId === currentUser.id` 在 service 层兜底。
  - 模型调用：统一通过 `docs/ai-model.md` 的槽位（`modelId: number`）发起；生成模块不感知 `ProviderAccount`、`baseUrl`、`apiKey` 等，调用 `aiModel` 域公开 service。
  - 响应形式：生成入口采用 **SSE 流式**；会话/消息管理采用普通 JSON（沿用 `$g.success()` 信封）。
  - 重试粒度：可对任意一条 `assistant` 消息重试；触发重试时将 **目标消息之后的同分支全部消息标记为 `SUPERSEDED`**，以被替代的消息 `parentMessageId` 作为锚点续接。
  - 输入契约：文本生成入口要求前端传 `mode`、`modelId` 与业务输入；`conversationId` 可选，未传时由后端创建会话。`promptTemplateId` 与 `promptInputs` 是主入口（如模板 `写{{类型}}的物品{{数量}}`，参数 `{ "类型": "玄幻", "数量": 3 }`）；后端负责读取模板、替换占位符，并只把用户明确选择的 `contextItemIds` 解析为模型上下文。`metadata.novelId` / `metadata.chapterId` 只表示业务关联，不自动注入作品简介或章节正文。`userMessage`/图片 `prompt` 仅作为兼容补充输入。
  - 运行控制：文本生成不接收前端传入的 `temperature` / `tools` / `maxIterations` / `clientRequestId`；温度来自模型槽位/模型定义，Agent 工具集合与最大循环轮数由后端固定控制。
  - 非功能：后端渲染后的最终提示词限制 1~16000 字符；提示词正文属于敏感信息，除作者本人进入提示词编辑/历史版本查看外，不返回给前端；生成交互、消息列表、任务响应和 AGENT 工具结果只返回参数、元数据、哈希或脱敏标记；AGENT 工具结果序列化后按 8 KiB 截断；历史上下文按字符预算硬截断，摘要压缩预留。
  - 审计：会话创建/删除、消息重试、模型调用失败计入 `ai` 类别（新增）；明细字段脱敏（不落明文 prompt 全文，仅长度与哈希）。

---

## 2. 数据模型

所有时间字段统一 `DateTime`，主键 `Int` 自增；命名与既有 Prisma 风格对齐。

### 2.1 实体 `AiConversation`

| 字段 | 类型 | 可空 | 默认 | 唯一/索引 | 说明 |
| --- | --- | --- | --- | --- | --- |
| id | Int (自增) | 否 | — | PK | 主键 |
| userId | Int | 否 | — | INDEX, FK→User(onDelete: Cascade) | 归属用户 |
| title | VarChar(128) | 否 | "" | — | 会话标题（空串由首条用户消息前 32 字派生） |
| mode | Enum `AiGenerationMode` | 否 | `STANDARD` | — | 主模式偏好；每次生成可覆盖 |
| modelId | Int | 否 | — | — | 默认使用的槽位 ID（即 `docs/ai-model.md` 的 `ModelSlot.id`）；调用时可覆盖 |
| systemPrompt | Text | 是 | null | — | 固化到会话级的系统提示词；为空则由 `promptBuilder` 按模式拼装 |
| metadata | JSON | 是 | null | — | 业务关联引用的弱外键集合：`{ novelId?: number, chapterId?: number, promptTemplateId?: number, scene?: string }`；字段全部可选，服务端不做级联 |
| status | Enum `AiConversationStatus` | 否 | `ACTIVE` | INDEX | `ACTIVE` / `ARCHIVED` / `DELETED`（软删除） |
| messageCount | Int | 否 | 0 | — | 活跃消息数（`SUPERSEDED` 不计入），仅用于列表展示，非权威 |
| lastMessageAt | DateTime | 是 | null | INDEX | 最近一次 `ACTIVE` 消息时间，用于排序 |
| createdAt | DateTime | 否 | now() | — | 创建时间 |
| updatedAt | DateTime | 否 | @updatedAt | — | 更新时间 |

**索引**：
- `@@index([userId, status, lastMessageAt])`：列表默认排序
- `@@index([userId, createdAt])`

**关系**：
- `User` 1 ─ * `AiConversation`，`onDelete: Cascade`
- `AiConversation` 1 ─ * `AiMessage`，`onDelete: Cascade`
- `AiConversation` 1 ─ * `AiGenerationJob`，`onDelete: Cascade`

### 2.2 实体 `AiMessage`

| 字段 | 类型 | 可空 | 默认 | 唯一/索引 | 说明 |
| --- | --- | --- | --- | --- | --- |
| id | Int (自增) | 否 | — | PK | 主键 |
| conversationId | Int | 否 | — | INDEX, FK→AiConversation(onDelete: Cascade) | 归属会话 |
| parentMessageId | Int | 是 | null | INDEX, FK→AiMessage(onDelete: SetNull) | 父消息；根消息为 null。用于表达"线性链 + 重试分支" |
| role | Enum `AiMessageRole` | 否 | — | — | `SYSTEM` / `USER` / `ASSISTANT` / `TOOL` |
| status | Enum `AiMessageStatus` | 否 | `ACTIVE` | INDEX | `PENDING`（生成中）/ `ACTIVE`（最终态）/ `SUPERSEDED`（被重试覆盖）/ `FAILED` |
| content | Text (MEDIUMTEXT) | 否 | "" | — | 可读文本：USER 为后端渲染后的最终提示词 / assistant 最终文本 / tool 结构化文本摘要；对外消息列表会脱敏 USER / TOOL 正文，仅后端内部模型上下文读取完整内容 |
| contentHash | Char(64) | 否 | — | — | `content` 的 SHA-256，用于日志脱敏与追踪 |
| toolCalls | JSON | 是 | null | — | assistant 产出的 `tool_calls` 列表（`[{ id, name, arguments }]`） |
| toolCallId | VarChar(64) | 是 | null | INDEX | 仅 `TOOL` 角色：回填的 tool_call id |
| toolName | VarChar(64) | 是 | null | — | 仅 `TOOL` 角色 |
| tokenUsage | JSON | 是 | null | — | `{ prompt, completion, total }`；仅 assistant 有值 |
| modelId | Int | 是 | null | — | 本次生成使用的槽位 ID（便于审计/对账） |
| jobId | Int | 是 | null | INDEX, FK→AiGenerationJob(onDelete: SetNull) | 关联生成任务 |
| seq | Int | 否 | — | INDEX | 在所在分支上的顺序号（同 parentMessageId 的子消息按 seq 升序） |
| createdAt | DateTime | 否 | now() | — | 创建时间 |
| updatedAt | DateTime | 否 | @updatedAt | — | 更新时间 |

**索引**：
- `@@index([conversationId, status, seq])`：默认拉取"当前分支 ACTIVE 消息"
- `@@index([parentMessageId, status])`：分支定位
- `@@index([conversationId, createdAt])`

**关系**：
- `AiConversation` 1 ─ * `AiMessage`，`onDelete: Cascade`
- `AiMessage`（父） 1 ─ * `AiMessage`（子），`onDelete: SetNull`

**设计说明**：
- 采用"父指针 + 状态字段"而非物理分支表。重试某条 assistant 消息 `M` 时：
  1. 将 `M` 及其所有后代（`parentMessageId` 反向遍历）状态改为 `SUPERSEDED`；
  2. 新 assistant 消息继承 `M.parentMessageId`，即与 `M` 成为兄弟；
  3. 列表接口默认 `status=ACTIVE` 过滤，前端看到的是"最新分支"。
- 该结构天然兼容未来"显式分支列表"（按 `parentMessageId` 分组），但 MVP 不暴露切换分支接口。

### 2.3 实体 `AiGenerationJob`

承载一次"提交 → 生成 → 完成"的执行单元，SSE 流与该记录一一对应。

| 字段 | 类型 | 可空 | 默认 | 唯一/索引 | 说明 |
| --- | --- | --- | --- | --- | --- |
| id | Int (自增) | 否 | — | PK | 主键 |
| conversationId | Int | 否 | — | INDEX, FK→AiConversation(onDelete: Cascade) | 归属会话 |
| userId | Int | 否 | — | INDEX, FK→User(onDelete: Cascade) | 冗余字段，便于按用户聚合统计 |
| mode | Enum `AiGenerationMode` | 否 | — | — | `STANDARD` / `AGENT` |
| modelId | Int | 否 | — | — | 本次使用的槽位 ID |
| status | Enum `AiGenerationJobStatus` | 否 | `PENDING` | INDEX | `PENDING` / `RUNNING` / `SUCCEEDED` / `FAILED` / `CANCELED` |
| anchorMessageId | Int | 是 | null | INDEX, FK→AiMessage(onDelete: SetNull) | 生成锚点：新消息的 `parentMessageId`。首次生成为最近一条 `USER` 消息；重试为被重试消息的 `parentMessageId` |
| retryTargetId | Int | 是 | null | INDEX, FK→AiMessage(onDelete: SetNull) | 若为重试任务，指向被替代的 assistant 消息 |
| clientRequestId | VarChar(64) | 是 | null | — | 预留幂等字段；当前文本生成入口不接收前端传入，通常为 null |
| iterationCount | Int | 否 | 0 | — | Agent 循环轮数（非 Agent 恒为 0 或 1） |
| maxIterations | Int | 否 | 8 | — | 后端固定的 Agent 最大循环数（超限即 `FAILED`，原因 `AGENT_ITERATION_EXCEEDED`） |
| errorCode | VarChar(64) | 是 | null | — | 失败时填写（见 §5.3） |
| errorMessage | VarChar(500) | 是 | null | — | 可向前端透出的错误摘要 |
| tokenUsage | JSON | 是 | null | — | 聚合统计 `{ prompt, completion, total }` |
| startedAt | DateTime | 是 | null | — | 首次进入 `RUNNING` |
| finishedAt | DateTime | 是 | null | — | 进入终态时间 |
| createdAt | DateTime | 否 | now() | — | 创建时间 |
| updatedAt | DateTime | 否 | @updatedAt | — | 更新时间 |

**索引**：
- `@@index([conversationId, createdAt])`
- `@@index([userId, status, createdAt])`
- `@@index([conversationId, clientRequestId])`（预留查询索引；当前文本生成入口不开放前端幂等键）

### 2.4 枚举

```prisma
enum AiGenerationMode {
  STANDARD
  AGENT
}

enum AiConversationStatus {
  ACTIVE
  ARCHIVED
  DELETED
}

enum AiMessageRole {
  SYSTEM
  USER
  ASSISTANT
  TOOL
}

enum AiMessageStatus {
  PENDING
  ACTIVE
  SUPERSEDED
  FAILED
}

enum AiGenerationJobStatus {
  PENDING
  RUNNING
  SUCCEEDED
  FAILED
  CANCELED
}
```

### 2.5 Prisma 片段

```prisma
model AiConversation {
  id             Int                    @id @default(autoincrement())
  userId         Int
  title          String                 @default("") @db.VarChar(128)
  mode           AiGenerationMode       @default(STANDARD)
  modelId        Int
  systemPrompt   String?                @db.Text
  metadata       Json?
  status         AiConversationStatus   @default(ACTIVE)
  messageCount   Int                    @default(0)
  lastMessageAt  DateTime?
  createdAt      DateTime               @default(now())
  updatedAt      DateTime               @updatedAt

  user     User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages AiMessage[]
  jobs     AiGenerationJob[]

  @@index([userId, status, lastMessageAt])
  @@index([userId, createdAt])
}

model AiMessage {
  id               Int              @id @default(autoincrement())
  conversationId   Int
  parentMessageId  Int?
  role             AiMessageRole
  status           AiMessageStatus  @default(ACTIVE)
  content          String           @db.MediumText
  contentHash      String           @db.Char(64)
  toolCalls        Json?
  toolCallId       String?          @db.VarChar(64)
  toolName         String?          @db.VarChar(64)
  tokenUsage       Json?
  modelId          Int?
  jobId            Int?
  seq              Int
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt

  conversation AiConversation    @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  parent       AiMessage?        @relation("AiMessageChildren", fields: [parentMessageId], references: [id], onDelete: SetNull)
  children     AiMessage[]       @relation("AiMessageChildren")
  job          AiGenerationJob?  @relation(fields: [jobId], references: [id], onDelete: SetNull)

  @@index([conversationId, status, seq])
  @@index([parentMessageId, status])
  @@index([conversationId, createdAt])
  @@index([toolCallId])
  @@index([jobId])
}

model AiGenerationJob {
  id                Int                    @id @default(autoincrement())
  conversationId    Int
  userId            Int
  mode              AiGenerationMode
  modelId           Int
  status            AiGenerationJobStatus  @default(PENDING)
  anchorMessageId   Int?
  retryTargetId     Int?
  clientRequestId   String?                @db.VarChar(64)
  iterationCount    Int                    @default(0)
  maxIterations     Int                    @default(8)
  errorCode         String?                @db.VarChar(64)
  errorMessage      String?                @db.VarChar(500)
  tokenUsage        Json?
  startedAt         DateTime?
  finishedAt        DateTime?
  createdAt         DateTime               @default(now())
  updatedAt         DateTime               @updatedAt

  conversation AiConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  user         User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages     AiMessage[]

  @@index([conversationId, createdAt])
  @@index([userId, status, createdAt])
  @@index([conversationId, clientRequestId])
}
```

### 2.6 迁移策略

- **类型**：纯新增（4 个枚举 + 3 张表），无破坏性。
- **回填**：不需要。
- **执行**：`bunx --bun prisma migrate dev --name add_ai_generation`。
- **注意**：`AiConversation.modelId` 不加外键（槽位 ID 属于逻辑契约，不让 Prisma 约束跨域实体），但 service 层在写入前必须调用 `aiModel.getSlotById()` 校验存在且 `enabled=true`。

### 2.7 上下文素材目标模型（待落地）

生成链路后续不再把 `metadata.novelId` / `metadata.chapterId` 当作自动上下文开关，而是只注入用户明确选择的 `contextItemIds`。上下文素材采用“来源配置化”模型，避免在生成请求或 Prisma enum 中硬编码“人物卡/词条卡/备忘录”等类型。

#### `ContextSource`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | Int | 自增主键 |
| name | String | 展示名称，例如“人物卡”“词条卡”“备忘录”；由数据库配置，不进入生成请求 |
| key | String | 稳定配置键，仅后端管理使用 |
| description | String? | 来源说明 |
| fieldSchema | Json? | 该来源的结构化字段配置，用于管理端/作者端表单和 service 校验 |
| renderTemplate | Text? | 将 `ContextItem.data` 渲染为模型上下文的模板 |
| enabled | Boolean | 是否启用 |
| sortOrder | Int | 展示排序 |

#### `ContextItem`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | Int | 统一上下文素材 ID，即生成请求里的 `contextItemIds[]` |
| userId | Int | 所属作者 |
| sourceId | Int | 关联 `ContextSource`，用于展示和渲染，不作为请求参数 |
| title | String | 标题 |
| summary | String? | 摘要，供前端列表展示 |
| data | Json? | 结构化内容 |
| renderedText | Text | 后端渲染后的模型上下文文本；生成链路只读取该字段 |
| isGlobal | Boolean | 是否作者级全局可用 |
| isDeleted | Boolean | 软删除 |

#### `NovelContextBinding`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | Int | 自增主键 |
| userId | Int | 所属作者，冗余便于校验和查询 |
| novelId | Int | 作品 ID |
| contextItemId | Int | 上下文素材 ID |
| sortOrder | Int | 在该作品下的默认展示排序 |
| enabled | Boolean | 绑定是否有效 |

设计语义：

- 人物卡、词条卡、备忘录是 `ContextSource` 配置，不是硬编码 enum。
- `ContextItem` 是作者级素材，不强制属于某个作品。
- `NovelContextBinding` 只表示“这个作品可以使用这个素材”。
- 生成请求只传 `contextItemIds`；后端按 `userId`、`isGlobal`、作品绑定关系校验后读取 `renderedText`。

---

## 3. 接口契约

路由分两类：

- `/v1/ai/conversations/**`：会话与消息管理（普通 JSON）。
- `/v1/ai/generation/**`：生成入口与取消（SSE + JSON）。

所有端点 `requireAuth`；service 内统一校验 `conversationId` 归属当前用户。

### 3.1 接口总表

| # | 方法 | 路径 | 鉴权 | 审计 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 1 | POST | `/v1/ai/conversations` | requireAuth | ai.conversation.create | 创建会话 |
| 2 | GET | `/v1/ai/conversations` | requireAuth | — | 会话分页列表 |
| 3 | GET | `/v1/ai/conversations/:id` | requireAuth | — | 会话详情（不含消息） |
| 4 | PATCH | `/v1/ai/conversations/:id` | requireAuth | ai.conversation.update | 修改标题/默认 mode/默认 modelId/metadata |
| 5 | DELETE | `/v1/ai/conversations/:id` | requireAuth | ai.conversation.delete | 软删除（`status=DELETED`） |
| 6 | POST | `/v1/ai/conversations/:id/archive` | requireAuth | ai.conversation.archive | 归档 |
| 7 | GET | `/v1/ai/conversations/:id/messages` | requireAuth | — | 消息列表（默认仅 `ACTIVE`，支持 `includeSuperseded=true`） |
| 8 | DELETE | `/v1/ai/conversations/:id/messages/:messageId` | requireAuth | ai.message.delete | 仅允许删除 `USER`，级联 `SUPERSEDED` 其下游 |
| 9 | POST | `/v1/ai/generation/stream` | requireAuth | ai.generation.start | **SSE** 触发一次生成（新消息） |
| 10 | POST | `/v1/ai/generation/:jobId/retry` | requireAuth | ai.generation.retry | **SSE** 对指定 assistant 消息重试 |
| 11 | POST | `/v1/ai/generation/:jobId/cancel` | requireAuth | ai.generation.cancel | 取消运行中任务 |
| 12 | GET | `/v1/ai/generation/:jobId` | requireAuth | — | 查询任务状态（轮询兜底） |

### 3.2 会话管理

#### 3.2.1 `POST /v1/ai/conversations`

- **body**：
  - `title`: string，可选，≤128
  - `mode`: `STANDARD` \| `AGENT`，默认 `STANDARD`
  - `modelId`: number，必填，对应 `ModelSlot.id`
  - `systemPrompt`: string，可选，≤8000
  - `metadata`: object，可选（仅允许白名单键 `novelId` / `chapterId` / `promptTemplateId` / `scene`）
- **响应 data**：`AiConversationItem`
- **错误**：
  - 404 `NOT_FOUND`：`modelId` 对应槽位不存在或 `enabled=false`
  - 422 `VALIDATION_ERROR`：schema 校验失败

#### 3.2.2 `GET /v1/ai/conversations`

- **query**：
  - `page` / `pageSize`：分页
  - `status`: `ACTIVE` \| `ARCHIVED`（默认仅 `ACTIVE`，`DELETED` 永不返回）
  - `novelId` / `chapterId`：可选，按 metadata 字段精确匹配（service 侧用 JSON where 实现）
  - `keyword`: string，可选，模糊匹配 `title`
- **响应 data**：`Paged<AiConversationItem>`

#### 3.2.3 `GET /v1/ai/conversations/:id`

- **响应 data**：`AiConversationItem`（含 `modelSlot` 的展示字段快照：`name` / `status`）
- **错误**：404 `NOT_FOUND`（不存在或非归属当前用户）

#### 3.2.4 `PATCH /v1/ai/conversations/:id`

- **body**（均可选，至少一项）：`title` / `mode` / `modelId` / `systemPrompt` / `metadata`
- **响应 data**：更新后的 `AiConversationItem`
- **错误**：404 / 422；若 `modelId` 不合法 → 404 `NOT_FOUND`

#### 3.2.5 `DELETE /v1/ai/conversations/:id`

- **语义**：软删除，`status=DELETED`；后续所有查询均过滤。
- **响应 data**：`boolean`

#### 3.2.6 `POST /v1/ai/conversations/:id/archive`

- **body**：`{ archived: boolean }`（true → `ARCHIVED`，false → `ACTIVE`）
- **响应 data**：更新后的 `AiConversationItem`

#### 3.2.7 `GET /v1/ai/conversations/:id/messages`

- **query**：
  - `cursor`: string，可选（消息 `id`，游标分页）
  - `limit`: number，默认 50，最大 200
  - `includeSuperseded`: boolean，默认 false
- **响应 data**：`CursorPaged<AiMessageItem>`；`USER` / `TOOL` 消息的 `content` 对前端置空并带 `contentRedacted: true`，`ASSISTANT` 消息正文正常返回。
- **顺序**：按 `seq` 升序；`cursor` 之后的消息。

#### 3.2.8 `DELETE /v1/ai/conversations/:id/messages/:messageId`

- **约束**：
  - 仅允许 `role=USER` 的 `ACTIVE` 消息被删除；其他返回 409 `CONFLICT`。
  - 级联：将目标消息及其后代 `status=SUPERSEDED`（不物理删除，保留审计链）。
- **响应 data**：`boolean`

### 3.3 生成入口（SSE）

#### 3.3.1 `POST /v1/ai/generation/stream`

触发一次新的生成（对应"追加一条新的 assistant 消息"）。

- **body**：
  - `mode`: `STANDARD` | `AGENT`，必填
  - `modelId`: number，必填，对应前端选择的模型槽位 ID
  - `conversationId`: number，可选；未传时后端按本次 `mode` / `modelId` / `metadata` 创建新会话，并在 `job.created` 中返回
  - `promptTemplateId`: number，可选；未传 `userMessage` 时必填，可从会话 `metadata.promptTemplateId` 兜底
  - `promptInputs`: `Record<string, unknown>`，可选；仅传用户填写的模板变量，由后端替换 `{{变量}}`
  - `userMessage`: string，可选，1~16000；兼容补充输入，会追加到模板渲染结果之后
  - `contextItemIds`: number[]，可选；用户明确选择要注入模型的上下文素材 ID。生成请求不传 `type`，后端按 `ContextItem.sourceId` / `ContextSource` 配置解析与渲染
  - `metadata`: object，可选（仅允许 `novelId` / `chapterId` / `promptTemplateId` / `scene`；只表示业务引用，不自动进入模型上下文）
- **后端控制**：`temperature` 来自模型槽位/模型定义配置；AGENT 工具集合来自后端内部只读工具注册表；最大迭代轮数由后端固定配置；文本生成入口不接收前端幂等键。
- **同步返回**（HTTP 200，`Content-Type: text/event-stream`）：按 §5 协议推送事件流。
- **错误前置**（在 SSE 建立前以普通 JSON 返回）：
  - 404 `NOT_FOUND`：会话不存在、非归属当前用户、`modelId` 不合法
  - 422 `VALIDATION_ERROR`
  - 503 `MODEL_UNAVAILABLE`：槽位故障（与 `docs/ai-model.md` §5.3 对齐）

#### 3.3.2 `POST /v1/ai/generation/:jobId/retry`

对指定 assistant 消息重试。

> 设计决策：`:jobId` 其实是 **"锚点 job"**，但语义上用户表达的是"重试这条消息"。为避免概念混乱，实际 body 里携带 `targetMessageId`；URL 的 `:jobId` 用于请求追踪（便于日志/审计定位）。若前端只有 `targetMessageId`，可以先 `GET /v1/ai/generation?messageId=...` 反查，但 MVP 不提供该查询，直接要求前端传 `targetMessageId` 即可，`:jobId` 取被替代消息关联的 `jobId`（由前端从消息上获取）。

- **body**：
  - `targetMessageId`: number，必填；必须是 `role=ASSISTANT` 且 `status=ACTIVE` 的消息
- **服务端行为**：
  1. 校验 target 消息归属当前用户且 `status=ACTIVE`；
  2. 在事务内将 target 及其后代 `status=SUPERSEDED`；
  3. 以 `target.parentMessageId` 作为 `anchorMessageId` 创建新 job；
  4. 返回 SSE 流。
- **错误**：404、409（target 已被 supersede）、422

#### 3.3.3 `POST /v1/ai/generation/:jobId/cancel`

- **约束**：仅允许 `status IN (PENDING, RUNNING)` 的任务；其他返回 409。
- **响应 data**：`{ jobId, status: "CANCELED" }`
- **效果**：
  - 任务注册在进程内 `AbortController` 集合中，`cancel` 会立即触发对应 job 的 `AbortSignal`；
  - 正在执行的循环会在模型调用、工具调用和落库前后的可取消边界退出；
  - 仍处于 `PENDING` 的 assistant 消息会被标记为 `FAILED`，正文为 `已取消`。
  - 若 SSE 请求方主动断开，`request.signal` 会贯通到模型 adapter 的 `fetch`，任务按 `CLIENT_DISCONNECTED` 失败。

#### 3.3.4 `GET /v1/ai/generation/:jobId`

- **响应 data**：`AiGenerationJobItem`（不含消息正文，仅状态/错误码/用量）
- **错误**：404

---

## 4. 分层与模块拆分

### 4.1 目录布局

```
app/
├── controller/v1/ai/
│   ├── models.ctrl.ts                # 前端模型槽位列表/详情
│   ├── conversation.ctrl.ts          # §3.2 全部端点
│   ├── generation.ctrl.ts            # §3.3 全部端点（含 SSE）
│   └── images.ctrl.ts                # 图片生成端点
├── controller/v1/admin/ai/
│   └── ai.ctrl.ts                    # 管理端 AI 槽位/模型/账号/绑定/健康管理
├── service/aiGeneration/
│   ├── abort.ts                      # 文本生成任务 AbortSignal 注册与取消
│   ├── conversation.service.ts       # 会话 CRUD + 归属校验
│   ├── message.service.ts            # 消息读写 + 重试链路管理
│   ├── job.service.ts                # 生成任务状态机 + 会话创建 + 取消
│   ├── orchestrator.service.ts       # 核心编排：STANDARD / AGENT 两套流程
│   ├── contextResolver.service.ts    # prompt 模板渲染 + 用户选择上下文解析
│   ├── promptBuilder.service.ts      # 静态/动态系统提示词 + 上下文装配
│   ├── historyWindow.service.ts      # 对话历史窗口截断
│   ├── image.service.ts              # 图片生成独立任务链路
│   ├── tools/
│   │   ├── registry.ts               # AGENT 只读内部工具注册中心
│   │   └── types.ts                  # ToolContext / ToolDefinition
│   └── stream/
│       ├── sseEmitter.ts             # SSE Response 封装
│       └── events.ts                 # §5 事件类型定义
├── common/
│   └── permission.ts                 # AI 权限值（见 §4.5）
├── lib/
│   └── audit.ts                      # 扩展 AuditCategory（见 §4.6）
└── plugins/
    └── controller.plug.ts            # 日志脱敏扩展
```

### 4.2 Controller 层

#### `conversation.ctrl.ts`

职责：schema 校验 → 调用 service → `$g.success()`。不含业务分支。

| 端点 | 依赖 service 函数 |
| --- | --- |
| POST `/` | `Conversation.create(userId, input)` |
| GET `/` | `Conversation.list(userId, query)` |
| GET `/:id` | `Conversation.detail(userId, id)` |
| PATCH `/:id` | `Conversation.update(userId, id, input)` |
| DELETE `/:id` | `Conversation.softDelete(userId, id)` |
| POST `/:id/archive` | `Conversation.setArchived(userId, id, archived)` |
| GET `/:id/messages` | `Message.list(userId, conversationId, query)` |
| DELETE `/:id/messages/:messageId` | `Message.deleteUserMessage(userId, conversationId, messageId)` |

#### `generation.ctrl.ts`

职责：schema 校验 → 调用 `Job.createAndStart()` / `Job.retry()` / `Job.cancel()` → 从返回的 `AsyncIterable<SseEvent>` 透传到 SSE 响应。

SSE 的"如何接入 Elysia 响应对象"由 `stream/sseEmitter.ts` 统一封装，controller 不自行拼写 `data: ...\n\n`。

### 4.3 Service 层

每个 service 函数：
- 显式入参类型（禁止 `any`）；
- 显式 `Promise<T>` 返回类型；
- JSDoc；
- 用 `throw new HttpError()` 抛错；
- 不直接操作 HTTP 对象。

#### `conversation.service.ts`（公开函数）

```ts
/** 创建会话并校验 modelId 归属槽位可用。*/
create(userId: number, input: CreateConversationInput): Promise<AiConversationItem>;

/** 分页列表，默认仅 ACTIVE。*/
list(userId: number, query: ListConversationQuery): Promise<Paged<AiConversationItem>>;

/** 详情，含槽位展示字段快照。*/
detail(userId: number, id: number): Promise<AiConversationItem>;

/** 部分更新。*/
update(userId: number, id: number, input: UpdateConversationInput): Promise<AiConversationItem>;

/** 软删除，归属校验失败抛 404。*/
softDelete(userId: number, id: number): Promise<boolean>;

/** 归档/恢复。*/
setArchived(userId: number, id: number, archived: boolean): Promise<AiConversationItem>;

/** 内部：按 id 取归属校验后的会话实体（非 public，给同域 service 复用）。*/
// 私有：ensureOwned(userId, id)
```

#### `message.service.ts`（公开函数）

```ts
/** 游标分页拉取消息。*/
list(
  userId: number,
  conversationId: number,
  query: ListMessageQuery,
): Promise<CursorPaged<AiMessageItem>>;

/** 追加一条 USER 消息（由 orchestrator 调用，非 controller 直接调用）。
 *  返回新消息及其 seq。*/
appendUserMessage(
  conversationId: number,
  parentMessageId: number | null,
  content: string,
): Promise<AiMessageItem>;

/** 追加一条 PENDING 的 ASSISTANT 消息，首次进入 orchestrator 使用。*/
appendPendingAssistant(
  conversationId: number,
  parentMessageId: number | null,
  jobId: number,
  modelId: number,
): Promise<AiMessageItem>;

/** 将 PENDING/FAILED 消息落到终态（ACTIVE / FAILED）。*/
finalizeMessage(
  messageId: number,
  patch: FinalizeMessagePatch,
): Promise<AiMessageItem>;

/** 追加 TOOL 角色消息（Agent 循环中间态，最终态直接写 ACTIVE）。*/
appendToolMessage(
  conversationId: number,
  parentMessageId: number,
  jobId: number,
  toolCallId: string,
  toolName: string,
  content: string,
): Promise<AiMessageItem>;

/** 将目标 assistant 消息及其后代 SUPERSEDED。返回被替代消息的 parentMessageId。*/
supersedeSubtree(
  userId: number,
  conversationId: number,
  targetMessageId: number,
): Promise<{ parentMessageId: number | null; supersededCount: number }>;

/** 用户删除自己的 USER 消息；级联 supersede 下游。*/
deleteUserMessage(
  userId: number,
  conversationId: number,
  messageId: number,
): Promise<boolean>;

/** 给 orchestrator 取"当前分支 ACTIVE 消息链"。按 seq 升序。*/
listActiveChain(conversationId: number): Promise<AiMessageItem[]>;
```

#### `job.service.ts`（公开函数）

```ts
/** 新消息场景：按需创建/校验会话，写入 USER + PENDING ASSISTANT 消息，返回 SSE 事件流。*/
createAndStart(
  userId: number,
  input: CreateGenerationInput,
  signal?: AbortSignal,
): Promise<{ job: AiGenerationJobItem; stream: AsyncIterable<SseEvent> }>;

/** 重试场景：先 supersede，再创建 job + PENDING 消息，返回 SSE 流。*/
retry(
  userId: number,
  input: RetryGenerationInput,
  signal?: AbortSignal,
): Promise<{ job: AiGenerationJobItem; stream: AsyncIterable<SseEvent> }>;

/** 取消任务，仅 PENDING/RUNNING 允许。*/
cancel(userId: number, jobId: number): Promise<AiGenerationJobItem>;

/** 查询任务状态。*/
detail(userId: number, jobId: number): Promise<AiGenerationJobItem>;

```

#### `orchestrator.service.ts`（公开函数）

```ts
/** 核心入口：根据 mode 走 STANDARD / AGENT；返回事件流。
 *  orchestrator 负责编排模型调用、消息落库与 job 状态更新。*/
execute(context: OrchestratorContext): AsyncIterable<SseEvent>;
```

`OrchestratorContext` 封装：`userId` / `jobId` / `conversationId` / `pendingAssistantMessageId` / `modelId` / `systemPrompt` / `input` / `signal` 等运行上下文。

两种模式分别由 `executeStandard()` / `executeAgent()` 内部函数实现；外部只通过 `execute()` 调用。

#### `promptBuilder.service.ts`

```ts
/** 组装本次调用的 messages 数组（含静态系统提示词、会话系统提示词、动态上下文、历史与当前用户提示）。*/
buildMessages(input: BuildMessagesInput): ChatMessage[];
```

静态创作助手提示词、会话级系统提示词与动态作品上下文在 `promptBuilder` 中分离组装，便于后续按 Provider 做缓存或策略扩展。

#### `historyWindow.service.ts`

```ts
/** 对历史消息做字符预算裁剪；MVP 用字符数近似 token 预算，保留最近消息。*/
truncateMessages(messages: ChatMessage[], maxChars: number): ChatMessage[];
```

#### `tools/registry.ts`

当前实现暴露三个同域函数：

```ts
listAgentToolDefinitions(allowedNames?: string[]): ChatToolDefinition[];
executeAgentTool(context: AgentToolContext, toolName: string, input: unknown): Promise<unknown>;
serializeAgentToolResult(result: unknown): string;
```

`AgentToolContext` 结构：

```ts
{
  userId: number;
  signal?: AbortSignal;
}
```

工具定义结构沿用 `aiModel/adapter/types.ts` 的 `ChatToolDefinition`：

```ts
{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
```

工具执行函数仅在 registry 内部保存，不下发给模型。

**当前已实现工具清单**（仅只读，均按 `userId` 校验归属）：
- `novel.list`：列出当前用户作品列表，支持分页、归档/回收站和关键字筛选。
- `novel.detail`：按 `bookId` 获取当前用户作品详情。
- `chapter.list`：按 `bookId` 列出作品章节。
- `chapter.detail`：按 `chapterId` 获取章节详情，并解码章节正文。
- `prompt.list`：列出当前用户可访问的提示词模板。
- `prompt.detail`：按 `id` 获取提示词模板详情。

工具结果统一经 `serializeAgentToolResult()` 序列化并截断至 8 KiB，再以 `TOOL` 角色消息回填下一轮模型调用。

### 提示词组装管线

一次生成请求从用户输入到最终 `ChatMessage[]` 的完整组装链：

#### 阶段 1：上下文解析 → `contextResolver.service.ts`

`resolveGenerationContext(userId, input)` 产出两个独立文本块：

| 产物 | 来源 | 说明 |
| --- | --- | --- |
| `renderedPrompt` | `promptTemplate.content`（经 `{{key}}` 模板变量替换） + `userMessage`，用 `\n\n` 拼接 | 最终作为 `role: "user"` 消息发送给模型 |
| `contextText` | `metadata.scene` + 用户选择的 `contextItem.renderedText` | 作为 `role: "system"` 消息发送给模型 |
| `promptHash` | `SHA-256(contextText + renderedPrompt)` | 用于日志脱敏和缓存键 |

**模板渲染**：`{{变量名}}` 占位符替换，值为 `undefined`/`null` 时输出空串，非字符串值转 JSON。

**上下文素材解析**：只注入用户通过 `contextItemIds` 明确选择的素材。校验归属、全局性、作品绑定关系后，直接读取 `ContextItem.renderedText` 拼接，不做二次渲染。

**约束**：`renderedPrompt` 长度限制 1~16000 字符；`promptTemplateIds` 和 `userMessage` 至少提供一个。

#### 阶段 2：消息组装 → `promptBuilder.service.ts`

`buildMessages()` 将阶段 1 产物与对话历史组装为 `ChatMessage[]`：

```
[0] { role: "system", content: <STATIC_SYSTEM_PROMPT> }       // 固定：AI 网文创作助手角色
[1] { role: "system", content: <conversation.systemPrompt> }   // 可选：用户自定义系统提示词
[2] { role: "system", content: <contextText> }                 // 创作场景 + 用户选择的上下文素材
[3] { role: "user"|"assistant"|"tool", ... }                   // 对话历史（从 DB 取 ACTIVE 消息链）
[N] { role: "user",   content: <renderedPrompt> }              // 渲染后的最终用户提示词
```

三层 system 消息分离的设计意图：静态角色定义（固定文案）、会话级自定义提示词、动态创作上下文各自独立，便于后续按 Provider 做 prompt cache（如 Anthropic 的 cache_control 可仅标记静态与半静态块）。

静态系统提示词内容：

```
你是 AI 网文创作助手，负责根据用户提示词、预输入和作品上下文生成可直接用于创作的内容。
输出应聚焦创作结果，不解释内部推理过程。
如果上下文不足，优先基于现有信息合理补全，不要编造平台不存在的事实。
```

**首轮生成与重试的区别**：
- 首轮：`excludeLastActiveMessage=true`，`includeUserPrompt=true`（默认），即历史消息排除最后一条活跃消息（上一轮的 USER 消息），并由本次新渲染的 `renderedPrompt` 替代。
- 重试：`supersedeSubtree()` 将被重试的 assistant 消息及其后代标记为 `SUPERSEDED`，`listActiveChain()` 自动只返回当前分支的 ACTIVE 消息，因此 `buildMessages` 拿到的历史链已经是"被重试消息之前"的内容。

#### 阶段 3：历史窗口裁剪 → `historyWindow.service.ts`

`truncateMessages(messages, 48_000)` 在发往模型适配器前执行。

策略：从最旧的消息开始裁剪，保留最新的消息，总字符数（`content.length` 累加）不超过 48,000。至少保留一条消息（即使单条超限也不丢弃）。

#### 阶段 4：适配器调用 → `model.service.ts`

`invokeChat(modelId, request)` 接收最终的 `ChatInvokeRequest`：

```ts
interface ChatInvokeRequest {
  messages: ChatMessage[];        // 经上述 3 阶段组装的完整消息数组
  tools?: ChatToolDefinition[];   // AGENT 模式有值，STANDARD 模式为 undefined
  temperature?: number;           // 默认来自模型定义的 defaultTemperature
  maxOutputTokens?: number;       // 默认来自模型定义的 maxOutputTokens
  signal?: AbortSignal;           // SSE 客户端断开传播
}
```

`invokeChat` 内部完成以下工作后交由 Provider 适配器（OpenAI / Anthropic）：

1. 根据 `tools` 是否为空，决定需要的能力：有工具时要求 `TEXT_CHAT + TOOL_CALLING`，否则仅 `TEXT_CHAT`。
2. 通过 `buildModelCallContext` 解析槽位 → 账号 → 模型定义，获取 `apiKey`、`baseUrl`、`endpoint`、`reasoningEffort` 等运行时上下文。
3. 按 Provider 分配适配器实例，传入 `ProviderRuntimeContext` + `ChatInvokeRequest` 发起流式调用。
4. 调用完成后记录延迟和成功/失败指标到模型健康窗口。

**开发日志**：`DEV_LOG !== "false"` 时，`invokeChat` 会将完整 `messages` 数组以 JSON 格式打印到控制台。

#### 端到端数据流示意

```
POST /v1/ai/generation/stream
  → JobService.createAndStart()
    → resolveGenerationContext()
        → resolvePromptTemplates()          // DB: promptTemplate → 模板渲染
        → resolveContextItems()             // DB: contextItem → renderedText
        → normalizeRenderedPrompt()         // 模板渲染结果 + userMessage
        → 返回 { renderedPrompt, contextText, promptHash }
    → MessageService.appendUserMessage()    // DB: 落库 USER 消息
    → MessageService.appendPendingAssistant()
    → Orchestrator.execute()
      → buildInitialMessages()
        → MessageService.listActiveChain()  // DB: 取当前分支 ACTIVE 消息
        → buildMessages({systemPrompt, contextText, history, renderedPrompt})
          → 返回 ChatMessage[]
      → invokeModelTurn()
        → truncateMessages(messages, 48000) // 字符预算裁剪
        → AiModelService.invokeChat(modelId, { messages, tools, temperature, signal })
          → resolveProviderAdapter(platform)
          → adapter.invokeChat(runtimeCtx, request)
            → 网络调用 OpenAI / Anthropic API
```

### 4.4 Lib / Utils / 依赖

| 文件 | 变更 |
| --- | --- |
| `app/lib/audit.ts` | 扩展 `AuditCategory`，增加 `"ai"` |
| `app/lib/httpError.ts` | 422 映射 `VALIDATION_ERROR`，503 映射 `MODEL_UNAVAILABLE` |
| `app/utils/sse.ts` | SSE 事件序列化与 `text/event-stream` Response 封装；`keepalive` 事件类型预留，当前不主动定时发送 |

### 4.5 Common

```ts
// app/common/permission.ts 追加
| "ai.model.manage"        // 管理端 AI 模型/账号配置，仅 ADMIN
| "ai.conversation.manage" // 自己的会话增删改
| "ai.generation.invoke"   // 触发文本生成
| "ai.image.generate"      // 触发图片生成
```

角色映射：

| 角色 | 权限 |
| --- | --- |
| ADMIN | ai.model.manage + ai.conversation.manage + ai.generation.invoke + ai.image.generate |
| AUTHOR | ai.conversation.manage + ai.generation.invoke + ai.image.generate |

> 由于归属校验在 service 层完成（`userId` 匹配），`ai.*` 权限只是粗粒度闸门。后台管理走 `/v1/admin/ai/**`，由 `ai.model.manage` 控制。

### 4.6 Plugins / 审计

`app/lib/audit.ts`：
```ts
export type AuditCategory =
  | "auth"
  | "novel"
  | "prompt"
  | "prompt_category"
  | "creative_tool"
  | "ai"            // ← 新增
  | "security"
  | "system";
```

`app/plugins/controller.plug.ts` 当前采用 controller 路由宏手动声明审计：

- `conversation.ctrl.ts`：`conversation.create` / `conversation.update` / `conversation.delete` / `conversation.archive` / `message.delete`
- `generation.ctrl.ts`：`generation.start` / `generation.retry` / `generation.cancel`
- `images.ctrl.ts`：`image.generate`

管理端 AI 配置接口使用 `system` 类别记录 `ai.slot.*`、`ai.model.*`、`ai.account.*`、`ai.model_account.*`、`ai.health.reset` 等动作。

脱敏：`controller.plug.ts` 的 `SENSITIVE_KEYS` 已覆盖 `apiKey` / `apiKeyEncrypted` / `userMessage` / `systemPrompt` / `prompt` 等字段。

---

## 5. SSE 协议

### 5.1 事件总览

| event | 触发时机 | data 字段 |
| --- | --- | --- |
| `job.created` | 建立连接后首帧 | `{ jobId, conversationId? }` |
| `message.delta` | 模型每次产出增量文本 | `{ jobId, messageId, delta }` |
| `tool.call` | Agent 模式：模型请求调用工具 | `{ jobId, toolCallId, name, arguments }` |
| `tool.result` | Agent 模式：工具执行完成 | `{ jobId, toolCallId, name, result }` |
| `job.iteration` | Agent 模式：一轮工具循环结束 | `{ jobId, iteration, maxIterations }` |
| `message.completed` | 最终 assistant 消息完成 | `{ jobId, messageId, content, usage?, toolCalls? }` |
| `job.succeeded` | 任务成功终态 | `{ jobId, result? }` |
| `job.failed` | 任务失败终态 | `{ jobId, errorCode, message }` |
| `job.canceled` | 任务被取消 | `{ jobId }` |
| `keepalive` | 预留保活事件 | `{ ts }` |

事件序列化：
```
event: message.delta
data: {"jobId":1,"messageId":123,"delta":"今天"}

```
（两个换行结束一帧。）

### 5.2 STANDARD 流程

```
job.created
  → message.delta *  (N 次)
  → message.completed
  → job.succeeded
```

### 5.3 AGENT 流程

```
job.created
  → [iteration 1]
    → message.delta * N           (模型先输出一段思考文本，可选)
    → tool.call * M
    → tool.result * M              (当前实现按顺序执行工具)
  → job.iteration (iteration=1)
  → [iteration 2]
    → message.delta * N
    → (可能继续 tool.call)
  ...
  → message.completed              (最终回答，无 tool_calls)
  → job.succeeded
```

若达到 `maxIterations` 仍未收敛 → `job.failed`，`errorCode=AGENT_ITERATION_EXCEEDED`。

### 5.4 错误码

| HTTP（SSE 前置 / 轮询接口） | errorCode | 说明 |
| --- | --- | --- |
| 404 | `NOT_FOUND` | 会话 / job / 消息不存在或非归属 |
| 409 | `CONFLICT` | job 已终态、重试目标已被替代 |
| 422 | `VALIDATION_ERROR` | schema 校验失败、metadata / 工具白名单 / 工具参数不合法 |
| 499 | `CLIENT_DISCONNECTED` | SSE 请求方断开，生成链路被中断 |
| 503 | `MODEL_UNAVAILABLE` | 槽位不可用（透传 aiModel 域） |
| — | `AGENT_ITERATION_EXCEEDED` | Agent 循环超限 |
| — | `TOOL_EXECUTION_FAILED` | 工具执行异常时写入 tool result，供下一轮模型读取 |

SSE 中的错误通过 `job.failed` 事件承载；HTTP 层（建立 SSE 前 / 普通接口）按上表以 `$g` 信封返回。

---

## 6. 依赖与解耦分析

### 6.1 与其它业务域的依赖

| 被依赖方 | 消费方式 | 解耦手段 |
| --- | --- | --- |
| `aiModel` 域（`docs/ai-model.md`） | 只调用其公开 service：`publicModelDetail(modelId)`、`invokeChat(...)`、`invokeImage(...)`，**不直接读其 Prisma 表** | 通过显式 service 接口；生成域不感知 Provider / 账号 |
| `novel` 域 | 通过 `novel.service` / `chapter.service` 的只读公开函数 | 仅在 tool 实现内部调用；service 层本身不 import novel 域私有函数 |
| `prompt` 域 | 通过 `prompt.service` 的只读公开函数 | 同上 |
| `user` 域 | 仅通过 `currentUser.id` 做归属校验 | 无直接依赖 |

### 6.2 跨域依赖方向

```
ai/generation/orchestrator  ──► aiModel.service (invokeChat)
ai/generation/tools/*       ──► novel.service / prompt.service / chapter.service
```

单向依赖，无循环。

### 6.3 对外公开函数清单

只有以下 service 函数被 controller 调用：

- `conversation.service`：`create / list / detail / update / softDelete / setArchived`
- `message.service`：`list / deleteUserMessage`
- `job.service`：`createAndStart / retry / cancel / detail`

其余函数（`appendXxx` / `supersedeSubtree` / `listActiveChain` / `execute` / `buildMessages` 等）仅同域内部使用，不 re-export 到 common。

### 6.4 预留扩展点

- **工具 registry**：新增工具只在 `tools/` 下新增文件并注册，不影响 orchestrator；
- **流式协议**：`stream/events.ts` 集中定义事件，前端 / 后端都从此引用；新增事件类型不需要改 orchestrator 的调度骨架；
- **对话历史窗口**：`historyWindow.service` 预留接口，MVP 走硬截断，后续版本可插入摘要策略；
- **Agent 模式扩展**：`orchestrator.runAgent()` 内部以"迭代器"形式表达循环，后续接入 MCP 只需扩展 `toolRegistry`，无需改控制流。

---

## 7. 落地状态

当前 AI 系统已完成主要代码落地：Prisma schema / migration、aiModel 域、aiGeneration 文本域、图片链路、OpenAI / Anthropic adapter、权限、审计宏、日志脱敏和路由生成均已接入。

后续收尾按以下顺序验证：

1. **数据库迁移**
   - `bunx --bun prisma migrate deploy`

2. **格式化与类型检查**
   - `bun run fix`
   - `bunx --bun tsc --noEmit`

3. **手工验证**
   - POST `/v1/ai/generation/stream`（不传 `conversationId`）→ 后端创建会话 → STANDARD SSE 正常落库
   - AGENT 模式：后端内置 `chapter.detail` 等只读工具 → 工具结果入库 → 最终回答
   - 重试：对某条 assistant 消息发起 retry → 原消息及后代 SUPERSEDED，新消息 ACTIVE
   - 取消：运行中任务 cancel → `job.canceled` 事件 + PENDING 消息 FAILED
   - 图片：POST `/v1/ai/images` → 独立图片任务返回 JSON

---

## 8. 风险与权衡

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| SSE 下游断开但服务端仍在消耗模型 tokens | 中 | orchestrator 监听 `request.signal`；断开后立即 `AbortController.abort()`；数据库仍将未完成消息置为 `FAILED`，`errorCode=CLIENT_DISCONNECTED` |
| Agent 循环打爆上下文窗口 | 中 | `maxIterations` 默认 8；模型调用前按 48,000 字符裁剪消息；工具结果按 8 KiB 强截断 |
| 重试时 supersede 更新失败导致消息状态撕裂 | 高 | `supersedeSubtree` 先收集目标子树再批量更新；失败时不继续创建新 job |
| 工具链错误被上游模型误读为最终答案 | 中 | 工具结果统一以 `TOOL` 角色与 `toolCallId` 回填；`promptBuilder` 始终插入 tool_result 块，不把错误字符串塞进 `ASSISTANT` |
| 文本生成入口被塞入运行控制参数 | 中 | controller schema 不接收 `temperature` / `tools` / `maxIterations` / `clientRequestId`；温度、工具集合和最大循环轮数均由后端模型配置与内部注册表控制 |
| 集群模式下 SSE 无法跨进程转发 | 中 | MVP 不做跨进程转发：请求落到哪个进程，整个生成流程就在那个进程完成；取消通过当前进程内的 `AbortController` 生效 |
| `metadata` JSON 字段被塞入任意业务引用导致强耦合 | 中 | controller schema 只接收 `novelId / chapterId / promptTemplateId / scene`；service 按这些键解析上下文 |
| 单会话消息数无限膨胀 | 中 | MVP 不自动归档；列表用游标分页，模型调用前用历史窗口裁剪，后续再补归档或摘要策略 |

### 已考虑但未采纳的方案

- **为每种生成场景开独立会话表（per-scene）**：扩展性差，跨场景复用困难，且 `metadata.scene` 字段足以区分，放弃。
- **以 `branchId` 显式建模分支**：MVP 只需要"最新分支视图"，父指针 + SUPERSEDED 状态已满足；显式 branchId 在需要"历史分支切换"时再引入。
- **首版接入 MCP / 联网工具**：工具授权、链路审计、反指令注入（prompt injection）等成本显著高于只读内部工具；留到后续版本。
- **生成走独立任务队列（BullMQ / 自研）**：SSE 本身天然把"任务生命周期"绑在一次 HTTP 连接上；异步任务 + 轮询是额外复杂度，确认只有 SSE 后不必引入。

---

## 9. 自检结果

### 通过

- **分层**：controller 仅校验 + 调 service；service 不感知 HTTP；lib/utils 无业务语义；依赖方向单向。
- **模块化**：新业务域独立 `service/aiGeneration/` + `controller/v1/ai/`；工具独立 `tools/` 子目录；一个资源一个文件。
- **规范**：文件后缀 `*.ctrl.ts` / `*.service.ts`；实体 PascalCase 单数；字段 camelCase；枚举 UPPER_SNAKE_CASE；所有公开函数要求 JSDoc + 显式返回类型。
- **响应**：非 SSE 端点走 `$g.success()` + `HttpError`；SSE 在事件中以 `errorCode` 承载错误。
- **鉴权**：全部 `requireAuth`；归属校验在 service 层；权限扩展已列入 common。
- **数据模型**：都有 `createdAt/updatedAt`；外键明确 `onDelete`；常用查询有索引；枚举受控；无非结构化塞 JSON（`metadata` 为白名单键）。
- **审计**：新增 `ai` 类别；AI 用户侧 controller 通过路由宏声明审计动作，管理端 AI 配置使用 `system` 类别。
- **文档**：已同步 `project-structure.md` / `api.md` / `ai-system-progress.md`，并记录后续迁移、格式化与端到端验证项。

### 需修正

- 无（当前方案已自洽）。

### 已权衡（已知偏离但合理）

- **SSE 未抽象成独立插件**：SSE 与生成任务强绑定，抽成插件会让上下文（abortSignal / 取消标记）传递更绕；因此放在 `service/aiGeneration/stream/` 下作为生成域内部组件。
- **`AiConversation.modelId` 不建外键**：跨域实体（槽位表）是 aiModel 域私产，生成域不应在 schema 层耦合；由 service 层调用 aiModel 公开函数兜底校验。
