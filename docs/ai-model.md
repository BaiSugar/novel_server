# AI 模型配置与调度功能文档

> 最后更新：2026-05-11
> 适用版本：v1
> 本文档不含代码，只描述数据模型、接口契约、策略规则与运维语义。

---

## 1. 目标与定位

本模块解决三件事：

1. 前端用户在创作页选择"要用哪个 AI 模型"，只关心 **展示属性** 与 **当前可用性**。
2. 管理员维护 **实际底层模型与访问账号**，并在前端暴露的 1/2/3 槽位之间自由换绑，**前端永远用固定的槽位 ID 调用**，不因后台调整而出现"模型 ID 变了"的前端改动。
3. 同一个前端模型可以挂多个访问账号，一个账号挂掉时自动切到下一个，**按模型维度** 选择 `顺序优先` 或 `均衡轮询` 两种故障转移策略。

---

## 2. 概念与术语

| 术语 | 含义 |
| --- | --- |
| **Model Slot（模型槽位）** | 前端唯一认得的"模型 ID"，固定为 `1 / 2 / 3`（可扩展）。管理员在后台把任意底层模型绑到某个槽位；前端用槽位 ID 调用，底层实现怎么换都跟前端无关。 |
| **Model Definition（模型定义）** | 后端实体，描述一个真实的 AI 模型（如 "deepseek-chat"、"gpt-4o-mini"）。包含模型标识、上下文窗口、温度、推理强度、最大输出、端点、额外参数等纯"模型本身"的属性。 |
| **Platform（平台）** | 一个外部服务商（如 `openai`、`deepseek`、`anthropic`、`azure-openai`）。平台决定协议兼容性与端点形态。 |
| **Provider Account（访问账号）** | 一条访问凭据：`(platform, baseUrl, apiKey, 额外头/参数)`。一个账号可承载同平台下的多个模型调用。 |
| **Binding（绑定）** | 槽位 ↔ 模型定义 ↔ 账号列表 的组合。每个槽位同一时刻只绑一个模型定义和一组候选账号。 |
| **Failover Strategy（故障转移策略）** | 账号级的调度策略，**按模型维度**设置，取值 `SEQUENTIAL` 或 `ROUND_ROBIN`。 |
| **Health（健康度）** | 单个 "平台+模型+账号" 组合的被动统计结果，只用于"顺序优先"策略的头部小窗口换头。 |

### 槽位与模型定义关系示意

```
前端                     后端
┌─────────┐           ┌────────────────────┐        ┌──────────────────────┐
│ slot=1  │ ──bind──► │ ModelDefinition    │ ──uses ►│ ProviderAccount  #1 │
│         │           │  identifier=       │        │  platform=openai    │
│         │           │  "gpt-4o-mini"     │        │  apiKey=sk-...      │
└─────────┘           │  ctxWindow=128k    │        └──────────────────────┘
                      │  maxOutput=4096    │        ┌──────────────────────┐
                      │  temperature=0.8   │ ──uses ►│ ProviderAccount  #2 │
                      │  effort=medium     │        │  platform=openai    │
                      └────────────────────┘        │  apiKey=sk-...      │
                                                    └──────────────────────┘
```

管理员把 slot=1 从 `gpt-4o-mini` 切到 `deepseek-chat` 时，前端继续发 `modelId: 1`，不感知切换。

---

## 3. 数据模型（后端实体）

以下实体使用 Prisma 表达意图；命名可按现有仓库风格微调。所有时间字段使用 `DateTime`，主键 `Int` 自增。

### 3.1 ModelSlot（模型槽位）

对外暴露的前端稳定 ID。槽位记录本身长期不删，只改绑定。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | Int (非自增，固定枚举 1/2/3...) | **前端可见的 modelId**。不由数据库生成，由管理员指定。 |
| `displayName` | VarChar(64) | 面向用户展示的名称（如"轻量版"、"创作旗舰"），可与实际底层模型名不同。 |
| `description` | VarChar(500) | 面向用户的简短描述。 |
| `tags` | JSON `string[]` | 徽标枚举：`hot` / `free` / `new` / `beta` ...（受控集合，见 §5.1）。 |
| `sortOrder` | Int | 列表排序值，升序。 |
| `enabled` | Boolean | 是否对前端可见。`false` 时接口不返回。 |
| `failoverStrategy` | Enum `SEQUENTIAL` / `ROUND_ROBIN` | 该槽位的账号调度策略。 |
| `defaultTemperature` | Decimal(3,2) \| null | 面向前端展示的"推荐温度"。为空时回退到绑定模型定义的值。 |
| `boundModelId` | Int → ModelDefinition.id \| null | 当前绑定的底层模型。null 表示未绑定，对前端视为"故障"。 |
| `createdAt` / `updatedAt` | DateTime | 自动时间戳。 |

