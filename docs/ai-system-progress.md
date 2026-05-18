# AI 生成系统交接记忆文档

> 用途：开启新对话后，把本文档作为首要上下文读取即可续接。
> 最后更新：2026-05-13
> 当前状态：AI 模型域、文本生成、图片生成、SSE、提示词后端渲染和敏感响应边界已落地；作品上下文选择规则需要按用户最新要求继续修正。

---

## 1. 当前项目与技术约束

- 项目：`Novel` AI 网文写作平台后端。
- Runtime：Bun。
- Web 框架：Elysia。
- ORM：Prisma 7.x。
- DB：MySQL / MariaDB 适配。
- 类型检查：`bunx --bun tsc --noEmit`。
- 分层要求：controller 薄层，业务逻辑全部在 service；`$g` 只在 controller 层使用。
- 新增/删除/移动文件时必须同步 `docs/project-structure.md`。本轮没有新增/删除/移动文件。

---

## 2. 已完成的主要代码改动

### 2.1 AI 模型域已落地

相关文件：

- `app/service/aiModel/types.ts`
- `app/service/aiModel/keyCodec.service.ts`
- `app/service/aiModel/model.service.ts`
- `app/service/aiModel/adapter/types.ts`
- `app/service/aiModel/adapter/openai.adapter.ts`
- `app/service/aiModel/adapter/anthropic.adapter.ts`
- `app/service/aiModel/adapter/index.ts`
- `app/controller/v1/ai/models.ctrl.ts`
- `app/controller/v1/admin/ai/ai.ctrl.ts`

能力：

- 管理端模型定义、槽位、Provider 账号、绑定、健康度。
- 前端只看到可用模型槽位。
- 生成域只调用 `aiModel` 公开 service，不直接读 Provider 表、不接触 `apiKey`。
- OpenAI / Anthropic / Image 适配收敛在 adapter 层。

### 2.2 AI 文本生成链路已落地

相关文件：

- `app/service/aiGeneration/types.ts`
- `app/service/aiGeneration/contextResolver.service.ts`
- `app/service/aiGeneration/promptBuilder.service.ts`
- `app/service/aiGeneration/historyWindow.service.ts`
- `app/service/aiGeneration/conversation.service.ts`
- `app/service/aiGeneration/message.service.ts`
- `app/service/aiGeneration/job.service.ts`
- `app/service/aiGeneration/orchestrator.service.ts`
- `app/service/aiGeneration/stream/events.ts`
- `app/service/aiGeneration/stream/sseEmitter.ts`
- `app/controller/v1/ai/conversation.ctrl.ts`
- `app/controller/v1/ai/generation.ctrl.ts`

当前行为：

- 文本生成入口：`POST /v1/ai/generation/stream`。
- 请求契约已收紧：
  - `mode` 必填。
  - `modelId` 必填。
  - `conversationId` 可选；不传则后端创建会话，并在 `job.created` SSE 事件返回 `conversationId`。
  - 前端不再传 `temperature` / `tools` / `maxIterations` / `clientRequestId`。
- 后端负责：
  - 读取提示词模板。
  - 用 `promptInputs` 替换 `{{变量}}`。
  - 创建/校验会话。
  - 落库 USER 消息与 PENDING assistant 消息。
  - 调模型并通过 SSE 返回增量。
- AGENT 模式：
  - 工具集合由后端内部注册表控制。
  - 最大循环轮数由后端固定控制，目前 `DEFAULT_MAX_ITERATIONS = 8`。
  - 工具调用结果落库为 TOOL 消息，再回填下一轮模型上下文。

### 2.3 图片生成链路已落地

相关文件：

- `app/service/aiGeneration/image.service.ts`
- `app/controller/v1/ai/images.ctrl.ts`

当前行为：

- 图片生成入口：`POST /v1/ai/images`。
- 查询入口：`GET /v1/ai/images/:jobId`。
- 图片生成独立使用 `AiImageGenerationJob`，不复用 `AiGenerationJob` / `AiMessage`。
- 图片任务返回普通 JSON，不走 SSE。
- 图片最终 prompt 已做响应脱敏：响应里 `prompt: ""`，并带 `promptRedacted: true`，保留 `promptHash`。

### 2.4 提示词敏感边界已修正

