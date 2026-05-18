# Claude Code - AI 请求机制分析

> 基于 `claude-code-rev-main` 逆向工程分析，聚焦 AI 模型请求的全链路实现。

---

## 一、请求入口与整体流程

### 1.1 请求触发

用户输入 → `src/query/` 处理 → `queryModel()` 发起 API 调用。

```
用户输入 → config.ts (构建查询配置) → stopHooks.ts (前置处理)
  → claude.ts queryModel() → Anthropic API
  → 流式响应解析 → stopHooks.ts (后置处理: 记忆提取、自动续写)
```

### 1.2 核心函数 `queryModel()`

位置：`src/services/api/claude.ts:1017`

```typescript
async function* queryModel(
  messages: Message[],        // 对话历史
  systemPrompt: SystemPrompt, // 系统提示词数组
  thinkingConfig: ThinkingConfig, // 思考配置
  tools: Tools,               // 可用工具列表
  signal: AbortSignal,        // 中断信号
  options: Options,           // 请求选项
): AsyncGenerator<StreamEvent | AssistantMessage | SystemAPIErrorMessage>
```

函数内部按以下流程构建并发送请求：

1. **模型解析** — Bedrock inference profile 解析 → 实际模型名
2. **Beta 头组装** — `getMergedBetas()` 收集所有功能开关
3. **工具搜索判断** — 是否启用动态工具加载
4. **工具 Schema 构建** — 并行调用 `toolToAPISchema()` 生成 API 格式
5. **消息归一化** — `normalizeMessagesForAPI()` 清理内部字段
6. **消息修复** — `ensureToolResultPairing()` 修复孤立的 tool_use/tool_result
7. **系统提示词组装** — attribution header + CLI prefix + system sections
8. **缓存策略** — `buildSystemPromptBlocks()` 切分静态/动态内容
9. **参数构建** — `paramsFromContext()` 闭包生成最终请求 JSON
10. **流式发送** — `anthropic.beta.messages.stream()` (raw events)
11. **重试 + 降级** — `withRetry()` 指数退避，非流式兜底

---

## 二、提示词封装与发送

### 2.1 系统提示词构建

`src/constants/prompts.ts` 的 `getSystemPrompt()` 组装完整系统提示词数组：

```
┌─────────────────────────────────────────────────┐
│  Static (全局可缓存)                              │
│  - Intro: "You are an interactive agent..."      │
│  - System: 环境、工具权限、hooks 说明              │
│  - Doing tasks: 编码规范、安全要求                 │
│  - Actions: 风险操作确认规则                      │
│  - Using tools: 工具使用优先级                    │
│  - Tone/Style: 语气和风格                        │
│  - Output efficiency: 输出效率                   │
├─────────────────────────────────────────────────┤
│  __SYSTEM_PROMPT_DYNAMIC_BOUNDARY__              │
├─────────────────────────────────────────────────┤
│  Dynamic (会话相关，不可全局缓存)                   │
│  - session_guidance: 会话特定指引                 │
│  - memory: MEMORY.md 内容和指令                   │
│  - model_override: Ant 模型覆盖配置               │
│  - env_info: 环境信息 (cwd, git, OS, date...)     │
│  - language: 输出语言偏好                         │
│  - output_style: 输出风格配置                     │
│  - mcp_instructions: MCP 服务器指令               │
│  - scratchpad: 草稿本指令                        │
│  - frc: 函数结果清理规则 (function result clearing)│
│  - summarize_tool_results: 工具结果摘要           │
│  - token_budget: Token 预算自动续写               │
│  - brief: 简介模式                               │
└─────────────────────────────────────────────────┘
```

#### 缓存边界标记

`src/constants/prompts.ts` 中定义：

```typescript
export const SYSTEM_PROMPT_DYNAMIC_BOUNDARY =
  '__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__'
```

此标记前后内容采用不同缓存策略（见 3.3 节）。