> 说明：`id` 不自增是有意为之，这样 `1/2/3` 就是契约的一部分，管理员可以看着前端现有调用改绑定而不是改 id。

### 3.2 ModelDefinition（模型定义）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | Int (自增) | 主键，**仅后端使用**。 |
| `identifier` | VarChar(128) | 传给底层 API 的模型名，如 `gpt-4o-mini`、`deepseek-chat`、`claude-3-5-sonnet`。 |
| `displayName` | VarChar(128) | 管理端显示名。 |
| `platform` | VarChar(32) | 协议族：`openai` / `anthropic` / `deepseek` / `azure-openai` / `custom` 等。用于决定请求适配器。 |
| `endpoint` | VarChar(32) | 接口端点类型：`chat.completions` / `responses` / `messages` / `completions` 等，决定走哪套请求/响应映射。 |
| `contextWindow` | Int | 上下文窗口 token 数。 |
| `maxOutputTokens` | Int | 单次最大输出 token 数。 |
| `defaultTemperature` | Decimal(3,2) | 默认温度。 |
| `reasoningEffort` | Enum `NONE` / `LOW` / `MEDIUM` / `HIGH` | 推理强度；不支持的模型使用 `NONE`。 |
| `extraParams` | JSON | 额外参数（如 `top_p`、`frequency_penalty`、`reasoning.effort`、`response_format` 默认值等）。请求时与用户传入参数浅合并。 |
| `enabled` | Boolean | 该模型定义是否可被槽位绑定。 |
| `createdAt` / `updatedAt` | DateTime | 自动时间戳。 |

索引：`UNIQUE(platform, identifier)`。

### 3.3 ProviderAccount（访问账号）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | Int (自增) | 主键。 |
| `platform` | VarChar(32) | 与 `ModelDefinition.platform` 对齐。 |
| `label` | VarChar(64) | 管理端显示名（"OpenAI 主账号"、"代理线路 A"）。 |
| `baseUrl` | VarChar(255) | 接口基础地址，覆盖平台默认值。 |
| `apiKeyEncrypted` | Text | **对称加密后存储**，使用 `CHAPTER_ENCRYPTION_KEY` 同规格密钥或独立 `PROVIDER_KEY_SECRET`。查询默认不返回明文。 |
| `extraHeaders` | JSON \| null | 额外请求头（如 `OpenAI-Project`、`Anthropic-Version`）。 |
| `extraParams` | JSON \| null | 该账号强制附加的请求参数（组织/项目/路由 tag）。 |
| `priority` | Int | `SEQUENTIAL` 策略下的候选排序，升序优先；同值按 `id` 兜底。 |
| `weight` | Int | `ROUND_ROBIN` 预留权重；MVP 全部默认 `1` 即等权轮询。 |
| `enabled` | Boolean | 管理端手动启停。 |
| `createdAt` / `updatedAt` | DateTime | 自动时间戳。 |

### 3.4 ModelAccountBinding（模型↔账号 候选表）

记录"某个模型定义"可以用哪些账号，以及在**该模型下**的相对顺序。多对多。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | Int (自增) | 主键。 |
| `modelId` | Int → ModelDefinition.id | 级联删除。 |
| `accountId` | Int → ProviderAccount.id | 级联删除。 |
| `priority` | Int | 在当前模型下的候选顺序，独立于 `ProviderAccount.priority`。 |
| `enabled` | Boolean | 在当前模型下是否启用该账号（不启停账号本身）。 |
| `createdAt` / `updatedAt` | DateTime | 自动时间戳。 |

索引：`UNIQUE(modelId, accountId)`、`INDEX(modelId, priority)`。

### 3.5 ProviderAccountHealth（健康度统计，物化缓存）