用户明确规则：

- 前端只是负责交互，生成逻辑由后端实现。
- 提示词正文属于敏感信息，不能出现在生成交互、消息记录、任务响应、AI 工具结果中。
- 但作者本人进入提示词编辑页、查看提示词历史版本时必须返回正文。

当前已落地：

- `app/service/prompt/prompt.service.ts`
  - `PromptService.detail(id, userId, { includeContent: true })`：作者编辑场景返回 `content`。
  - 默认 `PromptService.detail(id, userId)`：不返回 `content`，供 AI 工具 `prompt.detail` 使用。
  - 创建、更新、恢复版本后给作者返回 `content`。
  - 历史版本详情 `versionDetail()` 给作者返回 `content`。
  - 列表不返回 `content`，只返回参数/元数据。
- `app/controller/v1/prompts/prompt.ctrl.ts`
  - `GET /v1/prompts/:id` 明确传 `includeContent: true`，用于作者编辑页。
- `app/service/aiGeneration/message.service.ts`
  - 前端消息列表对 `USER` / `TOOL` 消息正文置空，返回 `contentRedacted: true`。
  - 后端内部 `listActiveChain()` 仍读取完整内容供模型上下文使用。
- `app/service/aiGeneration/image.service.ts`
  - 图片任务响应不返回最终 prompt 正文。

---

## 3. 当前验证状态

已执行并通过：

```bash
bunx --bun tsc --noEmit
```

已读取最近编辑文件诊断：未发现新引入的 lint 问题。

注意：终端中出现过 PowerShell `Set-PSReadLineOption` 的环境警告，但类型检查本身通过；该警告不是项目代码错误。

尚未执行：

- `bunx --bun prisma migrate deploy`
- `bun run fix`
- 手工端到端验证

---

## 4. 用户最新确认的关键产品规则

这是下一轮最重要的待修正规则。

### 4.1 `metadata` 只表示业务归属，不等于模型上下文

用户已明确：作品信息上下文也要由用户决定放哪个进去，例如：

- 正文
- 梗概
- 后续出的备忘录
- 人物卡
- 词条卡
- 其他上下文素材

因此：

- `metadata.novelId` 只表示“这次生成关联哪个作品”。
- `metadata.chapterId` 如果继续保留，也只能表示“这次生成关联哪个章节”。
- **不能因为传了 `metadata.novelId` 或 `metadata.chapterId`，后端就自动把作品简介/章节正文注入模型上下文。**
- 真正进入模型的上下文，必须来自用户明确选择。

### 4.2 上下文素材不强制绑定作品

用户已重新确认：不建议把人物卡、词条卡、备忘录设计为都绑定作品，也不建议把“人物卡/词条卡/备忘录”做成硬编码类型。

正确方向：

- 人物卡、词条卡、备忘录本质上都是作者级上下文素材。
- 素材可以绑定到作品，但作品绑定只是“使用关系”，不是素材本体的唯一归属。
- 同一素材后续可以复用于多个作品、系列、番外或临时生成场景。
- 生成时是否可用由后端根据用户归属、全局可用性和作品绑定关系判断。

后端后续必须校验：

- 用户选择的上下文项属于当前用户。
- 若上下文项是全局可用素材，可直接被当前用户选择。
- 若上下文项不是全局可用素材，且本次生成传了 `metadata.novelId`，则必须存在该素材与该作品的有效绑定关系。
- 不允许跨用户注入上下文。

### 4.3 不要在生成请求或 Prisma enum 中硬编码上下文类型

曾经临时提到过这种设计：

```json
{ "type": "NOVEL_SYNOPSIS", "id": 1 }
```

用户质疑后已确认：这不是目标设计。

正确方向：

- 前端不应在生成请求中传 `type: "NOVEL_SYNOPSIS"` / `CHARACTER_CARD` / `MEMO` 这类硬编码枚举。
- Prisma 也不应使用 `ContextItemKind` 这类枚举来固定“人物卡/词条卡/备忘录”。
- 后端应提供可选上下文项列表，列表项可带来源展示信息，例如 `{ source: { id, name } }`。
- 前端只展示列表给用户勾选。
- 生成时前端只提交用户选中的上下文项 ID。
- 上下文项如何渲染为模型上下文，由后端根据数据库中的 `ContextSource` 配置和 `ContextItem.renderedText` 处理。