### 2.2 CLI 前缀

`src/constants/system.ts` 提供三种前缀变体：

| 前缀 | 使用场景 |
|------|---------|
| `You are Claude Code, Anthropic's official CLI for Claude.` | 交互式 CLI (默认) |
| `You are Claude Code, ... within the Claude Agent SDK.` | SDK 非交互模式 + appendSystemPrompt |
| `You are a Claude agent, built on Anthropic's Claude Agent SDK.` | 通用 Agent SDK 模式 |

### 2.3 Attribution Header

每个 API 请求附带 `x-anthropic-billing-header`：

```
x-anthropic-billing-header: cc_version=<ver>.<fingerprint>; cc_entrypoint=<entrypoint>; cch=<attestation>; cc_workload=<workload>;
```

- **fingerprint**：从首条用户消息计算（防止跨会话追索）
- **cch**：客户端合法性证明占位符（由 Bun HTTP 层在发送前替换为真实哈希）
- **cc_workload**：工作负载类型提示（API 可用于 QoS 路由）

### 2.4 消息归一化

`src/utils/messages.ts` 的 `normalizeMessagesForAPI()` 处理 5,513 行逻辑：

1. **剥离内部字段** — 移除 `caller`、`tool_reference` 等仅内部使用的字段
2. **工具输入归一化** — 将内部 Tool 输入格式转为 API 兼容格式
3. **确保 tool_use/tool_result 配对** — `ensureToolResultPairing()` 修复孤块
4. **剥离 Advisor 块** — 未启用 advisor beta 时移除 `advisor_20260301` 块
5. **剥离多余媒体项** — 限制每请求媒体数量 ≤ 100

### 2.5 最终请求 JSON 结构

`paramsFromContext()` 闭包构建最终请求参数（`src/services/api/claude.ts:1530`）：

```typescript
{
  model: "claude-sonnet-4-6",           // 归一化模型名
  messages: [...],                       // 对话历史 (MessageParam[])
  system: [...],                         // 系统提示词块 (含 cache_control)
  tools: [...],                          // 工具 Schema (BetaToolUnion[])
  tool_choice: { type: "auto" },         // 工具选择模式
  betas: ["claude-code-20250219", ...],  // Beta 功能头
  metadata: { user_id: "..." },          // 用户标识
  max_tokens: 16384,                     // 最大输出 token
  thinking: {                            // 思考配置 (可选)
    type: "adaptive"                     // 或 { type: "enabled", budget_tokens: N }
  },
  temperature: 1,                        // 仅 thinking=disabled 时发送
  context_management: { ... },           // API 端上下文管理 (可选)
  output_config: {                       // 输出配置 (可选)
    effort: "high",
    task_budget: { type: "tokens", total: 500000, remaining: 480000 },
    format: { type: "json_schema", ... }
  },
  speed: "fast",                         // 快速模式 (可选)
  // extraBodyParams 展开
  anthropic_beta: [...],                 // Bedrock 专用 beta 头
  anti_distillation: ["fake_tools"],     // 反蒸馏保护
}
```

---

## 三、上下文管理

### 3.1 上下文窗口

- 通过 `context-1m-2025-08-07` beta 头启用 1M token 上下文
- `getModelMaxOutputTokens()` 按模型返回最大输出 token
- `getMaxThinkingTokensForModel()` 按模型返回最大思考 token

### 3.2 对话压缩 (Compaction)

`src/services/compact/` 提供多层压缩策略：

| 压缩层 | 文件 | 说明 |
|--------|------|------|
| **autoCompact** | `autoCompact.ts` | 自动触发，fork agent 摘要旧消息 |
| **reactiveCompact** | `reactiveCompact.ts` | 响应式窗口管理 |
| **microCompact** | `microCompact.ts` | 轻量级 per-turn 压缩 (cache_edits API) |
| **apiMicrocompact** | `apiMicrocompact.ts` | API 端 `context_management` 参数传递 |
| **cachedMicrocompact** | `cachedMicrocompact.ts` | 功能门控的缓存微压缩 |
| **sessionMemoryCompact** | `sessionMemoryCompact.ts` | 会话记忆压缩 |