被动统计结果。不是审计源，是调度器用的缓存，**可随时重建**。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | Int (自增) | 主键。 |
| `modelId` | Int → ModelDefinition.id | 健康度以 `(modelId, accountId)` 为粒度（同账号跑不同模型可能性能差异明显）。 |
| `accountId` | Int → ProviderAccount.id | |
| `windowSize` | Int | 统计滑窗样本数，默认 50。 |
| `successCount` | Int | 窗口内成功次数。 |
| `failureCount` | Int | 窗口内失败次数（不含 4xx 业务错误，只含可归因于账号的错误，见 §6.3）。 |
| `p95LatencyMs` | Int \| null | 窗口内 p95 延迟。 |
| `consecutiveFailures` | Int | 连续失败计数，用于熔断。 |
| `circuitOpenUntil` | DateTime \| null | 熔断截止时间，到点前视为不可用。 |
| `lastSuccessAt` | DateTime \| null | |
| `lastFailureAt` | DateTime \| null | |
| `lastErrorCode` | VarChar(64) \| null | 最近一次错误的归类码（`TIMEOUT` / `RATE_LIMIT` / `AUTH` / `UPSTREAM_5XX` / `NETWORK` / `QUOTA` ...）。 |
| `updatedAt` | DateTime | 自动时间戳。 |

索引：`UNIQUE(modelId, accountId)`。

### 3.6 关系图

```
ModelSlot ──(boundModelId)──► ModelDefinition ◄──┐
                                                  │ M:N via ModelAccountBinding
                                                  │
                                ProviderAccount ──┘
                                       ▲
                                       │ 1:1 per (modelId, accountId)
                                ProviderAccountHealth
```

---

## 4. 前端可见模型（面向创作页用户）

### 4.1 连通性聚合规则

后端不给前端暴露账号、Key、URL、参数细节。前端"连通性"三档由服务端基于槽位绑定的**全部可用候选账号**聚合：

| 档位 | 英文值 | 判定条件 |
| --- | --- | --- |
| 流畅 | `SMOOTH` | 至少一个候选账号 **未熔断** 且窗口成功率 ≥ 90% 且 p95 ≤ 阈值（默认 5s，可配置）。 |
| 拥堵 | `CONGESTED` | 有可用账号但不满足"流畅"条件：成功率 60%~90%、或 p95 超阈、或部分账号熔断。 |
| 故障 | `OUTAGE` | 槽位未绑定、绑定被禁用，或全部候选账号 **熔断或禁用**。 |

阈值以后台配置项承载（见 §9 环境变量）。

### 4.2 前端拿到的字段

前端 **永远** 不应看到 `apiKey`、`baseUrl`、`platform`、`identifier`、`extraHeaders`、`extraParams` 等任何后端字段。前端面向用户的模型条目结构如下：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | number | 槽位 ID，`1 / 2 / 3 ...`，**即前端 "模型 ID"**。 |
| `name` | string | 模型名称，来自 `ModelSlot.displayName`。 |
| `description` | string | 模型描述。 |
| `temperature` | number | 推荐温度（见 §4.3）。 |
| `tags` | string[] | 徽标，取自受控集合：`hot` / `free` / `new` / `beta`。 |
| `status` | `SMOOTH` \| `CONGESTED` \| `OUTAGE` | 连通性。 |

### 4.3 温度字段语义

- 若 `ModelSlot.defaultTemperature` 不为空，取槽位值；否则回退到 `ModelDefinition.defaultTemperature`。
- 前端可在调用 AI 生成接口时覆盖，但后端会按模型的 `extraParams` 做范围裁剪。
- 该字段纯为 UI 默认值，不代表真实下发值。

---

## 5. 前端 API（面向创作页用户）

> 路由前缀 `/v1/ai/models`，全部需要登录。响应信封遵循 `docs/api.md` 通用约定。

### 5.1 模型列表

```
GET /v1/ai/models
```

返回当前对普通用户可见的全部槽位。

**查询参数：** 无。

**响应：** `ApiEnvelope<AiModelPublicItem[]>`