建议生成请求方向：

```json
{
  "mode": "STANDARD",
  "modelId": 1,
  "promptTemplateId": 2,
  "promptInputs": {
    "类型": "玄幻"
  },
  "metadata": {
    "novelId": 1
  },
  "contextItemIds": [101, 102, 205]
}
```

含义：

- `metadata.novelId`：作品作用域/业务归属。
- `contextItemIds`：用户明确选择要注入模型的上下文项。
- `contextItemIds` 对应的来源、内容、排序、可用性和归属校验都由后端处理。

### 4.4 上下文来源配置化目标模型

建议后续设计：

- `ContextSource`：上下文来源配置，例如“人物卡”“词条卡”“备忘录”。这是数据库配置，不是生成请求字段，也不是 Prisma enum。
- `ContextItem`：统一上下文素材表，归属 `userId`，关联 `sourceId`，保存 `title`、`summary`、结构化 `data` 和用于模型注入的 `renderedText`。
- `NovelContextBinding`：作品与上下文素材的使用关系表，只表达“某作品可使用某素材”。
- AI 生成链路只读取 `contextItemIds`，校验后按 `renderedText` 拼上下文，不关心它是人物卡、词条卡还是备忘录。

---

## 5. 当前代码与最新产品规则的冲突点

必须优先修正：`contextResolver.service.ts` 当前仍会自动注入作品/章节上下文。

当前代码事实：

- `GenerationContextInput.metadata` 包含 `novelId` / `chapterId` / `promptTemplateId` / `scene`。
- `resolveGenerationContext()` 内部调用：

```ts
const workContext = await resolveNovelContext(
  userId,
  input.metadata?.novelId,
  input.metadata?.chapterId,
);
```

- `resolveNovelContext()` 当前行为：
  - 传 `novelId` 时自动读取作品 `name` / `description` / `type` / `totalWords` 并放入上下文。
  - 传 `chapterId` 时自动读取章节正文并放入上下文。

这与用户最新规则冲突。

下一轮应改为：

1. `metadata.novelId` 只用于归属/筛选/校验，不自动注入内容。
2. 新增 `contextItemIds?: number[]` 到文本生成与图片生成输入。
3. 后端新增“上下文项解析”逻辑：只解析用户选择的 `contextItemIds`。
4. 上下文项必须属于当前用户；若不是全局可用素材，且本次生成传了 `metadata.novelId`，则必须存在有效作品绑定关系。
5. 不要在生成请求体或 Prisma enum 中硬编码 `type` / `ContextItemKind`。
6. 如果当前还没有上下文素材表，先在文档中明确目标契约；代码层可先停止 `metadata` 自动注入，并等待 `ContextSource` / `ContextItem` / `NovelContextBinding` 数据模型落地。

---

## 6. 建议下一轮执行计划

### 6.1 先做最小正确修正

目标：马上停止错误的自动上下文注入。

建议改动：

1. 在 `app/service/aiGeneration/contextResolver.service.ts` 中移除或停用 `resolveNovelContext(userId, metadata.novelId, metadata.chapterId)` 的自动拼接。
2. 保留 `metadata.scene` 是否注入需要再确认；它是用户输入的场景说明，当前会作为 `# 创作场景` 注入。若严格按“用户选择上下文”规则，`scene` 仍可视为本次生成的显式输入，不等同作品上下文。
3. `metadata.novelId` 继续允许传入，用于会话 metadata 记录与列表筛选。
4. 同步修改 `docs/api.md` / `docs/ai-generation.md`：明确 `metadata` 不自动进入模型上下文。
5. 跑 `bunx --bun tsc --noEmit`。

### 6.2 再设计上下文项体系

不要让前端传硬编码 `type`。

建议后续模型：

- 作品下有统一的上下文项概念，例如 `NovelContextItem`。
- 它可以覆盖：梗概、章节正文引用、人物卡、词条卡、备忘录等。
- 前端先请求某作品的可选上下文项列表。
- 生成请求只传 `contextItemIds`。
- 后端按 `ContextSource` 配置和 `ContextItem.renderedText` 拼装上下文，生成链路不硬编码素材类型。