### 3.3 Prompt 缓存策略

`src/utils/api.ts` 的 `splitSysPromptPrefix()` 实现三种策略：

#### 策略 1：Tool-based（MCP 工具 + global cache）
当存在非 deferred MCP 工具且启用 global cache 时，系统提示词不使用 global scope。改为将 `cache_control` 标记放在工具 Schema 上。

#### 策略 2：Global boundary（第一方 + 有边界标记）
```
┌──────────────────────────┐
│ Static content           │ ← scope: "global" (跨会话共享)
├──────────────────────────┤
│ __DYNAMIC_BOUNDARY__     │
├──────────────────────────┤
│ Dynamic content          │ ← 无缓存
└──────────────────────────┘
```

#### 策略 3：Org-level（第三方或无边界标记）
整个系统提示词拼接后使用 `scope: "org"`（组织内共享）。

### 3.4 缓存控制标记

`getCacheControl()` 生成 `cache_control` 块：

```typescript
{
  type: "ephemeral",
  ttl?: "1h",        // 订阅用户/蚂蚁员工 1 小时 TTL
  scope?: "global"   // 全局缓存范围
}
```

1 小时 TTL 通过 GrowthBook 白名单 (`tengu_prompt_cache_1h_config`) 按 querySource 前缀匹配控制。

---

## 四、记忆生成

### 4.1 MEMORY.md 加载

`src/memdir/memdir.ts` 的 `loadMemoryPrompt()`：

- 读取项目根目录或 `~/.claude/projects/<slug>/memory/MEMORY.md`
- **截断规则**：最多 200 行 或 25KB（取先触发者）
- 超限时在内容末尾追加警告信息
- 通过 `systemPromptSection('memory', ...)` 注入系统提示词动态区

### 4.2 记忆提取 (Auto Memory)

`src/services/extractMemories/extractMemories.ts`：

- **触发时机**：每个查询循环结束后（模型产出无工具调用的最终响应时），由 `handleStopHooks()` 调用
- **实现方式**：使用 **forked agent** 模式 — 完美 fork 主对话，共享父级 prompt cache
- **四种记忆类型**：
  - **user** — 用户偏好、习惯、约束
  - **feedback** — 用户对 AI 输出的反馈
  - **project** — 项目结构、技术栈、架构决策
  - **reference** — 外部参考资料、文档链接
- **排除原则**：可从当前项目状态推导出的内容（代码模式、git 历史）不纳入记忆
- **写入路径**：`~/.claude/projects/<path-slug>/memory/` 目录

### 4.3 记忆指令注入

`buildMemoryLines()` 生成结构化行为指令：

```
## Memory (auto memory)
Use the Write tool to save durable memories to ~/.claude/projects/<slug>/memory/
- This directory already exists — write to it directly...
[四种类型定义及示例]
[何时访问记忆]
[什么不该保存]
[信任与召回说明]
```

---

## 五、MCP (Model Context Protocol)

### 5.1 MCP 客户端

`src/services/mcp/client.ts` (3,349 行)：

#### 支持的传输协议

| 协议 | 实现 |
|------|------|
| **stdio** | `StdioClientTransport` — 本地进程通信 |
| **SSE** | `SSEClientTransport` — Server-Sent Events |
| **Streamable HTTP** | `StreamableHTTPClientTransport` — 流式 HTTP |
| **WebSocket** | `WebSocketTransport` — 自定义实现 |

#### 连接生命周期

```
MCPConnectionManager (React 组件)
  → 读取 .mcp.json / ~/.claude/mcp.json / claude.json
  → 为每个 server 创建连接
  → 连接成功后: listTools(), listResources(), listPrompts()
  → 断开/重连管理
```

