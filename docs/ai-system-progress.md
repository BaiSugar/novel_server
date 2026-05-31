# AI 生成系统交接记忆文档

> 用途：开启新对话后，把本文档作为首要上下文读取即可续接。
> 最后更新：2026-05-24
> 当前状态：AI 模型域、文本生成、图片生成、SSE、提示词后端渲染和敏感响应边界已落地；角色库、词条库已通过统一上下文素材库接入 AI 上下文。

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
- `app/service/aiGeneration/contextResolver.service.ts`：渲染提示词模板为 system prompt，并解析用户明确选择/输入的上下文。
- `app/service/aiGeneration/promptBuilder.service.ts`：按 `system -> history/tools -> final user` 组装模型消息。
- `app/service/aiGeneration/historyWindow.service.ts`
- `app/service/aiGeneration/conversation.service.ts`
- `app/service/aiGeneration/message.service.ts`
- `app/service/aiGeneration/job.service.ts`
- `app/service/aiGeneration/orchestrator.service.ts`
- `app/service/aiGeneration/stream/events.ts`
- `app/service/aiGeneration/stream/sseEmitter.ts`
- `app/controller/v1/ai/conversation.ctrl.ts`
- `app/controller/v1/ai/generation.ctrl.ts`
- `app/controller/v1/ai/contextItem.ctrl.ts`：提供作品素材库可选素材列表和生成设置页素材选择状态保存/读取。

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
  - 将提示词模板渲染结果归入 system prompt。
  - 将 `contextItemIds`、`categoryContexts`、`metadata.scene` 和 `userMessage` 归入最终 user 消息。
  - 创建/校验会话。
  - 落库 USER 消息与 PENDING assistant 消息。
  - 调模型并通过 SSE 返回增量。
- 当前模型消息顺序：system prompt → 历史 conversation / tools → final user。
- `categoryContexts` 支持 `15=本章剧情`、`11=扩写文本`、`13=后续剧情`；未传或内容为空的分类不注入。
- `GET /v1/ai/context-items/selection-state` 读取生成设置页素材选择状态；高级功能开启后，前端用它自动加载角色库、词条库和后续关联库的勾选状态。
- `PUT /v1/ai/context-items/selection-state` 保存生成设置页某个来源下的勾选状态。
- AGENT 模式：
  - 工具集合由后端内部注册表控制。
  - 最大循环轮数由后端固定控制，目前 `DEFAULT_MAX_ITERATIONS = 12`。
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
  - 默认 `PromptService.detail(id, userId)`：不返回 `content`，AI 生成内部工具不再提供提示词模板查询能力。
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

### 2.5 角色库与词条库已接入上下文素材库

相关文件：

- `app/service/contextLibrary/contextSource.service.ts`
- `app/service/contextLibrary/contextFolder.service.ts`
- `app/service/contextLibrary/contextItem.service.ts`
- `app/controller/v1/context-library/contextLibrary.ctrl.ts`
- `app/service/aiGeneration/contextItem.service.ts`
- `app/controller/v1/ai/contextItem.ctrl.ts`

当前行为：

- 角色库和词条库复用 `ContextSource` / `ContextItem` / `NovelContextBinding`。
- `ContextFolder` 提供真实文件夹树，用于按来源组织角色和词条。
- 角色库字段：姓名、性别、角色性格、角色设定与背景、外貌。
- 词条库字段：词条名称、词条释义。
- 创建/更新素材时，后端校验结构化字段并生成 `renderedText`，不信任前端提交最终上下文文本。
- `/v1/ai/context-items` 必须传 `novelId`，只返回该作品素材库已绑定素材，支持按 `sourceKey`、`folderId` 查询。
- 生成时仍只提交 `contextItemIds`，模型上下文读取对应 `renderedText`；这些素材必须属于 `metadata.novelId` 对应作品素材库。
- 多个角色/词条按前端传入的 `contextItemIds` 顺序拼接，素材之间空行分隔，整体放在最终 user 消息中的“用户选择的上下文素材”段落。

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

### 4.2 作品素材库

用户已重新确认：作品对应单独素材库，没有“全局/非全局”之分。

当前方向：

- 人物卡、词条卡、备忘录本质上都通过统一上下文素材模型承载。
- 素材进入某个作品素材库后，才会在该作品的 AI 生成设置中可选。
- 生成时必须带 `metadata.novelId` 才能使用 `contextItemIds`。
- AI 可选素材列表只返回当前作品素材库中的绑定素材。
- 不允许跨用户、跨作品素材库注入上下文。

后端必须校验：