目标模型：引入统一 `ContextItem` 与配置化 `ContextSource`。人物卡、词条卡、备忘录只是数据库里的来源配置，不是 Prisma enum，也不是生成请求里的 `type`。作品绑定通过 `NovelContextBinding` 表达“某作品可使用某素材”，不作为素材本体的唯一归属。

---

## 7. API 文档当前状态

已同步过的文件：

- `docs/api.md`
- `docs/ai-generation.md`
- `docs/ai-system-progress.md`（本文档）

但 `docs/api.md` / `docs/ai-generation.md` 里仍可能存在“`metadata.novelId` 会拼装作品上下文”的旧描述。下一轮要统一改掉。

重点搜索关键词：

- `metadata`
- `novelId`
- `chapterId`
- `作品上下文`
- `关联作品`
- `promptTemplateId`
- `promptInputs`

---

## 8. 关键代码位置速查

### 8.1 生成输入类型

文件：`app/service/aiGeneration/types.ts`

当前：

- `AiMetadata`：`novelId?: number; chapterId?: number; promptTemplateId?: number; scene?: string;`
- `CreateGenerationInput`：包含 `conversationId` / `userMessage` / `promptTemplateId` / `promptInputs` / `metadata` / `mode` / `modelId`。
- `CreateImageGenerationInput`：包含 `prompt` / `promptTemplateId` / `promptInputs` / `metadata` / `size` / `quality` / `n` / `clientRequestId`。

### 8.2 请求 schema

文件：

- `app/controller/v1/ai/generation.ctrl.ts`
- `app/controller/v1/ai/images.ctrl.ts`
- `app/controller/v1/ai/conversation.ctrl.ts`

当前 schema 允许 `metadata.novelId` / `metadata.chapterId` / `metadata.promptTemplateId` / `metadata.scene`。

下一轮如新增 `contextItemIds`，需要同步 controller schema 与 service input 类型。

### 8.3 上下文解析

文件：`app/service/aiGeneration/contextResolver.service.ts`

当前冲突点：

- `resolveNovelContext()` 自动按 `metadata.novelId` / `metadata.chapterId` 拼上下文。
- `resolveGenerationContext()` 会把 `workContext` 拼进 `contextText`。

### 8.4 任务创建

文件：`app/service/aiGeneration/job.service.ts`

当前：

- `createAndStart()` 会先解析 `resolveGenerationContext()`。
- 然后把 `resolvedContext.renderedPrompt` 落库为 USER 消息。
- `metadata` 会落到会话/任务链路中。

### 8.5 图片生成

文件：`app/service/aiGeneration/image.service.ts`

当前：

- 图片也复用 `resolveGenerationContext()`。
- 因此也受 `metadata` 自动上下文注入问题影响。

### 8.6 提示词详情/敏感边界

文件：

- `app/service/prompt/prompt.service.ts`
- `app/controller/v1/prompts/prompt.ctrl.ts`
- `app/service/aiGeneration/message.service.ts`
- `app/service/aiGeneration/image.service.ts`
- `app/service/aiGeneration/tools/registry.ts`

当前已经按规则处理，不要回退：

- 作者编辑页返回提示词正文。
- AI 工具结果不返回提示词正文。
- 消息列表不返回 USER / TOOL 正文。
- 图片任务不返回 prompt 正文。

---

## 9. 不要误解的点

1. `metadata.novelId` 不是“把作品信息塞进模型”的开关。
2. `metadata.chapterId` 也不是“把章节正文塞进模型”的开关。
3. 前端不应该构造 `type: "NOVEL_SYNOPSIS"` 这类上下文类型。
4. 人物卡、词条卡、备忘录不是作品下的强归属数据；它们是作者级上下文素材，可通过绑定关系被作品使用。
5. 前端负责交互和选择；后端负责所有真实逻辑、归属校验、上下文拼装、模型调用、持久化。
6. 提示词正文敏感，但作者本人编辑提示词时必须返回正文。

---

## 10. 最近一次完成验证

最后一次成功验证命令：

```bash
bunx --bun tsc --noEmit
```

结果：通过。

最后一次需要注意的未落地修正：**停止 `metadata.novelId/chapterId` 自动注入作品/章节上下文，改为用户选择的 `contextItemIds` 或后续统一上下文项体系。**