#### 工具发现与命名

- MCP 工具命名规则：`mcp__<server_name>__<tool_name>`
- `isToolFromMcpServer()` 判断某工具是否来自 MCP 服务器
- 通过 `defer_loading: true` 与工具搜索 (Tool Search) 集成

### 5.2 MCP 工具与 API 集成

当启用工具搜索 + MCP 工具存在时：

1. MCP 工具 Schema 带 `defer_loading: true` 发送
2. API 返回 `tool_reference` 块指向具体工具
3. 后续请求只发送已被引用的 MCP 工具完整 Schema
4. 工具名显示为 `mcp__github__search_repositories` 格式

### 5.3 MCP 指令注入

已连接且有 `instructions` 字段的 MCP 服务器，其指令通过以下路径注入系统提示词：

- **Delta 模式** (`isMcpInstructionsDeltaEnabled()`)：通过持久化 attachment 注入
- **传统模式**：通过 `DANGEROUS_uncachedSystemPromptSection('mcp_instructions', ...)` 注入系统提示词动态区

```markdown
# MCP Server Instructions
## github
[GitHub MCP 服务器的使用说明]
```

### 5.4 MCP 配置格式

```jsonc
{
  "mcpServers": {
    "github": {
      "type": "stdio",
      "command": "node",
      "args": ["./github-mcp-server/dist/index.js"],
      "env": { "GITHUB_TOKEN": "..." }
    },
    "filesystem": {
      "type": "streamableHttp",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

---

## 六、工具调用

### 6.1 工具 Schema 构建

`src/utils/api.ts` 的 `toolToAPISchema()` 将内部 `Tool` 对象转为 Anthropic API 格式：

```typescript
{
  name: "Bash",
  description: "Executes a given command in a shell session...",
  input_schema: {
    type: "object",
    properties: {
      command: { type: "string", description: "..." },
      // ...
    },
    required: ["command"]
  },
  strict: true,                    // 严格模式 Schema 校验
  defer_loading: true,             // (可选) 工具搜索延迟加载
  cache_control: {                 // (可选) 缓存控制
    type: "ephemeral",
    scope: "global"
  },
  eager_input_streaming: true      // (可选) 预加载输入流
}
```

#### Schema 缓存

工具 Schema 通过 `getToolSchemaCache()` 缓存：
- **键**：`tool.name` (普通工具) 或 `tool.name:jsonStringify(tool.inputJSONSchema)` (StructuredOutput)
- **目的**：防止 GrowthBook 功能开关中途翻转或 `tool.prompt()` 变化导致 Schema 字节变更，进而破坏服务端 prompt cache

### 6.2 动态工具加载 (Tool Search)

启用条件：
1. 模型支持工具搜索
2. 有可延迟加载的工具（MCP 工具、LSP 工具等）

启用后：
- 非延迟工具：直接发送完整 Schema
- 延迟工具：仅 `ToolSearchTool` 发送完整 Schema；其余带 `defer_loading: true`
- API 通过 `tool_reference` 块指名需要的延迟工具名
- 下次请求时，已被引用的延迟工具才发送完整 Schema

### 6.3 Swarm 字段过滤

当未启用 agent swarms 时，以下字段从工具 Schema 中移除：
- `ExitPlanModeV2`：`launchSwarm`、`teammateCount`
- `Agent`：`name`、`team_name`、`mode`

### 6.4 工具选择模式

- `tool_choice: { type: "auto" }` — 默认，模型自动决定
- `tool_choice: { type: "tool", name: "Bash" }` — 强制使用指定工具

---

## 七、温度决策

### 7.1 核心规则

位置：`src/services/api/claude.ts:1680`

```typescript
// Only send temperature when thinking is disabled — the API requires
// temperature: 1 when thinking is enabled, which is already the default.
const temperature = !hasThinking
  ? (options.temperatureOverride ?? 1)
  : undefined