```json
{
  "code": "SUCCESS",
  "data": [
    {
      "id": 1,
      "name": "轻量版",
      "description": "适合短篇脑洞、速写",
      "temperature": 0.7,
      "tags": ["free", "hot"],
      "status": "SMOOTH"
    },
    {
      "id": 2,
      "name": "创作旗舰",
      "description": "长篇叙事推荐",
      "temperature": 0.9,
      "tags": ["hot"],
      "status": "CONGESTED"
    },
    {
      "id": 3,
      "name": "推理增强",
      "description": "设定推演、大纲梳理",
      "temperature": 0.4,
      "tags": ["beta"],
      "status": "OUTAGE"
    }
  ]
}
```

**约定：**

- `status = OUTAGE` 的条目仍会返回，前端在 UI 上灰化即可；业务接口调用时会直接返回 `MODEL_UNAVAILABLE`。
- 列表顺序按 `ModelSlot.sortOrder` 升序，二级排序按 `id` 升序。
- `enabled=false` 的槽位不出现。

### 5.2 模型详情

```
GET /v1/ai/models/:id
```

**响应：** `ApiEnvelope<AiModelPublicItem>`。字段结构同 5.1。

**错误：** 槽位不存在或未启用时返回 `404 / NOT_FOUND`。

### 5.3 调用约定

其它 AI 能力接口（生成/续写/对话等，在别的模块定义）引用模型时：

- 请求体字段统一为 `modelId: number`，取值必须是 **槽位 ID**。
- 后端收到后按槽位查当前绑定的 `ModelDefinition` + 候选账号，按 §6 策略选 1 个账号执行。
- 槽位未绑定、禁用或全量熔断时，返回 `503 / MODEL_UNAVAILABLE`。
- 管理员在后台把槽位绑定的模型换掉后，**前端下次请求自动命中新模型，无需变更**。

---

## 6. 故障转移与调度策略

### 6.1 策略总览

每个 **模型定义** 通过其绑定的槽位 `failoverStrategy` 选择策略；同一个模型定义如果同时被多个槽位绑定，以槽位各自的策略执行（不共享）。

| 策略 | 枚举值 | 行为 |
| --- | --- | --- |
| 顺序优先 | `SEQUENTIAL` | 按 `ModelAccountBinding.priority` 升序形成候选列表；默认从头开始，允许在 **头部小窗口**（默认前 3 个）内按健康度轻微换头，后段严格按序。 |
| 均衡轮询 | `ROUND_ROBIN` | 在 `(platform, modelIdentifier)` 维度上维护一个游标，**严格按序** 遍历候选账号；默认不做健康度换头，仅跳过 `enabled=false` 与已熔断的账号。 |

### 6.2 `SEQUENTIAL` 详细规则

1. 列出模型在 `ModelAccountBinding.enabled=true` 且账号 `ProviderAccount.enabled=true` 的候选，按 `ModelAccountBinding.priority` 升序。
2. 过滤掉当前处于熔断窗口（`circuitOpenUntil > now`）的账号。
3. **头部换头窗口**：取前 `HEAD_WINDOW`（默认 3）个候选，按以下打分选头：
   - 基础分 = 成功率（0~1）
   - p95 延迟超过 `LATENCY_SOFT_LIMIT_MS`（默认 3000）时线性扣分
   - 连续失败 `consecutiveFailures ≥ 2` 时附加扣分
   - 分数差 `< 0.05` 时保持原顺序（减少抖动）
4. 头部窗口之后，严格按原顺序尝试。
5. 调用失败按 §6.3 更新健康度并继续下一个账号；全部失败返回 `503 / UPSTREAM_UNAVAILABLE`。

### 6.3 `ROUND_ROBIN` 详细规则

1. 调度键：`roundRobinKey = "{platform}:{modelIdentifier}"`。游标保存在 Redis（启用时）或进程内 Map。
2. 候选列表生成逻辑同 §6.2 步骤 1~2，但不做健康度打分。
3. 原子自增游标 `cursor`，选 `candidates[cursor % candidates.length]`。
4. 若该账号熔断或当次调用失败，**顺次尝试下一个**（`cursor+1`, `cursor+2` ...）直到耗尽；耗尽则返回 `503 / UPSTREAM_UNAVAILABLE`。下次请求游标仍从原值推进（保证长期均衡）。
5. 候选列表变动（增删/启停）时，后台事件推进游标对齐，**不重置为 0**，避免偏斜。

### 6.4 错误分类与健康度更新