- 用户选择的上下文项属于当前用户。
- 本次生成传了 `contextItemIds` 时，必须有 `metadata.novelId`。
- 所有上下文项都必须属于当前作品素材库。
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

## 5. 最新上下文分层规则

当前代码已按最新规则调整：

1. `metadata.novelId` 只用于归属/筛选/校验，不自动注入作品简介。
2. `metadata.chapterId` 只用于归属/筛选/校验，不自动注入章节正文。
3. `promptTemplateIds` 渲染结果进入 system prompt。
4. `contextItemIds` 渲染文本进入最终 user 消息。
5. `categoryContexts` 进入最终 user 消息，当前只接受：
   - `categoryId=15`：本章剧情。
   - `categoryId=11`：扩写文本。
   - `categoryId=13`：后续剧情。
6. 对应分类未传或内容为空时，不生成标题，也不注入空段落。
7. 最终模型消息顺序为：system prompt → 历史 conversation / tools → final user。

---

## 6. 后续验证重点

- 执行 `bun run generate_script`，同步 controller schema 生成路由。
- 执行 `bunx --bun tsc --noEmit`，确认新增 `categoryContexts` 与消息分层类型无误。
- 在已迁移数据库和运行中服务上手测：
  - 只传 `categoryId=15` 时只出现“本章剧情”。
  - 不传 `categoryId=11/13` 或传空内容时不生成对应标题。
  - `promptTemplateIds` 渲染结果进入 system，角色/词条和分类内容进入最终 user。
  - 传 `metadata.novelId/chapterId` 不会自动注入作品简介或章节正文。

---

## 7. API 文档当前状态

当前已同步：

- `docs/api.md`
- `docs/ai-generation.md`
- `docs/ai-system-progress.md`（本文档）

重点约定：

- `metadata.novelId/chapterId` 不自动注入模型上下文。
- `promptTemplateIds` 进入 system prompt。
- `contextItemIds` 和 `categoryContexts` 进入最终 user。
- 未传或内容为空的分类不注入。

---

## 8. 关键代码位置速查

### 8.1 生成输入类型

文件：`app/service/aiGeneration/types.ts`

当前：

- `AiMetadata`：`novelId?: number; chapterId?: number; promptTemplateId?: number; scene?: string;`
- `CreateGenerationInput`：包含 `conversationId` / `userMessage` / `promptTemplateIds` / `promptInputs` / `contextItemIds` / `categoryContexts` / `metadata` / `mode` / `modelId`。
- `CreateImageGenerationInput`：包含 `prompt` / `promptTemplateId` / `promptInputs` / `contextItemIds` / `categoryContexts` / `metadata` / `size` / `quality` / `n` / `clientRequestId`。

### 8.2 请求 schema

文件：

- `app/controller/v1/ai/generation.ctrl.ts`
- `app/controller/v1/ai/images.ctrl.ts`
- `app/controller/v1/ai/conversation.ctrl.ts`

当前 schema 允许：

- `metadata.novelId` / `metadata.chapterId` / `metadata.promptTemplateId` / `metadata.scene`。
- 文本生成：`promptTemplateIds`、`contextItemIds`、`categoryContexts`。
- 图片生成：`promptTemplateId`、`contextItemIds`、`categoryContexts`。

### 8.3 上下文解析

文件：`app/service/aiGeneration/contextResolver.service.ts`

当前行为：

- 不存在基于 `metadata.novelId/chapterId` 的作品/章节正文自动注入。
- `resolveContextItems()` 只解析用户传入的 `contextItemIds`。
- `categoryContexts` 只保留 `15/11/13` 且内容非空的项，并按本章剧情 → 扩写文本 → 后续剧情顺序拼接。
- `systemPromptText` 承载提示词模板渲染结果。
- `finalUserPrompt` 承载素材、分类内容、场景和用户输入。

### 8.4 任务创建

文件：`app/service/aiGeneration/job.service.ts`

当前：

- `createAndStart()` 会先解析 `resolveGenerationContext()`。
- USER 消息落库为 `resolvedContext.finalUserPrompt`，即素材/分类上下文 + 用户输入。
- 提示词模板渲染结果不落入 USER 消息，运行时作为 system prompt 发给模型。
- `metadata` 会落到会话/任务链路中。

### 8.5 图片生成

文件：`app/service/aiGeneration/image.service.ts`

当前：

- 图片也复用 `resolveGenerationContext()`。
- 图片最终 prompt 由 `systemPromptText + finalUserPrompt` 拼接。
- 图片请求也支持 `contextItemIds` 与 `categoryContexts`。

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

本轮新增分层改动完成后仍需重新执行类型检查和必要的手工端到端验证。