```

**规则总结**：
- **Thinking 启用时**：不发送 `temperature` 字段（API 自动使用 `temperature: 1`）
- **Thinking 禁用时**：发送 `temperature: options.temperatureOverride ?? 1`
- **默认值**：始终为 `1`
- **可覆盖**：通过 `Options.temperatureOverride` 但实践中几乎恒为 `1`

### 7.2 Effort 参数

`src/utils/effort.ts`：

- 字符串形式：`"low"` | `"medium"` | `"high"` — 通过 `output_config.effort` 发送
- 数值形式：仅蚂蚁内部 (ant-only)，通过 `anthropic_internal.effort_override` 发送
- 需要 `effort-2025-11-24` beta 头

### 7.3 Speed/Fast 模式

- `speed: "fast"` — 快速模式，需要 `fast-mode-2026-02-01` beta 头
- 受冷却期限制：`isFastModeCooldown()` 防止连续快速请求
- 受模型支持限制：`isFastModeSupportedByModel()` 检查模型兼容性

---

## 八、思维链 (Thinking / Chain of Thought)

Claude Code 的思维链机制让模型在生成最终回答前先进行内部推理。思维链内容在 API 中以 `thinking` 和 `redacted_thinking` 两种 content block 类型传输，涉及请求构建、流式接收、消息规范化、UI 展示和缓存策略等多个子系统。

### 8.1 Thinking 配置

`src/utils/thinking.ts` 定义三种模式：

```typescript
type ThinkingConfig =
  | { type: 'adaptive' }                         // Opus 4.6 / Sonnet 4.6
  | { type: 'enabled'; budgetTokens: number }     // 其他模型，固定预算
  | { type: 'disabled' }                          // 完全禁用
```

#### Adaptive Thinking

- **支持模型**：`claude-opus-4-6`、`claude-sonnet-4-6`
- **第一方和 Foundry**：未知新模型默认启用 adaptive thinking
- **Bedrock/Vertex**：仅 Opus 4+ 和 Sonnet 4+ 支持
- **与温度的关系**：thinking 启用时 API 要求 `temperature: 1`，此时不发送 `temperature` 字段

#### 启用条件

`shouldEnableThinkingByDefault()` 判断链：
1. `MAX_THINKING_TOKENS` 环境变量 > 0 → 启用
2. `settings.alwaysThinkingEnabled === false` → 禁用
3. 默认 → 启用

可通过 `CLAUDE_CODE_DISABLE_THINKING` 和 `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING` 环境变量强制关闭。

### 8.2 Thinking 在 API 请求中的发送

`src/services/api/claude.ts` 的 `paramsFromContext()` 中构建 `thinking` 参数：

```typescript
if (hasThinking && modelSupportsThinking(options.model)) {
  if (adaptive thinking 可用) {
    thinking = { type: 'adaptive' }
  } else {
    let budget = getMaxThinkingTokensForModel(options.model)
    if (thinkingConfig.type === 'enabled' && thinkingConfig.budgetTokens !== undefined) {
      budget = thinkingConfig.budgetTokens
    }
    budget = Math.min(maxOutputTokens - 1, budget)
    thinking = { type: 'enabled', budget_tokens: budget }
  }
}
```

最终请求 JSON 中的 `thinking` 字段：

```json
// Adaptive（Opus 4.6 / Sonnet 4.6）
{ "thinking": { "type": "adaptive" } }