每次实际调用结束后更新 `ProviderAccountHealth`。**只有"可归因于账号本身"的错误才计入失败**：

| 错误来源 | 归类码 | 是否计入失败 | 是否触发熔断 |
| --- | --- | --- | --- |
| 上游 401/403 鉴权失败 | `AUTH` | 是 | 3 次连续即熔断，默认 5 分钟 |
| 上游 429 限流 | `RATE_LIMIT` | 是 | 3 次连续即熔断，默认 60 秒 |
| 上游 5xx | `UPSTREAM_5XX` | 是 | 5 次连续即熔断，默认 60 秒 |
| TCP/DNS/握手/读超时 | `NETWORK` / `TIMEOUT` | 是 | 5 次连续即熔断，默认 30 秒 |
| 配额耗尽（如账单/月配额） | `QUOTA` | 是 | 立即熔断至次日或人工恢复 |
| 请求体校验失败（400） | `BAD_REQUEST` | **否** | 否（用户输入问题，不惩罚账号） |
| 用户被拒绝（4xx 业务） | `BUSINESS_4XX` | **否** | 否 |
| 成功 | `—` | — | 重置 `consecutiveFailures=0` |

成功/失败、延迟均纳入滑窗；`windowSize` 默认 50 个样本。

### 6.5 熔断恢复

- 到 `circuitOpenUntil` 后，第一次被调度中时视为"半开"：只放行一次试探请求。
- 成功则清零熔断并重置计数；失败则熔断窗口翻倍（上限 30 分钟）。
- 管理端接口可手动 `reset` 健康度（见 §7）。

---

## 7. 后台管理 API（面向管理员）

> 路由前缀 `/v1/admin/ai`，全部需要 `ADMIN` 角色与 `ai.model.manage` 权限。响应信封同通用约定。
>
> 权限映射需在 `app/common/permission.ts` 新增 `ai.model.manage`，仅 `ADMIN` 持有。
> 审计映射需在 `app/plugins/controller.plug.ts` `AUDIT_REGISTRY` 新增 `prefix: "/v1/admin/ai"`，`category: "system"`，方法映射 `POST=create / PUT=update / DELETE=delete / PATCH=update`。

### 7.1 模型槽位

| 路径 | 方法 | 说明 |
| --- | --- | --- |
| `/v1/admin/ai/slots` | GET | 列出全部槽位（包含 `enabled=false` 的）。 |
| `/v1/admin/ai/slots` | POST | 新建槽位；body 必须指定 `id`（如 `4`），用于前端后续引用。 |
| `/v1/admin/ai/slots/:id` | PUT | 修改槽位元信息（名称、描述、标签、排序、默认温度、启停、故障转移策略）。 |
| `/v1/admin/ai/slots/:id` | DELETE | 删除槽位；前端若仍在用该 ID 会拿到 `404`，需审慎。 |
| `/v1/admin/ai/slots/:id/bind` | PUT | 换绑底层模型：`{ modelId: number \| null }`。`null` 解绑。 |

**槽位请求体（POST / PUT 共用可选集）：**

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | number | POST 必填，PUT 忽略 | 前端可见的 modelId，正整数。 |
| `displayName` | string | POST 必填 | ≤64 字符。 |
| `description` | string | 否 | ≤500 字符。 |
| `tags` | string[] | 否 | 仅受控集合：`hot` / `free` / `new` / `beta`。 |
| `sortOrder` | number | 否 | 默认 0。 |
| `enabled` | boolean | 否 | 默认 true。 |
| `failoverStrategy` | `SEQUENTIAL` \| `ROUND_ROBIN` | 否 | 默认 `SEQUENTIAL`。 |
| `defaultTemperature` | number \| null | 否 | 0~2，两位小数。 |
| `boundModelId` | number \| null | 否 | 创建时即可绑定。 |

### 7.2 模型定义

| 路径 | 方法 | 说明 |
| --- | --- | --- |
| `/v1/admin/ai/models` | GET | 列表（分页 `page/pageSize`，支持 `platform`、`keyword` 过滤）。 |
| `/v1/admin/ai/models` | POST | 创建模型定义。 |
| `/v1/admin/ai/models/:id` | GET | 详情。 |
| `/v1/admin/ai/models/:id` | PUT | 更新。 |
| `/v1/admin/ai/models/:id` | DELETE | 删除；存在绑定关系时返回 `409 / CONFLICT`。 |