// 固定预算（Haiku 4.5 等）
{ "thinking": { "type": "enabled", "budget_tokens": 4096 } }
```

### 8.3 Thinking 内容的流式接收

`src/services/api/claude.ts` 的 streaming 循环 (~line 1995-2170) 按以下顺序处理 thinking 相关流事件：

| 流事件 | 处理逻辑 |
|--------|---------|
| `content_block_start` (type=`thinking`) | 初始化空 block，`thinking: ''`, `signature: ''` |
| `thinking_delta` | 累积文本：`contentBlock.thinking += delta.thinking` |
| `signature_delta` | 设置签名：`contentBlock.signature = delta.signature`（thinking block 专属，用于验证内容完整性） |
| `content_block_stop` | 完成累积，将完整 `BetaThinkingBlock` 附加到 assistant message |

非流式降级时，`BetaMessage` 中直接包含完整的 thinking blocks。

### 8.4 Redacted Thinking（脱敏思维链）

`REDACT_THINKING_BETA_HEADER = 'redact-thinking-2026-02-12'` 控制服务端 thinking 脱敏。

**工作机制**：
- 发送此 beta 头后，API 返回 `redacted_thinking` blocks 替代完整 `thinking` blocks
- `redacted_thinking` 仅含 `data` 字段（加密签名），不含 `thinking` 明文
- 对模型上下文不可见——后续请求中模型看不到自己的历史 thinking

**启用条件**（`src/utils/betas.ts` `getAllModelBetas()`）：
1. 仅 First-party / Foundry（`shouldIncludeFirstPartyOnlyBetas()`）
2. 模型支持 interleaved thinking（`modelSupportsISP()`）
3. 非交互模式**不**启用
4. 用户未设置 `showThinkingSummaries: true`

**与上下文管理的联调**：当 redaction 激活时，`context_management` 策略跳过 `clear_thinking_20251015`（因为 redacted blocks 本身已对模型不可见）：

```typescript
// src/services/compact/apiMicrocompact.ts
const contextManagement = getAPIContextManagement({
  hasThinking,
  isRedactThinkingActive: betasParams.includes(REDACT_THINKING_BETA_HEADER),
  clearAllThinking: thinkingClearLatched,
})
```

### 8.5 Thinking 在消息中的生命周期

#### Thinking 规则（`src/query.ts` 注释）

完整 assistant trajectory 中的 thinking 保留规则：

1. 包含 thinking/redacted_thinking block 的消息，必须属于 `max_thinking_length > 0` 的查询
2. Thinking block **不能**是消息中的最后一个 block（后面必须有 text 或 tool_use）
3. Thinking blocks 必须在整个 assistant trajectory 期间保留：从首个 thinking 开始，经过 tool_use → tool_result → 下一 assistant message，直到最终 text 输出

#### 消息规范化

`src/utils/messages.ts` 的 `normalizeMessagesForAPI()`：
- Thinking blocks 原样保留传递给 API
- `assistantMessageToMessageParam()` 中 thinking/redacted_thinking blocks **排除在 cache_control 标记之外**（不在 thinking block 上设置缓存断点）

#### 消息修复

非流式回退时，partial thinking blocks（含无效签名）会被 tombstone 机制移除，避免 API 报错 "thinking blocks cannot be modified"。

### 8.6 Thinking 的 UI 展示

`src/components/Message.tsx` 和 `src/components/MessageRow.tsx` 控制显示：

| 模式 | thinking 显示 | redacted_thinking 显示 |
|------|-------------|---------------------|
| **普通交互模式** | "∴ Thinking" + `Ctrl+O` 展开提示 | 隐藏 |
| **Transcript / Verbose 模式** | "∴ Thinking…" 标签 + 完整内容（dimColor, italic, Markdown 渲染） | 简短提示：thinking 曾发生 |
| **历史消息** | `hidePastThinking` 仅显示最后一轮 thinking | 完全隐藏 |

**流式实时预览**：`StreamingThinking` 类型在 UI 中展示实时 thinking 文本：

```typescript
StreamingThinking = {
  thinking: string        // 当前累积文本
  isStreaming: boolean    // 是否仍在流式输出
  streamingEndedAt?: number // 流结束时间戳
}
```

### 8.7 Thinking 的缓存策略

**系统提示词缓存**：thinking 不影响系统提示词的缓存分界（`__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__` 之前的内容仍使用 `scope: 'global'`）。

**消息级缓存**：`cache_control` 标记显式**跳过** thinking 和 redacted_thinking blocks：

```typescript
// assistantMessageToMessageParam() 中的逻辑
...(i === message.message.content.length - 1 &&
  _.type !== 'thinking' &&
  _.type !== 'redacted_thinking'
  ? { cache_control: getCacheControl({ querySource }) }
  : {})
```

**ThinkingClear 机制**：超过 1 小时无 API 响应时触发 `thinkingClearLatched`，下次请求发送 `context_management` 参数只保留最后 1 轮 thinking（`keep: 1`），释放上下文空间。

### 8.8 Ultrathink 关键词

`src/utils/thinking.ts` 提供 Ultrathink 检测：

```typescript
hasUltrathinkKeyword(text: string): boolean  // 正则 /ultrathink/i 匹配
isUltrathinkEnabled(): boolean               // feature('ULTRATHINK') + GrowthBook 双重门控
findThinkingTriggerPositions(text: string)   // 返回关键词位置，用于 UI 高亮
```

当用户消息中包含 `ultrathink` 关键词时，系统将 effort 提升到 high。

---

## 九、基础 JSON 请求/响应

### 8.1 API 客户端

`src/services/api/client.ts` 的 `getAnthropicClient()` 工厂函数：

| Provider | SDK | 鉴权方式 |
|----------|-----|---------|
| **First-party (Anthropic API)** | `Anthropic` | OAuth token 或 API Key |
| **Bedrock (AWS)** | `AnthropicBedrock` | AWS 凭证 + 自动刷新 |
| **Vertex AI (GCP)** | `AnthropicVertex` | GoogleAuth |
| **Foundry (Azure)** | `AnthropicFoundry` | Azure AD 或 API Key |

### 8.2 自定义 Headers

```typescript
{
  'x-app': 'cli',
  'User-Agent': getUserAgent(),
  'X-Claude-Code-Session-Id': getSessionId(),
  'x-anthropic-billing-header': '...',         // 归因头 (见 2.3)
  'x-claude-remote-container-id': '...',        // 远程容器 ID (可选)
  'x-claude-remote-session-id': '...',          // 远程会话 ID (可选)
  'x-client-app': '...',                        // SDK 应用标识 (可选)
  'x-anthropic-additional-protection': 'true',  // 附加保护 (可选)
}
```

### 8.3 流式请求

默认使用流式请求：

```typescript
anthropic.beta.messages.stream(params, {
  signal: abortSignal,
  headers: { 'x-client-request-id': clientRequestId }
})
```

使用 `BetaRawMessageStreamEvent` 类型避免 O(n²) 的局部 JSON 解析开销。

### 8.4 非流式降级

持久性错误时自动降级为非流式请求：

```typescript
anthropic.beta.messages.create(adjustedParams, {
  signal: abortSignal,
  timeout: fallbackTimeoutMs  // 默认 300s，远程会话 120s
})
```

非流式降级时 `max_tokens` 限制为 `MAX_NON_STREAMING_TOKENS`。

### 8.5 重试逻辑

`src/services/api/withRetry.ts` 提供指数退避重试：

- 最大重试次数：由 `maxRetries` 配置
- 退避策略：指数增长
- 特殊处理：
  - `529` 错误：服务端过载，延长等待
  - 认证错误：刷新 token 后重试
  - `APIUserAbortError`：用户中断，不重试
  - `CannotRetryError`：不可重试错误，直接抛出

### 8.6 成本追踪

每次响应后调用 `calculateUSDCost()` 计算实时费用：

```typescript
// 输入价格 + 输出价格 + cache 读写价格
costUSD = calculateUSDCost({
  model: options.model,
  usage: { input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens }
})
```

### 8.7 Extra Body Parameters

`CLAUDE_CODE_EXTRA_BODY` 环境变量允许注入额外 JSON 参数：

```bash
CLAUDE_CODE_EXTRA_BODY='{"custom_field": "value"}'
```

- 必须是 JSON 对象格式（非数组、非字符串）
- 会自动合并 `anthropic_beta` 数组
- Bedrock 的 beta 头会通过此机制发送（而非 HTTP header）

### 8.8 请求追踪

每个请求注入 `x-client-request-id`，用于：
- 流式降级时关联原始流请求和降级请求
- 分析仪表盘中关联请求链
- 调试日志中的请求标识

---

## 十、Beta 头完整列表

`src/constants/betas.ts` 定义所有 beta 功能标识：

| Beta 头 | 用途 |
|---------|------|
| `claude-code-20250219` | CLI 基础标识（所有请求必带） |
| `interleaved-thinking-2025-05-14` | 交错思考 |
| `context-1m-2025-08-07` | 1M token 上下文 |
| `context-management-2025-06-27` | API 端上下文管理 |
| `advanced-tool-use-2025-11-20` | 高级工具使用（1P/Foundry 工具搜索） |
| `tool-search-tool-2025-10-19` | 工具搜索（Bedrock/Vertex） |
| `effort-2025-11-24` | 努力程度控制 |
| `task-budgets-2026-03-13` | API 端 token 预算 |
| `prompt-caching-scope-2026-01-05` | 全局 prompt 缓存范围 |
| `fast-mode-2026-02-01` | 快速模式 |
| `redact-thinking-2026-02-12` | 思考内容编辑 |
| `structured-outputs-2025-12-15` | 结构化 JSON 输出 |
| `advisor-tool-2026-03-01` | 服务端 advisor 工具 |
| `summarize-connector-text-2026-03-13` | Connector 文本摘要 |
| `afk-mode-2026-01-31` | 自动模式（离开键盘） |
| `cli-internal-2026-02-09` | 蚂蚁内部功能 |
| `token-efficient-tools-2026-03-28` | Token 高效工具 |

---

## 十一、关键文件索引

| 文件 | 职责 |
|------|------|
| `src/services/api/claude.ts` | **核心**：`queryModel()`、`paramsFromContext()`、流式/非流式请求、重试、降级 |
| `src/services/api/client.ts` | Anthropic 客户端工厂（多 Provider） |
| `src/constants/prompts.ts` | 系统提示词组装 (`getSystemPrompt()`) |
| `src/constants/system.ts` | CLI sysprompt 前缀 + attribution header |
| `src/constants/betas.ts` | Beta 头字符串常量 |
| `src/constants/systemPromptSections.ts` | 缓存/易变 section 管理 |
| `src/utils/api.ts` | `toolToAPISchema()`、`splitSysPromptPrefix()`、`buildSystemPromptBlocks()` |
| `src/utils/messages.ts` | 消息归一化、创建、修复 |
| `src/utils/thinking.ts` | 思考配置检测 |
| `src/utils/betas.ts` | Beta 头过滤/合并 |
| `src/utils/model/` | 模型选择、Provider、能力检测 |
| `src/utils/effort.ts` | Effort 参数解析 |
| `src/query/config.ts` | 查询配置快照 |
| `src/query/tokenBudget.ts` | 预算续写逻辑 |
| `src/query/stopHooks.ts` | 后置钩子 + 记忆提取触发 |
| `src/services/mcp/client.ts` | MCP 客户端（3,349 行） |
| `src/services/compact/` | 上下文压缩（15 个文件） |
| `src/memdir/` | 记忆系统 (MEMORY.md 加载、提取) |
| `src/services/extractMemories/` | 通过 forked agent 提取持久记忆 |
| `src/services/api/promptCacheBreakDetection.ts` | Prompt 缓存破坏检测 |
| `src/services/api/logging.ts` | API 请求/响应日志 |
| `src/services/api/errors.ts` | API 错误 → 消息映射 |
| `src/services/api/withRetry.ts` | 指数退避重试逻辑 |