**请求体可选字段与 §3.2 字段表一致。**

### 7.3 访问账号

| 路径 | 方法 | 说明 |
| --- | --- | --- |
| `/v1/admin/ai/accounts` | GET | 列表（分页，支持 `platform`、`enabled` 过滤），**`apiKey` 字段只返回掩码 `sk-****xxxx`**。 |
| `/v1/admin/ai/accounts` | POST | 创建。`apiKey` 明文入参，服务端加密存储。 |
| `/v1/admin/ai/accounts/:id` | GET | 详情（仍然不返回 Key 明文）。 |
| `/v1/admin/ai/accounts/:id` | PUT | 更新；`apiKey` 传空字符串视为不改，传非空视为全量替换。 |
| `/v1/admin/ai/accounts/:id` | DELETE | 删除；使用中的账号返回 `409 / CONFLICT`，提示先解绑。 |

### 7.4 模型 ↔ 账号 绑定

| 路径 | 方法 | 说明 |
| --- | --- | --- |
| `/v1/admin/ai/models/:modelId/accounts` | GET | 列出该模型的候选账号（含优先级与启停）。 |
| `/v1/admin/ai/models/:modelId/accounts` | POST | 绑定账号：`{ accountId, priority?, enabled? }`。 |
| `/v1/admin/ai/models/:modelId/accounts/:accountId` | PUT | 调整 `priority` / `enabled`。 |
| `/v1/admin/ai/models/:modelId/accounts/:accountId` | DELETE | 解绑。 |
| `/v1/admin/ai/models/:modelId/accounts/reorder` | PUT | 批量重排：`{ orders: [{ accountId, priority }] }`。 |

### 7.5 健康度查询与操作

| 路径 | 方法 | 说明 |
| --- | --- | --- |
| `/v1/admin/ai/health` | GET | 查询健康度。参数 `modelId`、`accountId`、`platform` 组合过滤。 |
| `/v1/admin/ai/health/:modelId/:accountId/reset` | POST | 清零统计与熔断。 |
| `/v1/admin/ai/slots/:id/status` | GET | 查询该槽位的聚合连通性和候选账号明细（带错误码计数）。 |

### 7.6 试探调用（Admin Only）

```
POST /v1/admin/ai/slots/:id/ping
```

对指定槽位当前绑定发起一次最小化调用（固定 prompt、固定 max_output=16），返回真实的耗时、错误与命中账号。用于上线前验证和故障排查；**不会写入滑窗统计的"业务成功率"**，但触发熔断判定与半开恢复。

**响应：**

```json
{
  "code": "SUCCESS",
  "data": {
    "slotId": 1,
    "modelIdentifier": "gpt-4o-mini",
    "accountId": 12,
    "latencyMs": 842,
    "result": "SUCCESS",
    "errorCode": null
  }
}
```

---

## 8. 公共类型

### AiModelPublicItem（前端）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | number | 槽位 ID，对外即"模型 ID"。 |
| `name` | string | 模型名称。 |
| `description` | string | 描述。 |
| `temperature` | number | 推荐温度。 |
| `tags` | string[] | 受控标签集合。 |
| `status` | `SMOOTH` \| `CONGESTED` \| `OUTAGE` | 聚合连通性。 |

### AiModelSlotAdmin（后台）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | number | 槽位 ID。 |
| `displayName` | string | |
| `description` | string | |
| `tags` | string[] | |
| `sortOrder` | number | |
| `enabled` | boolean | |
| `failoverStrategy` | `SEQUENTIAL` \| `ROUND_ROBIN` | |
| `defaultTemperature` | number \| null | |
| `boundModel` | `ModelDefinitionAdmin` \| null | 绑定的底层模型详情（扁平返回）。 |
| `status` | `SMOOTH` \| `CONGESTED` \| `OUTAGE` | |
| `createdAt` / `updatedAt` | string | |

### ModelDefinitionAdmin（后台）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | number | |
| `identifier` | string | |
| `displayName` | string | |
| `platform` | string | |
| `endpoint` | string | |
| `contextWindow` | number | |
| `maxOutputTokens` | number | |
| `defaultTemperature` | number | |
| `reasoningEffort` | `NONE` \| `LOW` \| `MEDIUM` \| `HIGH` | |
| `extraParams` | object \| null | |
| `enabled` | boolean | |
| `createdAt` / `updatedAt` | string | |

### ProviderAccountAdmin（后台）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | number | |
| `platform` | string | |
| `label` | string | |
| `baseUrl` | string | |
| `apiKeyMasked` | string | 掩码形式，如 `sk-****abcd`。明文永不返回。 |
| `extraHeaders` | object \| null | |
| `extraParams` | object \| null | |
| `priority` | number | |
| `weight` | number | |
| `enabled` | boolean | |
| `createdAt` / `updatedAt` | string | |

### ModelAccountBindingAdmin（后台）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `modelId` | number | |
| `accountId` | number | |
| `priority` | number | 在当前模型下的顺序。 |
| `enabled` | boolean | |
| `account` | `ProviderAccountAdmin` | 扁平嵌入账号摘要。 |
| `health` | `ProviderAccountHealthAdmin` | 扁平嵌入健康度摘要。 |

### ProviderAccountHealthAdmin（后台）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `modelId` / `accountId` | number | |
| `successCount` / `failureCount` | number | |
| `p95LatencyMs` | number \| null | |
| `consecutiveFailures` | number | |
| `circuitOpenUntil` | string \| null | |
| `lastSuccessAt` / `lastFailureAt` | string \| null | |
| `lastErrorCode` | string \| null | |
| `updatedAt` | string | |

### 错误码扩展

| HTTP | code | 说明 |
| --- | --- | --- |
| 503 | `MODEL_UNAVAILABLE` | 槽位未绑定、被禁用或全量熔断；前端应提示切换模型。 |
| 503 | `UPSTREAM_UNAVAILABLE` | 调度器把候选账号全部试完仍失败。 |
| 409 | `CONFLICT` | 删除模型定义/账号时仍被其它实体引用。 |

---

## 9. 环境变量

新增以下环境变量，默认值写在对应 `config/` 模块中：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `AI_PROVIDER_KEY_SECRET` | — | Provider API Key 对称加密密钥（32 字节 hex/base64）。未配置时启动失败。 |
| `AI_HEALTH_WINDOW_SIZE` | 50 | 健康度滑窗样本数。 |
| `AI_LATENCY_SOFT_LIMIT_MS` | 3000 | 前端"流畅"判定的 p95 软阈值。 |
| `AI_LATENCY_HARD_LIMIT_MS` | 5000 | 前端"流畅"判定的 p95 硬阈值，超过即 `CONGESTED`。 |
| `AI_HEAD_WINDOW` | 3 | `SEQUENTIAL` 头部换头窗口大小。 |
| `AI_CIRCUIT_BASE_MS` | 60000 | 熔断初始窗口（ms），翻倍上限 30 分钟。 |
| `AI_RR_CURSOR_BACKEND` | `redis` | `ROUND_ROBIN` 游标存储：`redis` / `memory`。集群模式必须 `redis`。 |

---

## 10. 运维与注意事项

- **槽位 ID 是对外契约**：创建后不要重用已删除 ID；管理员修改绑定是常态，修改 ID 不是。
- **明文 API Key 只在入参与一次加密过程内出现**，任何响应、日志、审计都必须脱敏为 `sk-****abcd`。日志中间件需对 `/v1/admin/ai/accounts` 请求体做字段级脱敏。
- **健康度是缓存**：数据库重置不会导致业务中断，下一次调用会自然重建滑窗；Redis 游标同理。
- **集群下的游标**：`ROUND_ROBIN` 必须使用 Redis 原子自增，否则跨进程的严格轮询无法保证。
- **配置变更即时生效**：槽位绑定、账号启停、策略切换无需重启；调度器每次请求按最新数据库状态组装候选。
- **审计**：所有 `/v1/admin/ai/**` 的写操作按 §7 约定落 `system` 类别审计，含目标实体类型与 ID，**永不包含明文 Key**。
- **删除保护**：模型定义被任一槽位绑定、访问账号被任一模型绑定时，删除请求返回 `409`，提示先解绑。
- **观测入口**：`GET /v1/admin/ai/slots/:id/status` 是排障第一入口，能看到候选列表、每个账号最近的错误码与熔断窗口。
