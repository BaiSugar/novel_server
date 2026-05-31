# 后端 API 对接文档

> 最后更新：2026-05-24  
> 基础地址：`http://localhost:4000`（开发环境，由 `.env` PORT 配置）

---

## 通用约定

### 响应信封

成功（HTTP 2xx）：

```json
{
  "code": "SUCCESS",
  "message": "",
  "data": {},
  "requestId": "uuid"
}
```

失败（HTTP 4xx/5xx）：

```json
{
  "code": "UNAUTHORIZED",
  "message": "未登录",
  "requestId": "uuid",
  "details": {}
}
```

### 错误码

| HTTP | code               | 说明                                     |
| ---- | ------------------ | ---------------------------------------- |
| 400  | `INVALID_PARAMS`   | 参数不合法                               |
| 401  | `UNAUTHORIZED`     | 未登录或 token 无效                      |
| 403  | `FORBIDDEN`        | 无权限                                   |
| 404  | `NOT_FOUND`        | 资源不存在                               |
| 409  | `CONFLICT`         | 资源冲突                                 |
| 422  | `VALIDATION_ERROR` | 字段校验失败（`details` 含完整错误列表） |
| 499  | `CLIENT_DISCONNECTED` | SSE / 上游请求中断                 |
| 503  | `MODEL_UNAVAILABLE` | AI 模型槽位或 Provider 暂不可用      |
| 500  | `INTERNAL_ERROR`   | 服务端异常                               |

### 鉴权

需要登录的接口携带：

```http
Authorization: Bearer <accessToken>
```

- Access Token 有效期 15 分钟，过期后用 Refresh Token 刷新。
- Refresh Token 有效期 7 天，数据库只存 SHA-256 不可逆哈希。
- 刷新后旧 Refresh Token 立即失效，重复使用会撤销整个令牌族。

### 分页

| 参数       | 类型   | 默认 | 说明     |
| ---------- | ------ | ---- | -------- |
| `page`     | number | 1    | 页码     |
| `pageSize` | number | 20   | 每页条数 |

分页响应：`{ items: [], total: number, page: number, pageSize: number }`

---

## 1. 鉴权 API

> 路由前缀 `/v1/auth`，注册/登录/刷新无需鉴权。

### 1.1 注册

```
POST /v1/auth/register
```

**请求体：**

| 字段       | 类型   | 必填 | 说明                                      |
| ---------- | ------ | ---- | ----------------------------------------- |
| `username` | string | 是   | 3-64 位，仅支持字母、数字、下划线、连字符 |
| `email`    | string | 是   | 合法邮箱，最长 255 位                     |
| `password` | string | 是   | 8-128 位                                  |

```json
{
  "username": "testuser",
  "email": "test@example.com",
  "password": "12345678"
}
```

**响应：** `ApiEnvelope<{ user: SafeUser, tokens: AuthTokens }>`

```json
{
  "code": "SUCCESS",
  "message": "",
  "data": {
    "user": {
      "id": 1,
      "username": "testuser",
      "email": "test@example.com",
      "role": "AUTHOR",
      "status": "ACTIVE",
      "lastLoginAt": null,
      "createdAt": "2026-05-09T10:30:00.000Z",
      "updatedAt": "2026-05-09T10:30:00.000Z"
    },
    "tokens": {
      "accessToken": "eyJhbGci...",
      "refreshToken": "dGhpc0lz...",
      "expiresIn": 900
    }
  }
}
```

### 1.2 登录

```
POST /v1/auth/login
```

| 字段       | 类型   | 必填 | 说明               |
| ---------- | ------ | ---- | ------------------ |
| `account`  | string | 是   | 用户名或邮箱       |
| `password` | string | 是   | 明文密码，8-128 位 |

```json
{
  "account": "testuser",
  "password": "12345678"
}
```

**响应：** `ApiEnvelope<{ user: SafeUser, tokens: AuthTokens }>`，结构同注册。

### 1.3 刷新令牌

```
POST /v1/auth/refresh
```

| 字段           | 类型   | 必填 | 说明                          |
| -------------- | ------ | ---- | ----------------------------- |
| `refreshToken` | string | 是   | 当前 Refresh Token，32-256 位 |

```json
{
  "refreshToken": "dGhpc0lz..."
}
```

**响应：** `ApiEnvelope<{ user: SafeUser, tokens: AuthTokens }>`，返回全新令牌对。

### 1.4 登出

```
POST /v1/auth/logout
```

需要 `Authorization` 头。

| 字段           | 类型   | 必填 | 说明               |
| -------------- | ------ | ---- | ------------------ |
| `refreshToken` | string | 是   | 当前 Refresh Token |

**响应：** `ApiEnvelope<boolean>`

```json
{ "code": "SUCCESS", "message": "", "data": true }
```

### 1.5 当前用户

```
GET /v1/auth/me
```

需要 `Authorization` 头。

**响应：** `ApiEnvelope<SafeUser>`

```json
{
  "code": "SUCCESS",
  "data": {
    "id": 1,
    "username": "testuser",
    "email": "test@example.com",
    "role": "ADMIN",
    "status": "ACTIVE",
    "lastLoginAt": "2026-05-09T10:30:00.000Z",
    "createdAt": "2026-05-09T10:30:00.000Z",
    "updatedAt": "2026-05-09T10:30:00.000Z"
  }
}
```

---

## 2. 用户管理 API

> 路由前缀 `/v1/user`，全部需要登录。

### 2.1 用户列表

```
GET /v1/user/list
```

**查询参数：**

| 参数       | 类型   | 默认 | 说明     |
| ---------- | ------ | ---- | -------- |
| `page`     | number | 1    | 页码     |
| `pageSize` | number | 20   | 每页条数 |

**响应：** `ApiEnvelope<{ items: User[], total, page, pageSize }>`

```json
{
  "code": "SUCCESS",
  "data": {
    "items": [
      {
        "id": 1,
        "username": "admin",
        "email": "admin@test.com",
        "role": "ADMIN",
        "status": "ACTIVE",
        "createdAt": "2026-05-09T10:00:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 20
  }
}
```

### 2.2 用户详情

```
GET /v1/user/:id
```

| 参数  | 类型   | 说明    |
| ----- | ------ | ------- |
| `:id` | number | 用户 ID |

**响应：** `ApiEnvelope<UserDetail>`

```json
{
  "code": "SUCCESS",
  "data": {
    "id": 1,
    "username": "admin",
    "email": "admin@test.com",
    "role": "ADMIN",
    "status": "ACTIVE",
    "lastLoginAt": "2026-05-09T15:00:00.000Z",
    "createdAt": "2026-05-09T10:00:00.000Z",
    "updatedAt": "2026-05-09T15:00:00.000Z"
  }
}
```

### 2.3 编辑器 AI 快捷写作设置

```
GET /v1/user/preferences/editor-ai-quick-actions
PUT /v1/user/preferences/editor-ai-quick-actions
```

保存当前登录用户的作品编辑器 AI 快捷写作设置。响应仍沿用项目现有 `$g.success()` 信封，即 `code: "SUCCESS"`。

**响应 data：**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `version` | number | 当前契约版本，固定为 `4` |
| `bindings` | `{ actionId, key, enabled }[]` | 快捷键绑定状态 |
| `actionSettings` | `EditorAiQuickActionSetting[]` | 每个快捷动作的提示词与上下文设置 |
| `updatedAt` | string \| null | 最近保存时间，未保存过时为 `null` |

`actionId` 取值：`aiContinueInline` / `aiPlotAdvice` / `aiExpandSelection`。

`actionSettings` 字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `actionId` | string | 快捷动作 ID |
| `promptMode` | `default` \| `custom` | 提示词来源模式 |
| `promptCategoryId` | number \| null | 默认模式下选中的提示词分类 |
| `promptCategoryName` | string \| null | 分类显示名，仅用于前端回显 |
| `promptTemplateId` | number \| null | 默认模式下选中的提示词模板 |
| `promptTemplateLabel` | string \| null | 模板显示名，仅用于前端回显 |
| `customPrompt` | string | 自定义提示词，最长 1200 字符 |
| `contextMode` | `auto` \| `cursorWindow` \| `fullChapter` | 当前章节上下文策略 |
| `contextBeforeMaxLength` | number | 光标前上下文长度，范围 200-20000；保存时可省略，默认 4000 |
| `contextAfterMaxLength` | number | 光标后上下文长度，范围 200-20000；保存时可省略，默认 1200 |
| `chapterFullTextCount` | number | 章节设置：自动前文上下文中最近多少章使用正文，范围 0-20；更早章节优先用概要 |

`promptMode = "custom"` 保存时会清空 `promptCategoryId`、`promptCategoryName`、`promptTemplateId`、`promptTemplateLabel`。

GET 响应示例：

```json
{
  "code": "SUCCESS",
  "message": "",
  "data": {
    "version": 4,
    "bindings": [
      { "actionId": "aiContinueInline", "key": "Alt+1", "enabled": true },
      { "actionId": "aiPlotAdvice", "key": "Alt+2", "enabled": true },
      { "actionId": "aiExpandSelection", "key": "Alt+3", "enabled": true }
    ],
    "actionSettings": [
      {
        "actionId": "aiContinueInline",
        "promptMode": "default",
        "promptCategoryId": null,
        "promptCategoryName": null,
        "promptTemplateId": null,
        "promptTemplateLabel": null,
        "customPrompt": "",
        "contextMode": "auto",
        "contextBeforeMaxLength": 4000,
        "contextAfterMaxLength": 1200,
        "chapterFullTextCount": 3
      }
    ],
    "updatedAt": null
  }
}
```

PUT 请求体为 `data` 内除 `updatedAt` 外的配置对象；`contextBeforeMaxLength` / `contextAfterMaxLength` 保存时可省略，后端会按默认值归一化并在响应里返回完整配置。

---

## 3. 作品管理 API

> 路由前缀 `/v1/novel`，全部需要登录。所有操作验证作品归属权。

### 3.1 作品列表

```
GET /v1/novel/books
```

**查询参数：**

| 参数       | 类型    | 默认  | 说明                     |
| ---------- | ------- | ----- | ------------------------ |
| `page`     | number  | 1     | 页码                     |
| `pageSize` | number  | 20    | 每页条数                 |
| `archived` | boolean | false | 是否归档                 |
| `isTrash`  | number  | 0     | 是否回收站（0=否，1=是） |
| `keyword`  | string  | —     | 搜索关键词（匹配名称）   |

**响应：** `ApiEnvelope<{ items: Book[], total, page, pageSize }>`

```json
{
  "code": "SUCCESS",
  "data": {
    "items": [
      {
        "id": 1,
        "userId": 1,
        "name": "阵纹纪元",
        "description": "被驱逐的阵修少年...",
        "type": "NOVEL",
        "totalWords": 0,
        "order": 0,
        "archived": false,
        "isTrash": false,
        "createdAt": "2026-05-09T18:00:00.000Z",
        "updatedAt": "2026-05-09T18:00:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 20
  }
}
```

### 3.2 作品详情

```
GET /v1/novel/books/:id
```

| 参数  | 类型   | 说明    |
| ----- | ------ | ------- |
| `:id` | number | 作品 ID |

**响应：** `ApiEnvelope<Book>`

### 3.3 创建作品

```
POST /v1/novel/books
```

| 字段          | 类型   | 必填 | 说明                                            |
| ------------- | ------ | ---- | ----------------------------------------------- |
| `name`        | string | 是   | 作品名称，1-255 位                              |
| `description` | string | 否   | 作品简介                                        |
| `type`        | string | 否   | 作品类型：`"NOVEL"`（小说）、`"SCRIPT"`（剧本） |

```json
{
  "name": "阵纹纪元",
  "description": "被驱逐的阵修少年，在边境废城发现失落古阵。",
  "type": "NOVEL"
}
```

**响应：** `ApiEnvelope<Book>`，message 为 "创建成功"。

### 3.4 更新作品

```
PUT /v1/novel/books/:id
```

| 字段          | 类型   | 必填 | 说明                              |
| ------------- | ------ | ---- | --------------------------------- |
| `name`        | string | 否   | 作品名称，1-255 位                |
| `description` | string | 否   | 作品简介                          |
| `type`        | string | 否   | 作品类型：`"NOVEL"` \| `"SCRIPT"` |

**响应：** `ApiEnvelope<Book>`，message 为 "更新成功"。

### 3.5 归档/取消归档

```
PUT /v1/novel/books/:id/archive
```

| 字段       | 类型    | 必填 | 说明     |
| ---------- | ------- | ---- | -------- |
| `archived` | boolean | 是   | 是否归档 |

**响应：** `ApiEnvelope<Book>`

### 3.6 移入回收站（软删除）

```
DELETE /v1/novel/books/:id
```

**响应：** `ApiEnvelope<null>`，message 为 "已移入回收站"。

> 软删除后作品 `isTrash` 变为 `true`，可通过恢复接口还原。

### 3.7 恢复回收站作品

```
POST /v1/novel/books/:id/restore
```

**响应：** `ApiEnvelope<Book>`，message 为 "已恢复"。

### 3.8 永久删除

```
DELETE /v1/novel/books/:id/permanent
```

> 仅可对回收站中的作品执行。会级联删除所有章节。

**响应：** `ApiEnvelope<null>`，message 为 "已永久删除"。

---

## 4. 章节管理 API

> 路由前缀 `/v1/novel`，全部需要登录。
>
> `content` 在 API 中始终是明文字符串；后端落库前会压缩并加密为二进制内容。

### 4.1 章节列表

```
GET /v1/novel/books/:bookId/chapters
```

| 参数      | 类型   | 说明    |
| --------- | ------ | ------- |
| `:bookId` | number | 作品 ID |

**响应：** `ApiEnvelope<ChapterListItem[]>`（列表不含正文，正文通过详情接口按需加载）

```json
{
  "code": "SUCCESS",
  "data": [
    {
      "id": 1,
      "bookId": 1,
      "title": "废城觉醒",
      "order": 0,
      "wordCount": 1024,
      "createdAt": "2026-05-09T18:30:00.000Z",
      "updatedAt": "2026-05-09T18:30:00.000Z"
    }
  ]
}
```

### 4.2 章节详情

```
GET /v1/novel/chapters/:id
```

| 参数  | 类型   | 说明    |
| ----- | ------ | ------- |
| `:id` | number | 章节 ID |

**响应：** `ApiEnvelope<Chapter>`

### 4.3 创建章节

```
POST /v1/novel/books/:bookId/chapters
```

| 字段      | 类型   | 必填 | 说明               |
| --------- | ------ | ---- | ------------------ |
| `title`   | string | 是   | 章节标题，1-500 位 |
| `content` | string | 否   | 章节正文           |

请求路径参数 `:bookId` 指定所属作品。

**响应：** `ApiEnvelope<Chapter>`，message 为 "创建成功"。

> 创建后自动更新作品的 `totalWords` 字数统计。

### 4.4 更新章节

```
PUT /v1/novel/chapters/:id
```

| 字段      | 类型   | 必填 | 说明               |
| --------- | ------ | ---- | ------------------ |
| `title`   | string | 否   | 章节标题，1-500 位 |
| `content` | string | 否   | 章节正文           |

**响应：** `ApiEnvelope<Chapter>`，message 为 "更新成功"。

> 更新正文后自动重算字数并更新作品的 `totalWords`。

### 4.5 删除章节

```
DELETE /v1/novel/chapters/:id
```

**响应：** `ApiEnvelope<null>`，message 为 "删除成功"。

> 删除后自动更新作品的 `totalWords` 字数统计。

### 4.6 章节排序

```
PUT /v1/novel/books/:bookId/chapters/reorder
```

| 字段  | 类型     | 必填 | 说明                       |
| ----- | -------- | ---- | -------------------------- |
| `ids` | number[] | 是   | 按新顺序排列的章节 ID 列表 |

```json
{
  "ids": [3, 1, 2]
}
```

**响应：** `ApiEnvelope<null>`，message 为 "排序成功"。

---

## 公共类型

### SafeUser

| 字段          | 类型                                    | 说明         |
| ------------- | --------------------------------------- | ------------ |
| `id`          | number                                  | 用户 ID      |
| `username`    | string                                  | 用户名       |
| `email`       | string                                  | 邮箱         |
| `role`        | `"ADMIN"` \| `"AUTHOR"`                 | 角色         |
| `status`      | `"ACTIVE"` \| `"BANNED"` \| `"DELETED"` | 状态         |
| `lastLoginAt` | string \| null                          | 最后登录时间 |
| `createdAt`   | string                                  | 创建时间     |
| `updatedAt`   | string                                  | 更新时间     |

### AuthTokens

| 字段           | 类型   | 说明                               |
| -------------- | ------ | ---------------------------------- |
| `accessToken`  | string | JWT Access Token                   |
| `refreshToken` | string | Refresh Token 明文（仅签发时返回） |
| `expiresIn`    | number | Access Token 有效秒数（默认 900）  |

### Book

| 字段          | 类型                            | 说明                 |
| ------------- | ------------------------------- | -------------------- |
| `id`          | number                          | 作品 ID              |
| `userId`      | number                          | 作者用户 ID          |
| `name`        | string                          | 作品名称             |
| `description` | string \| null                  | 作品简介             |
| `type`        | `"NOVEL"` \| `"SCRIPT"` \| null | 作品类型             |
| `totalWords`  | number                          | 累计字数（自动统计） |
| `order`       | number                          | 排序序号             |
| `archived`    | boolean                         | 是否归档             |
| `isTrash`     | boolean                         | 是否回收站           |
| `createdAt`   | string                          | 创建时间             |
| `updatedAt`   | string                          | 更新时间             |

### Chapter

| 字段        | 类型           | 说明        |
| ----------- | -------------- | ----------- |
| `id`        | number         | 章节 ID     |
| `bookId`    | number         | 所属作品 ID |
| `title`     | string         | 章节标题    |
| `content`   | string \| null | 章节正文（API 明文，数据库压缩加密保存） |
| `order`     | number         | 排序序号    |
| `wordCount` | number         | 字数        |
| `createdAt` | string         | 创建时间    |
| `updatedAt` | string         | 更新时间    |

---

## 5. 提示词 API

> 路由前缀 `/v1/prompts`，全部需要登录。
>
> 提示词模板支持变量占位，配合预制输入选项为用户提供便捷的预设表单。
> 更新提示词时自动创建历史版本快照，支持版本回溯。

### 5.1 提示词列表

```
GET /v1/prompts
```

| 参数       | 类型                                                | 说明                |
| ---------- | --------------------------------------------------- | ------------------- |
| `page`     | number                                              | 页码，默认 1        |
| `pageSize` | number                                              | 每页条数，默认 20   |
| `privacy`  | `PRIVATE` \| `SHARED` \| `AUTHORIZED`               | 按隐私设置筛选      |
| `approved` | boolean                                             | 按审核状态筛选      |
| `keyword`    | string                                              | 按名称/介绍模糊搜索 |
| `categoryId` | number                                              | 按提示词分类筛选；不传或 0 表示全部 |

**响应：** `ApiEnvelope<PaginatedList<PromptTemplateListItem>>`

```json
{
  "code": "SUCCESS",
  "data": {
    "items": [
      {
        "id": 1,
        "userId": 1,
        "name": "奇幻开篇生成器",
        "description": "适合西幻世界观的开篇提示词",
        "privacy": "SHARED",
        "categoryId": 1,
        "category": "脑洞生成器",
        "usageGuide": "填入世界观关键词后直接生成",
        "isApproved": true,
        "versionCount": 3,
        "createdAt": "2026-05-10T10:00:00.000Z",
        "updatedAt": "2026-05-10T12:00:00.000Z"
      }
    ],
    "total": 42,
    "page": 1,
    "pageSize": 20
  }
}
```

### 5.2 提示词详情

```
GET /v1/prompts/:id
```

| 参数    | 类型   | 说明       |
| ------- | ------ | ---------- |
| `:id`   | number | 提示词 ID  |

> 作者本人进入编辑页或查看历史版本时返回 `content`；非作者本人查看时，`content` 字段不返回（`presetOptions` 用于前端渲染输入表单，始终返回）。生成交互、消息记录、任务响应和 AI 工具结果不返回提示词正文。

**响应：** `ApiEnvelope<PromptTemplate>`

```json
{
  "code": "SUCCESS",
  "data": {
    "id": 1,
    "userId": 1,
    "name": "奇幻开篇生成器",
    "content": "你是一位奇幻小说家。请根据以下设定生成小说开篇：\n世界观：{{worldSetting}}\n主角：{{protagonist}}\n字数：{{wordCount}}",
    "presetOptions": [
      {
        "key": "worldSetting",
        "label": "世界观",
        "type": "textarea",
        "placeholder": "请描述世界观背景",
        "required": true,
        "defaultValue": null
      },
      {
        "key": "protagonist",
        "label": "主角类型",
        "type": "select",
        "options": ["落魄贵族", "流浪佣兵", "学院新生", "隐居强者"],
        "placeholder": null,
        "required": true,
        "defaultValue": "落魄贵族"
      },
      {
        "key": "wordCount",
        "label": "生成字数",
        "type": "text",
        "placeholder": "如 2000",
        "required": false,
        "defaultValue": "2000"
      }
    ],
    "description": "适合西幻世界观的开篇提示词，内置多种主角模板",
    "privacy": "SHARED",
    "usageGuide": "填入世界观关键词后直接生成",
    "isApproved": true,
    "versionCount": 3,
    "createdAt": "2026-05-10T10:00:00.000Z",
    "updatedAt": "2026-05-10T12:00:00.000Z"
  }
}
```

### 5.3 创建提示词

```
POST /v1/prompts
```

**请求体：**

| 字段            | 类型                                                | 必填 | 说明                          |
| --------------- | --------------------------------------------------- | ---- | ----------------------------- |
| `name`          | string                                              | 是   | 提示词名称，≤255 字符         |
| `content`       | string                                              | 是   | 提示词正文，支持 {{变量}} 占位 |
| `presetOptions` | PresetOption[]                                       | 否   | 预制输入选项                  |
| `description`   | string                                              | 否   | 提示词介绍                    |
| `privacy`       | `PRIVATE` \| `SHARED` \| `AUTHORIZED`               | 是   | 隐私设置                      |
| `usageGuide`    | string                                              | 否   | 使用方法（简短说明）          |
| `categoryId`    | number \| null                                      | 否   | 所属提示词分类 ID；null 表示未分类 |

**响应：** `ApiEnvelope<PromptTemplate>`

### 5.4 更新提示词

```
PUT /v1/prompts/:id
```

**请求体：** 同 5.3，全部字段可选。更新后自动创建一条历史版本快照。

**响应：** `ApiEnvelope<PromptTemplate>`

### 5.5 删除提示词

```
DELETE /v1/prompts/:id
```

### 5.6 审核提示词

> 需要 `prompt.approve` 权限（管理员）。

```
PUT /v1/prompts/:id/approve
```

**请求体：**

| 字段       | 类型    | 必填 | 说明                       |
| ---------- | ------- | ---- | -------------------------- |
| `approved` | boolean | 是   | `true` 通过 / `false` 驳回 |

**响应：** `ApiEnvelope<PromptTemplate>`

### 5.7 历史版本列表

```
GET /v1/prompts/:id/versions
```

**响应：** `ApiEnvelope<PromptTemplateVersion[]>`

```json
{
  "code": "SUCCESS",
  "data": [
    {
      "id": 10,
      "version": 3,
      "name": "奇幻开篇生成器",
      "description": "适合西幻世界观的开篇提示词",
      "usageGuide": "填入世界观关键词后直接生成",
      "changeNote": "新增魔法体系选项",
      "createdAt": "2026-05-10T12:00:00.000Z"
    },
    {
      "id": 7,
      "version": 2,
      "name": "奇幻开篇生成器",
      "description": "西幻开篇提示词初版",
      "usageGuide": null,
      "changeNote": "调整主角模板选项",
      "createdAt": "2026-05-10T11:00:00.000Z"
    }
  ]
}
```

### 5.8 历史版本详情

```
GET /v1/prompts/:id/versions/:versionId
```

**响应：** 包含该版本快照的全部字段：`name`、`content`、`presetOptions`、`description`、`usageGuide`、`changeNote`、`createdAt`。前端可按需选择导入字段。

### 5.9 恢复历史版本

```
POST /v1/prompts/:id/versions/:versionId/restore
```

以指定版本的内容覆盖当前提示词，同时生成一条新的版本快照（记录恢复来源）。

**响应：** `ApiEnvelope<PromptTemplate>`

### 5.10 提示词分类列表

```
GET /v1/prompts/categories
```

> 提示词分类是全站唯一的分类来源，提示词广场与创意工具箱都复用这同一份数据。

**响应：** `ApiEnvelope<CategoryItem[]>`

```json
{
  "code": "SUCCESS",
  "data": [
    { "id": 1, "name": "脑洞生成器", "promptCount": 12 },
    { "id": 2, "name": "书名生成器", "promptCount": 8 }
  ]
}
```

### 5.11 创建提示词分类

> 需要 `prompt.category.manage` 权限（管理员）。

```
POST /v1/prompts/categories
```

**请求体：**

| 字段    | 类型   | 必填 | 说明                   |
| ------- | ------ | ---- | ---------------------- |
| `name`  | string | 是   | 分类显示名，≤64 字符   |
| `order` | number | 否   | 排序序号，默认 0       |

**响应：** `ApiEnvelope<CategoryItem>`

### 5.12 更新提示词分类

> 需要 `prompt.category.manage` 权限（管理员）。

```
PUT /v1/prompts/categories/:categoryId
```

**请求体：** 同 5.11，全部字段可选。

**响应：** `ApiEnvelope<CategoryItem>`

### 5.13 删除提示词分类

> 需要 `prompt.category.manage` 权限（管理员）。删除后，引用该分类的提示词与创意工具的 `categoryId` 会被置空。

```
DELETE /v1/prompts/categories/:categoryId
```

**响应：** `ApiEnvelope<boolean>`

### 5.14 提示词收藏列表

```
GET /v1/prompts/favorites?page=1&pageSize=20
```

查询参数：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `page` | 否 | 页码，默认 1 |
| `pageSize` | 否 | 每页数量，默认 20 |

响应示例：

```json
{
  "code": "SUCCESS",
  "data": {
    "items": [
      {
        "id": 7,
        "name": "初稿速写",
        "description": "适合网文快速开篇",
        "usageGuide": "选择主题后回车即可",
        "userId": 1,
        "authorName": "admin",
        "categoryId": 1,
        "categoryName": "写作",
        "favoritedAt": "2026-05-24T00:00:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 20
  }
}
```

说明：按收藏时间逆序排列；已删除的提示词不会出现在列表中。

### 5.15 收藏提示词

```
PUT /v1/prompts/favorites/:promptTemplateId
```

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `:promptTemplateId` | number | 是 | 提示词模板 ID |

说明：重复调用幂等，不会报错。

### 5.16 取消收藏提示词

```
DELETE /v1/prompts/favorites/:promptTemplateId
```

说明：重复调用幂等，不会报错。

---

## 6. 创意工具 API

> 路由前缀 `/v1/creative-tools`，全部需要登录。
>
> 创意工具箱不再维护独立分类，直接复用提示词分类：
> `GET /v1/prompts/categories`。

### 6.1 创意工具列表

```
GET /v1/creative-tools
```

**查询参数：**

| 参数        | 类型   | 说明                                |
| ----------- | ------ | ----------------------------------- |
| `categoryId` | number | 按提示词分类筛选；不传或 0 表示全部 |

**响应：** `ApiEnvelope<CreativeToolApiItem[]>`

```json
{
  "code": "SUCCESS",
  "data": [
    {
      "id": 1,
      "name": "脑洞生成器",
      "description": "脑洞生成器工具",
      "icon": "SPARKLES",
      "categoryId": 1,
      "category": "脑洞生成器",
      "isNew": false
    }
  ]
}
```

### 6.2 创建创意工具

```
POST /v1/creative-tools
```

**请求体：**

| 字段         | 类型            | 必填 | 说明                     |
| ------------ | --------------- | ---- | ------------------------ |
| `name`       | string          | 是   | 工具名称，≤128 字符      |
| `description`| string          | 是   | 工具描述，≤500 字符      |
| `icon`       | CreativeToolIcon | 是   | 工具图标                 |
| `categoryId` | number \| null  | 否   | 所属提示词分类 ID        |
| `isNew`      | boolean         | 否   | 是否显示 NEW 角标        |
| `order`      | number          | 否   | 排序序号                 |

**响应：** `ApiEnvelope<CreativeToolApiItem>`

### 6.3 更新创意工具

```
PUT /v1/creative-tools/:id
```

**请求体：** 同 6.2，全部字段可选。

**响应：** `ApiEnvelope<CreativeToolApiItem>`

### 6.4 删除创意工具

```
DELETE /v1/creative-tools/:id
```

**响应：** `ApiEnvelope<boolean>`

---

## 6.5 上下文素材库 API

> 路由前缀 `/v1/context-library`，需要 `context_library.manage` 权限；`GET /sources` 仅需登录。角色库和词条库都复用统一上下文素材模型，前端不向生成接口传素材类型，只在生成时提交选中的 `contextItemIds`。

### 6.5.1 来源列表

```
GET /v1/context-library/sources
```

返回启用的素材来源，目前包含：

| key | name | 说明 |
| --- | --- | --- |
| `character` | 角色库 | 姓名、性别、角色性格、角色设定与背景、外貌 |
| `glossary` | 词条库 | 词条名称、词条释义 |
| `memo` | 备忘录 | 标题、内容、作用域；建议使用 `/v1/memos` 管理全局/作品备忘录 |

### 6.5.2 文件夹树

```
GET /v1/context-library/folders?novelId=1&sourceKey=character
```

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `novelId` | number | 是 | 作品 ID |
| `sourceKey` | `character` \| `glossary` | 是 | 来源键 |

### 6.5.3 创建文件夹

```
POST /v1/context-library/folders
```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `novelId` | number | 是 | 作品 ID |
| `sourceKey` | string | 是 | `character` 或 `glossary` |
| `name` | string | 是 | 文件夹名称 |
| `parentId` | number \| null | 否 | 父文件夹 ID |
| `sortOrder` | number | 否 | 同级排序 |

### 6.5.4 更新、移动、删除文件夹

```
PUT /v1/context-library/folders/:id
PUT /v1/context-library/folders/:id/move
DELETE /v1/context-library/folders/:id
```

删除文件夹为软删除；子文件夹和素材会移动到被删文件夹的上级。

### 6.5.5 素材列表

```
GET /v1/context-library/items?novelId=1&sourceKey=character&folderId=1&keyword=主角
```

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `novelId` | number | 作品 ID，必填 |
| `sourceKey` | string | `character` / `glossary`，不传则查该作品全部上下文库素材 |
| `folderId` | number | 文件夹 ID |
| `keyword` | string | 匹配标题或摘要 |
| `page` / `pageSize` | number | 分页 |

### 6.5.6 创建素材

```
POST /v1/context-library/items
```

角色库请求体：

```json
{
  "novelId": 1,
  "sourceKey": "character",
  "folderId": 1,
  "data": {
    "name": "沈青崖",
    "gender": "男",
    "personality": "冷静克制，重诺守信",
    "background": "边城孤儿，被剑宗长老收养。",
    "appearance": "黑发灰眼，常穿旧青衫。"
  }
}
```

词条库请求体：

```json
{
  "novelId": 1,
  "sourceKey": "glossary",
  "folderId": 2,
  "data": {
    "name": "归墟海",
    "definition": "世界尽头的黑潮海域，吞噬灵气与记忆。"
  }
}
```

后端会根据 `sourceKey` 校验字段，并生成 `renderedText` 供 AI 上下文使用；不信任前端提交最终上下文文本。

### 6.5.7 素材详情、更新、删除

```
GET /v1/context-library/items/:id?novelId=1
PUT /v1/context-library/items/:id?novelId=1
DELETE /v1/context-library/items/:id?novelId=1
```

更新素材时传 `data` 会重新生成 `title`、`summary`、`renderedText`。

### 6.5.8 AI 上下文选择

返回当前作品（或章节）素材库内可选的上下文素材。选择状态按 `chapterId` 隔离，不传即作品级。

查询候选素材：

```
GET /v1/ai/context-items?novelId=1&sourceKey=character&folderId=1
GET /v1/ai/context-items?novelId=1&sourceKey=memo&chapterId=3
```

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `novelId` | number | 作品 ID，必填 |
| `sourceKey` | string | 不传返回全部来源 |
| `folderId` | number | 文件夹筛选 |
| `keyword` | string | 搜索标题或摘要 |
| `chapterId` | number | 章节 ID；传入后仅返回关联该章节的素材 |

获取上次保存的勾选状态：

```
GET /v1/ai/context-items/selection-state?novelId=1
GET /v1/ai/context-items/selection-state?novelId=1&chapterId=3
```

保存某个来源的勾选状态：

```
PUT /v1/ai/context-items/selection-state
```

```json
{
  "novelId": 1,
  "chapterId": 3,
  "sourceKey": "memo",
  "contextItemIds": [5, 6]
}
```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `novelId` | number | 是 | 作品 ID |
| `chapterId` | number | 否 | 章节 ID；不传为作品级 |
| `sourceKey` | string | 是 | `character` / `glossary` / `memo` |
| `contextItemIds` | number[] | 否 | 选中素材 ID；传 `[]` 清空 |

生成接口仍只提交：

```json
{
  "metadata": { "novelId": 1 },
  "contextItemIds": [101, 205]
}
```

`metadata.novelId` 只用于归属和绑定校验，不自动注入作品内容。全局备忘录会在任意作品的上下文候选中出现；作品备忘录只在对应作品中出现。

## 7. 备忘录 API

> 路由前缀 `/v1/memos`，需要 `context_library.manage` 权限。备忘录属于素材库；被 AI 上下文选择关联后，会随 `contextItemIds` 注入生成上下文。

### 7.1 作用域

| scope | 说明 |
| --- | --- |
| `GLOBAL` | 全局备忘录，不绑定作品；在任意作品的上下文候选中可见 |
| `NOVEL` | 作品备忘录，必须绑定 `novelId`；只在对应作品中可见 |

### 7.2 文件夹树

```
GET /v1/memos/folders?scope=GLOBAL
GET /v1/memos/folders?scope=NOVEL&novelId=1
```

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `scope` | `GLOBAL` \| `NOVEL` | 是 | 文件夹作用域 |
| `novelId` | number | `NOVEL` 必填 | 作品 ID |

### 7.3 创建文件夹

```
POST /v1/memos/folders
```

```json
{
  "scope": "NOVEL",
  "novelId": 1,
  "parentId": null,
  "name": "伏笔",
  "sortOrder": 0
}
```

### 7.4 更新、移动、删除文件夹

```
PUT /v1/memos/folders/:id
PUT /v1/memos/folders/:id/move
DELETE /v1/memos/folders/:id
```

删除文件夹为软删除；子文件夹和备忘录会移动到被删文件夹的上级。

### 7.5 备忘录列表

```
GET /v1/memos?scope=GLOBAL&keyword=主线
GET /v1/memos?scope=NOVEL&novelId=1&folderId=2
```

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `scope` | `GLOBAL` \| `NOVEL` | 不传则查询当前用户全部备忘录 |
| `novelId` | number | 查询作品备忘录时传入 |
| `folderId` | number | 文件夹 ID |
| `keyword` | string | 匹配标题、摘要或正文 |
| `page` / `pageSize` | number | 分页 |

### 7.6 创建备忘录

```
POST /v1/memos
```

全局备忘录：

```json
{
  "scope": "GLOBAL",
  "folderId": null,
  "title": "通用风格",
  "content": ""
}
```

作品备忘录：

```json
{
  "scope": "NOVEL",
  "novelId": 1,
  "folderId": 2,
  "title": "第三卷伏笔",
  "content": "玉佩裂纹对应旧王朝血脉。"
}
```

说明：`content` 允许为空字符串，便于前端先创建空白备忘录；最大 20000 字符。

### 7.7 备忘录详情、更新、删除

```
GET /v1/memos/:id
PUT /v1/memos/:id
DELETE /v1/memos/:id
```

更新 `title` 或 `content` 会重新生成供 AI 使用的 `renderedText`。

---

## 8. AI 系统 API

> 路由涉及三个前缀：`/v1/ai/models`（前端模型）、`/v1/ai/conversations`（会话与消息）、`/v1/ai/generation`（文本生成 SSE）、`/v1/ai/images`（图片生成），全部需要登录。
> 管理端路由前缀 `/v1/admin/ai`，需要 `ADMIN` 角色与 `ai.model.manage` 权限。

### 7.1 前端模型

> 路由前缀 `/v1/ai/models`，全部需要登录。模型槽位返回面向前端的展示字段，不包含 `apiKey`、`baseUrl`、`provider account` 等后端敏感配置。

#### 7.1.1 模型列表

```
GET /v1/ai/models
```

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
    }
  ]
}
```

`status` 取值：`SMOOTH`（流畅）/ `CONGESTED`（拥堵）/ `OUTAGE`（故障）。`OUTAGE` 的条目仍会返回，前端灰化即可。
`enabled=false` 的槽位不出现；列表按 `sortOrder` 升序，二级按 `id` 升序。

#### 7.1.2 模型详情

```
GET /v1/ai/models/:id
```

| 参数  | 类型   | 说明    |
| ----- | ------ | ------- |
| `:id` | number | 槽位 ID |

**响应：** `ApiEnvelope<AiModelPublicItem>`，结构同 7.1.1。

**错误：** 槽位不存在或未启用时返回 `404 / NOT_FOUND`。

---

### 7.2 会话管理

> 路由前缀 `/v1/ai/conversations`，需要 `ai.conversation.manage` 权限。service 层统一校验 `conversationId` 归属当前用户。

#### 7.2.1 创建会话

```
POST /v1/ai/conversations
```

**请求体：**

| 字段           | 类型                   | 必填 | 说明                                                 |
| -------------- | ---------------------- | ---- | ---------------------------------------------------- |
| `title`        | string                 | 否   | 会话标题，≤128 字符；不传时由首条用户消息前 32 字派生 |
| `mode`         | `STANDARD` \| `AGENT`  | 否   | 会话默认模式，默认 `STANDARD`                        |
| `modelId`      | number                 | 是   | 槽位 ID，必须存在且 `enabled=true`                    |
| `systemPrompt` | string \| null         | 否   | 会话级系统提示词，≤8000 字符                         |
| `metadata`     | object \| null         | 否   | 仅允许白名单键：`novelId` / `chapterId` / `promptTemplateId` / `scene` |

```json
{
  "title": "新对话",
  "mode": "AGENT",
  "modelId": 1,
  "systemPrompt": null,
  "metadata": { "novelId": 1 }
}
```

**响应：** `ApiEnvelope<AiConversationItem>`，`message` 为 "创建成功"。

**错误：** `404 / NOT_FOUND`（槽位不存在或未启用）、`422 / VALIDATION_ERROR`。

#### 7.2.2 会话列表

```
GET /v1/ai/conversations
```

**查询参数：**

| 参数        | 类型               | 默认     | 说明                                |
| ----------- | ------------------ | -------- | ----------------------------------- |
| `page`      | number             | 1        | 页码                                |
| `pageSize`  | number             | 20       | 每页条数                            |
| `status`    | `ACTIVE` \| `ARCHIVED` | —    | 按状态过滤；不传返回全部非 DELETED  |
| `novelId`   | number             | —        | 按 `metadata.novelId` 精确匹配      |
| `chapterId` | number             | —        | 按 `metadata.chapterId` 精确匹配    |
| `keyword`   | string             | —        | 模糊匹配 `title`                    |

**响应：** `ApiEnvelope<{ items: AiConversationItem[], total, page, pageSize }>`

```json
{
  "code": "SUCCESS",
  "data": {
    "items": [
      {
        "id": 1,
        "userId": 1,
        "title": "新对话",
        "mode": "AGENT",
        "modelId": 1,
        "systemPrompt": null,
        "metadata": { "novelId": 1 },
        "status": "ACTIVE",
        "messageCount": 5,
        "lastMessageAt": "2026-05-11T10:30:00.000Z",
        "createdAt": "2026-05-11T10:00:00.000Z",
        "updatedAt": "2026-05-11T10:30:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 20
  }
}
```

`DELETED` 状态的会话永不返回。

#### 7.2.3 会话详情

```
GET /v1/ai/conversations/:id
```

| 参数  | 类型   | 说明    |
| ----- | ------ | ------- |
| `:id` | number | 会话 ID |

**响应：** `ApiEnvelope<AiConversationItem>`（含 `modelSlot` 的展示字段快照：`name` / `status`）。

**错误：** `404 / NOT_FOUND`（不存在或非归属当前用户）。

#### 7.2.4 更新会话

```
PATCH /v1/ai/conversations/:id
```

**请求体：** 同 7.2.1，全部字段可选，至少传一项。

**响应：** `ApiEnvelope<AiConversationItem>`，`message` 为 "更新成功"。

**错误：** `404 / NOT_FOUND`、`422 / VALIDATION_ERROR`。

#### 7.2.5 软删除会话

```
DELETE /v1/ai/conversations/:id
```

将会话 `status` 置为 `DELETED`，后续所有查询均过滤。保留审计链，不物理删除。

**响应：** `ApiEnvelope<boolean>`，`message` 为 "删除成功"。

#### 7.2.6 归档/恢复

```
POST /v1/ai/conversations/:id/archive
```

**请求体：**

| 字段       | 类型    | 必填 | 说明                                          |
| ---------- | ------- | ---- | --------------------------------------------- |
| `archived` | boolean | 是   | `true` → `ARCHIVED`，`false` → 恢复为 `ACTIVE` |

**响应：** `ApiEnvelope<AiConversationItem>`，`message` 为 "操作成功"。

---

### 7.3 消息管理

> 路由前缀 `/v1/ai/conversations`，需要 `ai.conversation.manage` 权限。

#### 7.3.1 消息列表

```
GET /v1/ai/conversations/:id/messages
```

**查询参数：**

| 参数                | 类型    | 默认  | 说明                                    |
| ------------------- | ------- | ----- | --------------------------------------- |
| `cursor`            | number  | —     | 游标分页起始消息 ID（取该 ID 之后的消息） |
| `limit`             | number  | 50    | 每页条数，最大 200                       |
| `includeSuperseded` | boolean | false | 是否包含被替代的消息                      |

**响应：** `ApiEnvelope<{ items: AiMessageItem[], cursor: number | null, hasMore: boolean }>`

> 消息列表用于前端聊天展示，不返回模型真实输入、system prompt、提示词模板正文、内部上下文或工具结果正文。新生成的 `USER.content` 只保存安全展示文本；旧数据或未标记为安全展示的 `USER`、以及所有 `TOOL` 消息会返回空 `content` 并带 `contentRedacted: true`。`ASSISTANT` 消息正文正常返回；如果供应商返回 DeepSeek `reasoning_content`，`ASSISTANT` 会额外返回 `reasoningContent`。产生多段改文提案的 `ASSISTANT` 会额外返回 `editProposal`，结构与 SSE `edit.proposal` 一致；其中不包含完整 `baseText`、系统提示词、工具结果正文或 `renderedText`。新生成的 `USER` 消息会额外返回 `generationInput`，结构与客户端发起 `POST /v1/ai/generation/stream` 的请求体一致，用于前端回显当次生成所选提示词、角色库/素材库 ID、分类上下文和业务 metadata。

```json
{
  "code": "SUCCESS",
  "data": {
    "items": [
      {
        "id": 9,
        "conversationId": 1,
        "parentMessageId": 8,
        "role": "USER",
        "status": "ACTIVE",
        "content": "帮我续写这段剧情",
        "generationInput": {
          "conversationId": 1,
          "mode": "AGENT",
          "modelId": 1,
          "userMessage": "帮我续写这段剧情",
          "promptTemplateIds": [11],
          "promptInputs": { "类型": "玄幻" },
          "contextItemIds": [101],
          "categoryContexts": [
            { "categoryId": 15, "content": "本章主角进入灵脉遗迹。" }
          ],
          "metadata": { "novelId": 1, "chapterId": 3 },
          "temperature": 0.8
        },
        "toolCalls": null,
        "toolCallId": null,
        "toolName": null,
        "tokenUsage": null,
        "modelId": null,
        "jobId": 3,
        "seq": 3,
        "createdAt": "2026-05-11T10:29:00.000Z",
        "updatedAt": "2026-05-11T10:29:00.000Z"
      },
      {
        "id": 10,
        "conversationId": 1,
        "parentMessageId": 9,
        "role": "ASSISTANT",
        "status": "ACTIVE",
        "content": "好的，我来为你续写这段剧情...",
        "reasoningContent": "我需要延续遗迹场景，并保持主角目标一致。",
        "editProposal": {
          "mode": "novel_multi_diff",
          "documentId": "chapter-3",
          "baseHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          "baseLength": 0,
          "summary": "已生成 1 处编辑提案",
          "operations": [
            {
              "id": "op-1",
              "type": "replace",
              "range": { "start": 0, "end": 0 },
              "oldText": "",
              "newText": "灵脉深处传来低沉的轰鸣。",
              "reason": "补充遗迹压迫感"
            }
          ]
        },
        "toolCalls": null,
        "toolCallId": null,
        "toolName": null,
        "tokenUsage": { "prompt": 1024, "completion": 512, "total": 1536 },
        "modelId": 1,
        "jobId": 3,
        "seq": 4,
        "createdAt": "2026-05-11T10:30:00.000Z",
        "updatedAt": "2026-05-11T10:30:00.000Z"
      }
    ],
    "cursor": 10,
    "hasMore": false
  }
}
```

消息按 `seq` 升序排列；`role` 取值：`SYSTEM` / `USER` / `ASSISTANT` / `TOOL`；`status` 取值：`ACTIVE` / `PENDING` / `SUPERSEDED` / `FAILED`。

#### 7.3.2 删除用户消息

```
DELETE /v1/ai/conversations/:id/messages/:messageId
```

**约束：**
- 仅允许 `role=USER` 且 `status=ACTIVE` 的消息被删除。
- 级联：将目标消息及其后代全部标记为 `SUPERSEDED`（不物理删除，保留审计链）。

**响应：** `ApiEnvelope<boolean>`，`message` 为 "删除成功"。

**错误：** `409 / CONFLICT`（非 USER 消息或已 SUPERSEDED）。

---

### 7.4 文本生成 SSE

> 路由前缀 `/v1/ai/generation`，需要 `ai.generation.invoke` 权限。生成入口返回 `text/event-stream`，前端应使用 `fetch` + `ReadableStream` 消费（`EventSource` 不支持自定义请求头）；断开连接会通过 `AbortSignal` 中断后端生成链路。
> 频率限制：60 秒内最多 20 次请求。

#### 7.4.1 创建并启动生成（SSE）

```
POST /v1/ai/generation/stream
```

**请求体：**

前端只传生成意图和业务输入：`mode`、`modelId` 必填；`promptTemplateIds` 与 `promptInputs` 是主入口；后端负责读取提示词模板、替换 `{{变量}}`，并把渲染后的提示词放入 system prompt。`contextItemIds`、`categoryContexts` 和显式章节字段属于用户明确选择/输入的创作素材，会和 `userMessage` 一起组成本次生成输入；首轮生成时该输入作为 system 下发给模型，已有历史的续聊才作为本轮 user 消息下发。`metadata.novelId` / `metadata.chapterId` 主要表示业务关联和筛选条件；普通生成不会自动注入作品简介或章节正文。作品编辑器快捷写作复用 `metadata.scene` 传动作标识，并可通过 `metadata.quickWriting.chapterFullTextCount` 控制本次自动章节上下文；这些运行态字段不会持久化为会话场景，也不会被后续普通生成继承。`editorDiff` 是可选运行态输入，显式传入时本次生成改为返回多段改文提案，不直接修改章节正文，也不写入会话 `metadata`；`aiContinueInline`、`aiPlotAdvice`、`aiExpandSelection` 三个快捷动作不支持同时传入 `editorDiff`。快捷动作未显式传 `promptTemplateIds` 时，后端会按 `categoryContexts.categoryId` 读取用户保存的分类提示词状态。`conversationId` 可选，未传时后端会创建会话，并通过 `job.created` SSE 事件返回 `conversationId`。`userMessage` 仅作为兼容补充输入使用。

| 字段               | 类型                   | 必填 | 说明                                                         |
| ------------------ | ---------------------- | ---- | ------------------------------------------------------------ |
| `mode`             | `STANDARD` \| `AGENT`  | 是   | 生成模式                                                     |
| `modelId`          | number                 | 是   | 前端选择的模型槽位 ID                                        |
| `conversationId`   | number                 | 否   | 已有会话 ID；未传时由后端创建新会话                          |
| `promptTemplateIds` | number[]               | 否   | 提示词模板 ID 列表；渲染结果进入 system prompt，可从会话 `metadata.promptTemplateId` 兜底 |
| `promptInputs`      | Record<string, unknown> | 否   | 提示词变量键值对，例如模板 `写{{类型}}的物品{{数量}}` 对应 `{ "类型": "玄幻", "数量": 3 }` |
| `userMessage`       | string                 | 否   | 兼容补充输入；会进入本次生成输入，首轮作为 system 下发，续聊作为当前 user 下发 |
| `contextItemIds`    | number[]               | 否   | 用户明确选择要注入模型的上下文素材 ID；生成请求不传、不依赖硬编码 `type` |
| `chapterIds`         | number[]               | 否   | 显式注入的正文章节 ID；传入后优先于快捷写作自动章节策略 |
| `chapterSummaryIds`  | number[]               | 否   | 显式注入的概要章节 ID；传入后优先于快捷写作自动章节策略 |
| `categoryContexts`  | `{ categoryId, content }[]` | 否 | 分类上下文；`categoryId` 为提示词分类 ID，后端用分类名称渲染上下文标题，未传或内容为空则不注入 |
| `metadata`          | object                 | 否   | 业务引用：`novelId` / `chapterId` / `promptTemplateId` / `scene`；快捷写作可附带运行态 `quickWriting.chapterFullTextCount` |
| `editorDiff`        | object                 | 否   | 多段改文提案运行态输入；传入后最终输出走 `edit.proposal`，不流出原始 JSON；`aiContinueInline` / `aiPlotAdvice` / `aiExpandSelection` 不支持该字段 |

```json
{
  "mode": "AGENT",
  "modelId": 1,
  "promptTemplateIds": [1],
  "promptInputs": { "类型": "玄幻", "数量": 3 },
  "contextItemIds": [101, 102, 205],
  "categoryContexts": [
    { "categoryId": 15, "content": "本章主角进入灵脉遗迹。" },
    { "categoryId": 13, "content": "下一章揭露灵脉异变来源。" }
  ],
  "metadata": { "novelId": 1, "chapterId": 3 }
}
```

**多段改文提案：**

`editorDiff.mode` 支持两种运行方式：

| mode | 适用场景 | 前端是否传正文 |
| --- | --- | --- |
| `novel_multi_diff` | 前端已经确定正在编辑的章节或文档 | 是 |
| `chapter_auto_diff` | 显式强制“按自然语言定位章节并返回改文提案”；普通 `AGENT` 也可在未传 `editorDiff` 时由模型自主产生同类提案 | 否，模型通过 AGENT 章节工具定位并读取章节 |

`novel_multi_diff` 下，后端要求模型输出结构化编辑提案，并在服务端校验 `baseHash`、range、重叠和 `oldText`。后端不直接改文；前端收到 `edit.proposal` 后，应先校验当前文档仍匹配 `docVersion` / `baseHash`，再预览或按多段 range 应用 patch。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `mode` | `novel_multi_diff` | 是 | 启用多段编辑提案模式 |
| `documentId` | string | 否 | 前端文档标识，原样带回 |
| `docVersion` | string | 否 | 前端文档版本，原样带回 |
| `baseHash` | string | 是 | `baseText` 的 SHA-256 hex |
| `baseText` | string | 是 | 发起生成时的编辑器文档快照 |
| `caretOffset` | number | 是 | 发起生成时的光标 offset，必须在 `baseText` 范围内 |
| `selection` | `{ start, end }` | 否 | 发起生成时的选区，使用 JavaScript `slice` offset |
| `intent` | string | 否 | 用户意图，例如续写、润色、扩写、重写选区 |

```json
{
  "mode": "STANDARD",
  "modelId": 1,
  "userMessage": "把选区改得更有压迫感",
  "editorDiff": {
    "mode": "novel_multi_diff",
    "documentId": "chapter-3",
    "docVersion": "42",
    "baseHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "baseText": "",
    "caretOffset": 0,
    "selection": { "start": 0, "end": 0 },
    "intent": "rewrite_selection"
  }
}
```

返回的每个 operation 都是 `replace`：`range` 为原文区间，`oldText` 必须等于 `baseText.slice(start, end)`，`newText` 为替换文本；多段 operation 已按起点升序排列且互不重叠。

`chapter_auto_diff` 也可以作为显式强制提案路径使用：仅支持 `AGENT`，前端传入 `editorDiff: { "mode": "chapter_auto_diff" }` 后，模型必须通过章节工具定位并读取目标章节，后端根据工具结果生成内部快照。模型先产出候选编辑提案；该候选提案不会先发给前端，后端会基于已校验的 `operations[].newText` 和应用后的候选正文要求模型调用 `chapter_context_sync`，同步完成后才下发最终 `edit.proposal`。如果前端不传 `editorDiff`，普通 `AGENT` 仍可由模型自主判断是否需要改文；模型读取章节后，只有最终内容通过编辑提案校验时才返回 `edit.proposal`，否则按普通文本回答。后端不会根据 `userMessage` 关键词自动切换模式。

```json
{
  "mode": "AGENT",
  "modelId": 1,
  "userMessage": "帮我修改第十二章，让冲突更激烈",
  "metadata": { "novelId": 1 },
  "editorDiff": { "mode": "chapter_auto_diff" }
}
```

`chapter_auto_diff` 成功时，`edit.proposal` 会包含 `target`：

```json
{
  "mode": "chapter_auto_diff",
  "target": {
    "novelId": 1,
    "chapterId": 12,
    "chapterTitle": "第十二章 风雨欲来"
  },
  "documentId": "chapter-12",
  "docVersion": "2026-05-29T10:00:00.000Z",
  "baseHash": "...",
  "baseLength": 12345,
  "operations": []
}
```

如果显式 `chapter_auto_diff` 无法唯一定位章节，任务会以 `EDITOR_DIFF_TARGET_REQUIRED` 失败；前端可提示用户先选择或明确章节。未显式传 `editorDiff` 的普通 `AGENT` 对话中，模型可按需调用章节工具：如果最终返回合法编辑提案，前端会在素材同步完成后收到 `edit.proposal`；如果只是询问、分析或建议，前端继续按普通消息展示。

**章节正文生成中的素材维护：**

当一次生成绑定当前章节，或 `chapter_auto_diff` / 普通 AGENT 改文已通过工具定位到目标章节，并且属于章节正文写作/改写场景时，后端会在同一次模型工具循环里开放内部写入工具 `chapter_context_sync`。模型需要在最终正文或最终 `edit.proposal` 前，通过该工具提交本章明确出现的角色和词条；每个角色/词条都必须携带 `folderPath`，用于把素材归纳到角色库或词条库的文件夹路径中。后端会按当前作品、来源和同名标题 upsert，已有素材合并更新，不存在则创建并绑定到当前作品；若 `folderPath` 对应文件夹不存在，后端会自动创建并把素材放入该文件夹。改文提案链路中，写入工具只会在候选提案正文已经生成并通过后端结构校验后开放；同步依据是候选 `operations[].newText` 和应用提案后的候选正文，不使用空章节原文或未落地的剧情建议作为同步输入。

该能力不新增前端请求字段、不新增外部 API、不直接写回章节正文。`aiPlotAdvice` 这类只给建议的场景、普通聊天和普通素材查询不会开放章节素材同步工具。写入工具的 SSE `tool.call` 参数只返回脱敏标记；`tool.result` 只返回安全摘要，例如 `chapter_context_sync` 返回 `chapterId`、`characterCount`、`glossaryCount`、`createdCount`、`updatedCount`，以及每个同步素材的 `id`、`title`、`sourceKey`、`folderId`、`folderPath`、`action`；`memo_write` 返回 `id`、`title`、`scope`、`novelId`、`folderId`、`sortOrder` 等摘要。前端可据此告知“已创建/更新素材或备忘录”，不需要向用户发起批准，也不要展示完整素材正文或备忘录正文。

绑定当前作品的普通 AGENT 还可获得 `context_item_organize` 和 `memo_write`：前者只整理已有角色库/词条库素材的单层文件夹归属，后者只创建或编辑备忘录文本。二者是否调用由模型依据工具说明和当前请求自行判断，后端不按用户话术关键词硬编码开关；执行层会校验当前用户、当前作品、素材来源、备忘录作用域和归属。

前端如果需要展示最新角色/词条列表，可在生成成功后刷新素材库列表接口。

**作品编辑器快捷动作：**

`metadata.scene` 命中以下值时，后端会把它识别为一次性快捷动作标识，不会把该值当作普通创作场景注入，也不会持久化为会话场景。快捷动作的任务约束来自现有提示词体系：请求显式传入的 `promptTemplateIds` 优先；未传时，后端按 `categoryContexts.categoryId` 读取用户保存的分类提示词状态并渲染对应提示词模板。这三个快捷动作只走普通生成，不支持随请求传入 `editorDiff`。

| scene | 前端动作 | 提示词来源 | 章节上下文 |
| --- | --- | --- | --- |
| `aiContinueInline` | 行内续写 | 请求显式模板，或当前分类上下文对应的用户分类提示词状态 | 未显式传章节字段时，可按 `metadata.quickWriting.chapterFullTextCount` 自动追加前文 |
| `aiPlotAdvice` | 剧情建议 | 请求显式模板，或当前分类上下文对应的用户分类提示词状态 | 未显式传章节字段时，可按 `metadata.quickWriting.chapterFullTextCount` 自动追加前文 |
| `aiExpandSelection` | 选区扩写 | 请求显式模板，或当前分类上下文对应的用户分类提示词状态 | 未显式传章节字段时，可按 `metadata.quickWriting.chapterFullTextCount` 自动追加前文 |

自动章节策略只在 `chapterIds` / `chapterSummaryIds` 都未显式传入时生效：以 `metadata.chapterId` 定位当前章节，按作品章节顺序只取当前章节之前的前文，避免和编辑器传入的当前正文重复；最近 `chapterFullTextCount` 章使用正文，更早章节优先使用概要，概要缺失时用正文兜底。该字段只影响本次上下文解析，不写入会话 `metadata`。

运行控制归后端：`temperature` 来自模型槽位/模型定义配置，AGENT 查询工具集合由后端内部注册表开放，章节正文写作/改写链路可临时开放内部写入工具，最大迭代轮数由后端固定控制。若本次请求已经绑定 `metadata.novelId`，后端不会向模型暴露 `novel_list`，且所有作品、章节、素材工具调用都会被限制在当前作品内；模型即使传入其他作品 ID，也会被服务端拒绝。角色库、词条库和备忘录由模型按需调用工具查询，后端不会在 AGENT 入口自动预查询。文本生成入口不要求前端传幂等键。

**响应：** HTTP 200，`Content-Type: text/event-stream`。

**错误前置（SSE 建立前以 JSON 返回）：**

| HTTP | code                | 说明                              |
| ---- | ------------------- | --------------------------------- |
| 404  | `NOT_FOUND`         | 会话不存在、非归属或 modelId 不合法 |
| 422  | `VALIDATION_ERROR`  | schema 校验失败                   |
| 503  | `MODEL_UNAVAILABLE` | 槽位故障（未绑定/禁用/全量熔断）   |

**SSE 事件类型：**

| 事件                | 触发时机                     | data 字段                                                    |
| ------------------- | ---------------------------- | ------------------------------------------------------------ |
| `job.created`       | 任务创建成功                 | `{ jobId, conversationId }`                                  |
| `message.delta`     | 模型流式输出文本片段（N 次）；`editorDiff` 模式不会下发原始 JSON | `{ jobId, messageId, delta: string }`                        |
| `message.reasoning_delta` | 模型流式输出思考片段（N 次，仅供应商返回时存在） | `{ jobId, messageId, delta: string }`                        |
| `edit.proposal`     | `editorDiff` 模式下编辑提案校验通过 | `{ jobId, messageId, mode, target?, documentId?, docVersion?, baseHash, baseLength, operations, caret?, cursor?, summary? }` |
| `message.completed` | 一条 assistant 消息完成      | `{ jobId, messageId, content, reasoningContent?, usage?, toolCalls? }` |
| `tool.call`         | AGENT 模式工具调用（M 次）   | `{ jobId, toolCallId, name, arguments }`                     |
| `tool.result`       | 工具执行结果（M 次）         | `{ jobId, toolCallId, name, result }`                        |
| `job.iteration`     | AGENT 每轮循环结束           | `{ jobId, iteration, maxIterations }`                        |
| `job.succeeded`     | 任务成功完成                 | `{ jobId, result? }`                                         |
| `job.failed`        | 任务失败                     | `{ jobId, errorCode, message }`                              |
| `job.canceled`      | 任务被取消                   | `{ jobId }`                                                  |
| `keepalive`         | 定时心跳保活（间隔由 `SSE_KEEPALIVE_INTERVAL_MS` 配置，默认 15s） | `{ ts }`                                                     |

提示词正文是敏感信息：SSE 不发送后端渲染后的 `USER` 提示词；`editorDiff` 模式不发送模型原始 JSON，仅发送校验后的 `edit.proposal`，`message.completed.content` 只保存短摘要。校验后的 `edit.proposal` 会作为 `ASSISTANT.editProposal` 进入消息列表历史，供前端刷新后恢复提案卡片；历史中的提案不包含完整 `baseText`、系统提示词、工具结果正文或 `renderedText`。AGENT 工具结果只返回作品、章节和素材库查询结果，不提供提示词模板查询能力；章节同步写入工具只返回脱敏摘要。DeepSeek thinking mode 返回的 `reasoning_content` 会通过 `message.reasoning_delta` 流式发送，并在 `message.completed.reasoningContent` 与消息列表 `ASSISTANT.reasoningContent` 中返回。

章节正文写作/改写链路可能出现 `chapter_context_sync` 工具事件。该工具属于内部写入能力，只在当前章节写入目标内 upsert 本章角色/词条；前端可根据 `tool.result.result.createdCount` / `updatedCount` 和 `items[].action` 展示“已创建/更新素材库”的安全告知，不需要用户批准，也不要依赖或展示工具参数详情。

用户明确要求整理已有角色库/词条库文件夹时，AGENT 可能出现 `context_item_organize` 工具事件。该工具只整理当前作品内已有角色/词条素材的单层 `folderId`，不修改素材正文、章节正文、备忘录或全局备忘录；前端可展示“已整理素材库分类”的安全告知，并在任务成功后刷新素材库文件夹树和列表。

**上下文选择约定：**

- 实际发给模型的顺序为：system prompt → 历史 conversation / tools → 本次输入。没有有效历史时，本次输入作为 system 下发，并追加一条中性 user 触发消息；已有历史时，本次输入作为当前 user 消息下发。
- 用户创建/选择的提示词模板经后端渲染后进入 system prompt，不和素材、本章剧情混在一起。
- `contextItemIds` 来自后端提供的可选上下文素材列表，不由前端自行构造。
- 生成请求不传 `type`，也不传“人物卡/词条卡/备忘录”等硬编码枚举。
- 后端根据 `ContextItem.sourceId` 关联的 `ContextSource` 配置校验、排序并读取 `renderedText` 注入本次生成输入。
- `categoryContexts` 使用提示词分类 ID；后端读取分类名称作为上下文标题，未传、内容为空或分类不存在时不注入该段内容。
- `ContextSource` 是数据库配置；新增“世界观卡”“伏笔卡”等来源不应影响生成接口。

**作品素材项列表：**

```
GET /v1/ai/context-items
```

| 参数      | 类型   | 默认 | 说明                                      |
| --------- | ------ | ---- | ----------------------------------------- |
| `novelId`   | number | —    | 必填；只返回该作品素材库中已绑定的素材 |
| `keyword`   | string | —    | 可选；按标题/摘要搜索                    |
| `sourceKey` | string | —    | 可选；按来源筛选，例如 `character`、`glossary`，后续可扩展关联库来源 |
| `folderId`  | number | —    | 可选；按文件夹筛选                      |

响应项示例：

```json
{
  "code": "SUCCESS",
  "data": [
    {
      "id": 101,
      "source": { "id": 1, "key": "character", "name": "角色库" },
      "folderId": null,
      "title": "林秋",
      "summary": "男主，阵修，性格冷静",
      "selected": true
    }
  ]
}
```

**生成设置页素材选择状态：**

```
GET /v1/ai/context-items/selection-state?novelId=1
PUT /v1/ai/context-items/selection-state
```

用于高级功能开启后自动加载角色库、词条库和后续关联库的勾选状态。该状态保存的是“生成设置页的上一次选择”，不是最近一次生成任务历史。

PUT 请求体：

| 字段             | 类型     | 必填 | 说明 |
| ---------------- | -------- | ---- | ---- |
| `novelId`        | number   | 是   | 作品 ID |
| `sourceKey`      | string   | 是   | 来源 key，例如 `character`、`glossary` |
| `contextItemIds` | number[] | 否   | 该来源下当前勾选的素材 ID，空数组表示清空 |

响应示例：

```json
{
  "code": "SUCCESS",
  "data": {
    "novelId": 1,
    "groups": [
      {
        "source": { "id": 1, "key": "character", "name": "角色库" },
        "contextItemIds": [101, 102],
        "selectedContextItemIds": [101],
        "items": [
          {
            "id": 101,
            "source": { "id": 1, "key": "character", "name": "角色库" },
            "folderId": null,
            "title": "林秋",
            "summary": "男主，阵修，性格冷静",
            "selected": true
          }
        ]
      }
    ]
  }
}
```

**SSE 典型 STANDARD 流程：**

```
job.created → message.reasoning_delta × N? → message.delta × N → message.completed → job.succeeded
```

**SSE 典型章节正文写作流程：**

```
job.created → tool.call(chapter_context_sync) → tool.result → job.iteration
→ message.delta × N → message.completed → job.succeeded
```

**SSE 典型多段改文提案流程：**

```
job.created → edit.proposal → message.completed → job.succeeded
```

**SSE 典型章节自动改文流程：**

```
job.created → tool.call(chapter_list) → tool.result → job.iteration
→ tool.call(chapter_detail) → tool.result → tool.call(chapter_context_sync) → tool.result → job.iteration
→ edit.proposal → message.completed → job.succeeded
```

**SSE 典型 AGENT 流程：**

```
job.created → message.reasoning_delta × N? → message.delta × N → tool.call → tool.result → job.iteration
→ message.reasoning_delta × N? → message.delta × N → message.completed → job.succeeded
```

AGENT 携带 `editorDiff` 时仍可出现 `tool.call` / `tool.result` / `job.iteration`，但不会下发模型中间正文或原始 JSON；最终仍以 `edit.proposal → message.completed → job.succeeded` 收束。章节自动改文模式下，`chapter_detail` 的 SSE 结果会脱敏章节正文，只返回章节元信息和正文长度，完整正文仅在后端内部作为改文快照使用。

若达到 `maxIterations` 仍未收敛 → `job.failed`，`errorCode=AGENT_ITERATION_EXCEEDED`。

**AGENT 工具白名单（当前已实现，均按 userId 和作品范围校验归属）：**

| 工具名                 | 说明                      |
| ---------------------- | ------------------------- |
| `novel_list`           | 列出当前用户作品列表；当前请求已绑定作品时不下发 |
| `novel_detail`         | 获取当前作品或指定作品详情；已绑定作品时可传 `{}`，未绑定时传 `bookId` |
| `chapter_list`         | 列出当前作品或指定作品章节；已绑定作品时可传 `{}`，未绑定时传 `bookId` |
| `chapter_detail`       | 按 `chapterId` 获取章节详情；已绑定作品时只能读取当前作品内章节 |
| `context_item_list`    | 查询当前作品或指定作品素材库；已绑定作品时可省略 `novelId` |
| `context_item_detail`  | 获取当前作品或指定作品素材详情；已绑定作品时可省略 `novelId` |

**绑定当前作品后的通用内部写入工具：**

| 工具名 | 说明 |
| ------ | ---- |
| `context_item_organize` | 整理当前作品已有角色库/词条库素材的一层文件夹归属；不创建、不编辑素材正文，也不处理备忘录；执行层校验用户、当前作品绑定和来源类型 |
| `memo_write` | 创建或编辑备忘录文本；作品备忘录自动绑定当前作品，全局备忘录只绑定当前用户；参数对前端脱敏，结果只返回备忘录 ID、标题、作用域和归属摘要 |

**章节正文写作/改写链路内部写入工具：**

| 工具名 | 说明 |
| ------ | ---- |
| `chapter_context_sync` | 在当前章节写入目标内 upsert 本章明确出现的角色和词条；每项通过 `folderPath` 归纳到角色库/词条库文件夹，缺失文件夹由后端自动创建；参数对前端脱敏，结果只返回章节 ID、角色/词条数量、创建/更新数量、文件夹归纳信息和条目标题等安全摘要 |

#### 7.4.2 重试生成（SSE）

```
POST /v1/ai/generation/:jobId/retry
```

对指定 assistant 消息重试。服务端行为：
1. 校验 target 消息归属当前用户且 `status=ACTIVE`；
2. 将 target 及其后代全部标记为 `SUPERSEDED`；
3. 以 `target.parentMessageId` 作为锚点创建新 job 并返回 SSE 流。

**URL 参数：** `:jobId` 为被替代消息关联的 jobId（前端从消息上获取）。

**请求体：**

| 字段              | 类型   | 必填 | 说明                       |
| ----------------- | ------ | ---- | -------------------------- |
| `targetMessageId` | number | 是   | 被重试的 assistant 消息 ID |

**响应：** 同 7.4.1 的 SSE 事件流。

携带 `editorDiff` 的编辑提案任务不会持久化完整 `baseText` 用于后端重试；前端需要基于当前编辑器快照重新调用 `POST /v1/ai/generation/stream`。直接重试这类消息会返回 `409 / EDITOR_DIFF_RETRY_UNSUPPORTED`。

**错误：** `404 / NOT_FOUND`、`409 / EDITOR_DIFF_RETRY_UNSUPPORTED`、`422 / VALIDATION_ERROR`。

#### 7.4.3 取消任务

```
POST /v1/ai/generation/:jobId/cancel
```

仅允许 `status IN (PENDING, RUNNING)` 的任务。

**响应：** `ApiEnvelope<AiGenerationJobItem>`，`message` 为 "已取消"。

**效果：**
- 触发对应 job 的 `AbortSignal`，正在执行的模型调用和工具调用在可取消边界退出；
- 仍处于 `PENDING` 的 assistant 消息被标记为 `FAILED`，正文为 "已取消"；
- 若 SSE 请求方主动断开，`request.signal` 贯通到模型 adapter，任务按 `CLIENT_DISCONNECTED` 失败。

**错误：** `409 / CONFLICT`（任务已终态）。

#### 7.4.4 查询任务状态

```
GET /v1/ai/generation/:jobId
```

**响应：** `ApiEnvelope<AiGenerationJobItem>`（不含消息正文，仅状态/错误码/用量）。

```json
{
  "code": "SUCCESS",
  "data": {
    "id": 5,
    "conversationId": 1,
    "userId": 1,
    "mode": "STANDARD",
    "modelId": 1,
    "status": "SUCCEEDED",
    "anchorMessageId": 4,
    "retryTargetId": null,
    "clientRequestId": null,
    "iterationCount": 1,
    "maxIterations": 8,
    "errorCode": null,
    "errorMessage": null,
    "tokenUsage": { "prompt": 2048, "completion": 1024, "total": 3072 },
    "startedAt": "2026-05-11T10:30:00.000Z",
    "finishedAt": "2026-05-11T10:30:15.000Z",
    "createdAt": "2026-05-11T10:30:00.000Z",
    "updatedAt": "2026-05-11T10:30:15.000Z"
  }
}
```

**错误：** `404 / NOT_FOUND`。

---

### 7.5 图片生成

> 路由前缀 `/v1/ai/images`，需要 `ai.image.generate` 权限。图片生成走独立任务表，返回普通 JSON（非 SSE）。
> 频率限制：60 秒内最多 10 次请求。

#### 7.5.1 创建图片生成任务

```
POST /v1/ai/images
```

**请求体：**

前端只传结构化输入；后端负责读取提示词模板并组装图片最终 prompt。最终 prompt 只在后端内部使用，响应不返回正文；`prompt` 仅作为兼容补充描述使用。

| 字段               | 类型                   | 必填 | 说明                                    |
| ------------------ | ---------------------- | ---- | --------------------------------------- |
| `modelId`          | number                 | 是   | 槽位 ID，必须支持 `IMAGE_GENERATION`     |
| `promptTemplateId` | number                 | 否   | 提示词模板 ID；未传 `prompt` 时必须提供  |
| `promptInputs`     | Record<string, unknown> | 否   | 提示词变量键值对                        |
| `prompt`           | string                 | 否   | 兼容补充图片描述，1~16000 字符          |
| `metadata`         | object                 | 否   | 业务引用                                |
| `size`             | string                 | 否   | 尺寸，如 `"1024x1024"`                  |
| `quality`          | string                 | 否   | 质量，如 `"standard"` / `"hd"`          |
| `n`                | number                 | 否   | 生成数量                                |
| `clientRequestId`  | string                 | 否   | 幂等键，≤64 字符                        |

```json
{
  "modelId": 1,
  "promptTemplateId": 2,
  "promptInputs": { "类型": "奇幻森林", "数量": 1 },
  "size": "1024x1024",
  "quality": "hd",
  "n": 1,
  "metadata": { "novelId": 1 }
}
```

**响应：** `ApiEnvelope<AiImageGenerationJobItem>`，`message` 为 "生成完成"。

```json
{
  "code": "SUCCESS",
  "data": {
    "id": 1,
    "userId": 1,
    "modelId": 1,
    "status": "SUCCEEDED",
    "clientRequestId": null,
    "prompt": "",
    "promptRedacted": true,
    "promptHash": "a1b2c3...",
    "metadata": { "novelId": 1 },
    "options": { "size": "1024x1024", "quality": "hd", "n": 1 },
    "result": { "urls": ["https://..."] },
    "errorCode": null,
    "errorMessage": null,
    "startedAt": "2026-05-11T10:30:00.000Z",
    "finishedAt": "2026-05-11T10:30:05.000Z",
    "createdAt": "2026-05-11T10:30:00.000Z",
    "updatedAt": "2026-05-11T10:30:05.000Z"
  }
}
```

#### 7.5.2 查询图片任务

```
GET /v1/ai/images/:jobId
```

| 参数    | 类型   | 说明       |
| ------- | ------ | ---------- |
| `:jobId` | number | 图片任务 ID |

**响应：** `ApiEnvelope<AiImageGenerationJobItem>`，结构同 7.5.1。

**错误：** `404 / NOT_FOUND`。

---

### 7.6 管理端 AI 配置

> 路由前缀 `/v1/admin/ai`，需要 `ai.model.manage` 权限，仅 `ADMIN` 可用。
> 管理端接口对 `apiKey` 做脱敏，返回 `apiKeyMasked`（如 `sk-****abcd`），明文永不返回。
> 所有写操作归属 `system` 类审计，永不包含明文 Key。

#### 7.6.1 模型槽位

| 方法   | 路径                          | 说明                                                         |
| ------ | ----------------------------- | ------------------------------------------------------------ |
| GET    | `/slots`                      | 列出全部槽位（含 `enabled=false`）                            |
| POST   | `/slots`                      | 新建槽位；`id` 必填（如 `4`），作为前端后续引用的固定契约     |
| PUT    | `/slots/:id`                  | 修改槽位元信息                                               |
| DELETE | `/slots/:id`                  | 删除槽位；若前端仍在用该 ID 会返回 404，需审慎操作            |
| PUT    | `/slots/:id/bind`             | 换绑底层模型：`{ modelId: number \| null }`，`null` 为解绑    |

**POST / PUT 请求体：**

| 字段                 | 类型                            | 必填       | 说明                                       |
| -------------------- | ------------------------------- | ---------- | ------------------------------------------ |
| `id`                 | number                          | POST 必填  | 前端可见的 modelId，正整数                  |
| `displayName`        | string                          | POST 必填  | ≤64 字符                                   |
| `description`        | string                          | 否         | ≤500 字符                                  |
| `tags`               | string[]                        | 否         | 受控集合：`hot` / `free` / `new` / `beta`  |
| `sortOrder`          | number                          | 否         | 列表排序，默认 0                            |
| `enabled`            | boolean                         | 否         | 对前端可见，默认 true                       |
| `failoverStrategy`   | `SEQUENTIAL` \| `ROUND_ROBIN`   | 否         | 账号调度策略，默认 `SEQUENTIAL`             |
| `defaultTemperature` | number \| null                  | 否         | 0~2，两位小数                               |
| `boundModelId`       | number \| null                  | 否         | 创建时即可绑定                              |

**响应：** `ApiEnvelope<AiModelSlotAdmin>`（含扁平嵌入的 `boundModel` 与聚合连通性 `status`）。

#### 7.6.2 模型定义

| 方法   | 路径             | 说明                                                        |
| ------ | ---------------- | ----------------------------------------------------------- |
| GET    | `/models`        | 分页列表，支持 `platform` / `keyword` 过滤                   |
| POST   | `/models`        | 创建模型定义                                                 |
| GET    | `/models/:id`    | 详情                                                        |
| PUT    | `/models/:id`    | 更新                                                        |
| DELETE | `/models/:id`    | 删除；被槽位绑定时返回 `409 / CONFLICT`，提示先解绑          |

**POST 必填请求体：**

| 字段                | 类型                              | 说明                                                         |
| ------------------- | --------------------------------- | ------------------------------------------------------------ |
| `identifier`        | string                            | 传给底层 API 的模型名，如 `"gpt-4o-mini"`，≤128 字符         |
| `displayName`       | string                            | 管理端显示名，≤128 字符                                      |
| `platform`          | string                            | 协议族：`openai` / `anthropic` / `deepseek`，≤32 字符        |
| `endpoint`          | string                            | 端点类型：`chat.completions` / `responses` / `messages`，≤32 字符 |
| `contextWindow`     | number                            | 上下文窗口 token 数                                          |
| `maxOutputTokens`   | number                            | 单次最大输出 token 数                                        |
| `defaultTemperature`| number                            | 默认温度，0~2                                                |

**可选字段：** `reasoningEffort`（`NONE`/`LOW`/`MEDIUM`/`HIGH`）、`extraParams`、`capabilities`（`TEXT_CHAT`/`TOOL_CALLING`/`STREAMING`/`IMAGE_GENERATION`/`MULTI_MODAL_INPUT`/`JSON_MODE`）、`enabled`。

**响应：** `ApiEnvelope<ModelDefinitionAdmin>`。

#### 7.6.3 Provider 账号

| 方法   | 路径              | 说明                                                        |
| ------ | ----------------- | ----------------------------------------------------------- |
| GET    | `/accounts`       | 分页列表，支持 `platform` / `enabled` 过滤                   |
| POST   | `/accounts`       | 创建账号，`apiKey` 明文入参，服务端加密存储                   |
| GET    | `/accounts/:id`   | 详情（不返回 Key 明文）                                      |
| PUT    | `/accounts/:id`   | 更新；`apiKey` 传空字符串视为不改，传非空视为全量替换        |
| DELETE | `/accounts/:id`   | 删除；被模型绑定时返回 `409 / CONFLICT`，提示先解绑          |

**POST 必填请求体：**

| 字段       | 类型   | 说明                                       |
| ---------- | ------ | ------------------------------------------ |
| `platform` | string | 与模型 `platform` 对齐，≤32 字符            |
| `label`    | string | 管理端显示名，≤64 字符                     |
| `baseUrl`  | string | 接口基础地址，≤255 字符                     |
| `apiKey`   | string | 明文 API Key，≤4096 字符，加密后永不返回    |

**可选字段：** `extraHeaders`、`extraParams`、`priority`、`weight`、`enabled`。

**响应：** `ApiEnvelope<ProviderAccountAdmin>`（`apiKeyMasked` 形式，如 `sk-****abcd`）。

#### 7.6.4 模型账号绑定

| 方法   | 路径                                          | 说明                               |
| ------ | --------------------------------------------- | ---------------------------------- |
| GET    | `/models/:modelId/accounts`                    | 列出该模型的候选账号                |
| POST   | `/models/:modelId/accounts`                    | 绑定账号                           |
| PUT    | `/models/:modelId/accounts/:accountId`          | 调整 `priority` / `enabled`        |
| DELETE | `/models/:modelId/accounts/:accountId`          | 解绑                               |
| PUT    | `/models/:modelId/accounts/reorder`             | 批量重排优先级                      |

**POST 请求体：** `{ accountId: number, priority?: number, enabled?: boolean }`

**批量重排请求体：** `{ orders: [{ accountId: number, priority: number }] }`

**响应：** `ApiEnvelope<ModelAccountBindingAdmin[]>`（含扁平嵌入的 `account` 与 `health`）。

#### 7.6.5 健康度

| 方法 | 路径                                | 说明                                |
| ---- | ----------------------------------- | ----------------------------------- |
| GET  | `/health`                           | 查询健康度，支持 `modelId` / `accountId` / `platform` 组合过滤 |
| POST | `/health/:modelId/:accountId/reset` | 清零统计与熔断                      |

**响应：** `ApiEnvelope<ProviderAccountHealthAdmin[]>`（GET）/ `ApiEnvelope<boolean>`（POST reset）。

**健康度字段：**

| 字段                  | 类型           | 说明                              |
| --------------------- | -------------- | --------------------------------- |
| `modelId`             | number         | 模型 ID                           |
| `accountId`           | number         | 账号 ID                           |
| `successCount`        | number         | 窗口内成功次数                    |
| `failureCount`        | number         | 窗口内失败次数                    |
| `p95LatencyMs`        | number \| null | 窗口内 p95 延迟                   |
| `consecutiveFailures` | number         | 连续失败计数                      |
| `circuitOpenUntil`    | string \| null | 熔断截止时间                      |
| `lastSuccessAt`       | string \| null | 最近成功时间                      |
| `lastFailureAt`       | string \| null | 最近失败时间                      |
| `lastErrorCode`       | string \| null | 最近错误归类码                    |
| `updatedAt`           | string         | 更新时间                          |

---

## 公共类型

### SafeUser

| 字段          | 类型                                    | 说明         |
| ------------- | --------------------------------------- | ------------ |
| `id`          | number                                  | 用户 ID      |
| `username`    | string                                  | 用户名       |
| `email`       | string                                  | 邮箱         |
| `role`        | `"ADMIN"` \| `"AUTHOR"`                 | 角色         |
| `status`      | `"ACTIVE"` \| `"BANNED"` \| `"DELETED"` | 状态         |
| `lastLoginAt` | string \| null                          | 最后登录时间 |
| `createdAt`   | string                                  | 创建时间     |
| `updatedAt`   | string                                  | 更新时间     |

### AuthTokens

| 字段           | 类型   | 说明                               |
| -------------- | ------ | ---------------------------------- |
| `accessToken`  | string | JWT Access Token                   |
| `refreshToken` | string | Refresh Token 明文（仅签发时返回） |
| `expiresIn`    | number | Access Token 有效秒数（默认 900）  |

### Book

| 字段          | 类型                            | 说明                 |
| ------------- | ------------------------------- | -------------------- |
| `id`          | number                          | 作品 ID              |
| `userId`      | number                          | 作者用户 ID          |
| `name`        | string                          | 作品名称             |
| `description` | string \| null                  | 作品简介             |
| `type`        | `"NOVEL"` \| `"SCRIPT"` \| null | 作品类型             |
| `totalWords`  | number                          | 累计字数（自动统计） |
| `order`       | number                          | 排序序号             |
| `archived`    | boolean                         | 是否归档             |
| `isTrash`     | boolean                         | 是否回收站           |
| `createdAt`   | string                          | 创建时间             |
| `updatedAt`   | string                          | 更新时间             |

### Chapter

| 字段        | 类型           | 说明        |
| ----------- | -------------- | ----------- |
| `id`        | number         | 章节 ID     |
| `bookId`    | number         | 所属作品 ID |
| `title`     | string         | 章节标题    |
| `content`   | string \| null | 章节正文（API 明文，数据库压缩加密保存） |
| `order`     | number         | 排序序号    |
| `wordCount` | number         | 字数        |
| `createdAt` | string         | 创建时间    |
| `updatedAt` | string         | 更新时间    |

### PromptTemplate

| 字段            | 类型                                                | 说明                          |
| --------------- | --------------------------------------------------- | ----------------------------- |
| `id`            | number                                              | 提示词 ID                     |
| `userId`        | number                                              | 创建者用户 ID                 |
| `name`          | string                                              | 提示词名称                    |
| `content`       | string                                              | 提示词正文（支持变量占位）    |
| `presetOptions` | PresetOption[] \| null                              | 预制输入选项                  |
| `description`   | string \| null                                      | 提示词介绍                    |
| `privacy`       | `"PRIVATE"` \| `"SHARED"` \| `"AUTHORIZED"`       | 隐私设置                      |
| `usageGuide`    | string \| null                                      | 使用方法（简短说明）          |
| `categoryId`    | number \| null                                      | 所属提示词分类 ID             |
| `category`      | string \| null                                      | 所属提示词分类名称             |
| `isApproved`    | boolean                                             | 是否通过审核                  |
| `versionCount`  | number                                              | 历史版本数量                  |
| `createdAt`     | string                                              | 创建时间                      |
| `updatedAt`     | string                                              | 更新时间                      |

### PromptTemplateListItem

| 字段           | 类型                                                | 说明         |
| -------------- | --------------------------------------------------- | ------------ |
| `id`           | number                                              | 提示词 ID    |
| `userId`       | number                                              | 创建者用户 ID |
| `name`         | string                                              | 提示词名称   |
| `description`  | string \| null                                      | 提示词介绍   |
| `privacy`      | `"PRIVATE"` \| `"SHARED"` \| `"AUTHORIZED"`       | 隐私设置     |
| `usageGuide`   | string \| null                                      | 使用方法                     |
| `categoryId`   | number \| null                                      | 所属提示词分类 ID             |
| `category`     | string \| null                                      | 所属提示词分类名称             |
| `isApproved`   | boolean                                             | 是否通过审核                 |
| `versionCount` | number                                              | 版本数量                     |
| `createdAt`    | string                                              | 创建时间                     |
| `updatedAt`    | string                                              | 更新时间                     |

### CategoryItem

| 字段          | 类型   | 说明                                 |
| ------------- | ------ | ------------------------------------ |
| `id`          | number | 分类 ID                              |
| `name`        | string | 分类显示名                           |
| `promptCount` | number | 该分类下公开且审核通过的提示词数量   |

### CreativeToolApiItem

| 字段         | 类型              | 说明                     |
| ------------ | ----------------- | ------------------------ |
| `id`         | number            | 工具 ID                  |
| `name`       | string            | 工具名称                 |
| `description`| string            | 工具描述                 |
| `icon`       | CreativeToolIcon  | 工具图标                 |
| `categoryId` | number \| null    | 所属提示词分类 ID        |
| `category`   | string \| null    | 所属提示词分类名称       |
| `isNew`      | boolean           | 是否显示 NEW 角标        |

### AiModelPublicItem（前端模型）

| 字段          | 类型                                   | 说明                                |
| ------------- | -------------------------------------- | ----------------------------------- |
| `id`          | number                                 | 槽位 ID，对外即"模型 ID"            |
| `name`        | string                                 | 面向用户展示的模型名称              |
| `description` | string                                 | 模型描述                            |
| `temperature` | number                                 | 推荐温度（默认值，调用时可覆盖）    |
| `tags`        | string[]                               | 受控标签集合：`hot` / `free` / `new` / `beta` |
| `status`      | `SMOOTH` \| `CONGESTED` \| `OUTAGE`   | 聚合连通性                          |

### AiContextItemOption（可选上下文素材）

| 字段      | 类型                              | 说明                                      |
| --------- | --------------------------------- | ----------------------------------------- |
| `id`      | number                            | 上下文素材 ID，用于生成请求的 `contextItemIds` |
| `source`  | `{ id: number; name: string }`     | 来源展示信息，来自数据库配置的 `ContextSource` |
| `title`   | string                            | 素材标题                                  |
| `summary` | string \| null                    | 素材摘要                                  |
| `global`  | boolean                           | 是否作者级全局可用                        |
| `bound`   | boolean                           | 查询指定 `novelId` 时，是否已绑定该作品    |

### AiConversationItem（会话）

| 字段           | 类型                                | 说明                                          |
| -------------- | ----------------------------------- | --------------------------------------------- |
| `id`           | number                              | 会话 ID                                       |
| `userId`       | number                              | 归属用户 ID                                   |
| `title`        | string                              | 会话标题                                      |
| `mode`         | `STANDARD` \| `AGENT`              | 默认生成模式                                  |
| `modelId`      | number                              | 默认槽位 ID                                   |
| `systemPrompt` | string \| null                      | 会话级系统提示词                              |
| `metadata`     | AiMetadata \| null                  | 业务关联引用                                  |
| `status`       | `ACTIVE` \| `ARCHIVED` \| `DELETED` | 会话状态                                      |
| `messageCount` | number                              | 活跃消息数（`SUPERSEDED` 不计入）              |
| `lastMessageAt`| string \| null                      | 最近一条消息时间                              |
| `createdAt`    | string                              | 创建时间                                      |
| `updatedAt`    | string                              | 更新时间                                      |

### AiMessageItem（消息）

| 字段             | 类型                                                     | 说明                   |
| ---------------- | -------------------------------------------------------- | ---------------------- |
| `id`             | number                                                   | 消息 ID                |
| `conversationId` | number                                                   | 归属会话 ID            |
| `parentMessageId`| number \| null                                           | 父消息 ID；根消息为 null |
| `role`           | `SYSTEM` \| `USER` \| `ASSISTANT` \| `TOOL`              | 消息角色               |
| `status`         | `ACTIVE` \| `PENDING` \| `SUPERSEDED` \| `FAILED`       | 消息状态               |
| `content`        | string                                                   | 消息正文               |
| `toolCalls`      | object[] \| null                                         | assistant 产出的工具调用列表 |
| `toolCallId`     | string \| null                                           | 仅 TOOL 角色：回填的 tool_call id |
| `toolName`       | string \| null                                           | 仅 TOOL 角色：工具名   |
| `tokenUsage`     | `{ prompt, completion, total }` \| null                  | Token 用量（仅 assistant） |
| `modelId`        | number \| null                                           | 本次使用的槽位 ID      |
| `jobId`          | number \| null                                           | 关联的生成任务 ID      |
| `seq`            | number                                                   | 在所在分支上的顺序号   |
| `createdAt`      | string                                                   | 创建时间               |
| `updatedAt`      | string                                                   | 更新时间               |

### AiGenerationJobItem（文本生成任务）

| 字段              | 类型                                                        | 说明                   |
| ----------------- | ----------------------------------------------------------- | ---------------------- |
| `id`              | number                                                      | 任务 ID                |
| `conversationId`  | number                                                      | 归属会话 ID            |
| `userId`          | number                                                      | 发起用户 ID            |
| `mode`            | `STANDARD` \| `AGENT`                                       | 生成模式               |
| `modelId`         | number                                                      | 使用的槽位 ID          |
| `status`          | `PENDING` \| `RUNNING` \| `SUCCEEDED` \| `FAILED` \| `CANCELED` | 任务状态           |
| `anchorMessageId` | number \| null                                              | 新消息的父消息锚点     |
| `retryTargetId`   | number \| null                                              | 被替代的 assistant 消息 ID |
| `clientRequestId` | string \| null                                              | 预留字段，文本生成入口通常为 null |
| `iterationCount`  | number                                                      | Agent 循环轮数         |
| `maxIterations`   | number                                                      | Agent 最大循环数       |
| `errorCode`       | string \| null                                              | 失败错误码             |
| `errorMessage`    | string \| null                                              | 错误摘要               |
| `tokenUsage`      | `{ prompt, completion, total }` \| null                     | 聚合 Token 用量        |
| `startedAt`       | string \| null                                              | 进入 RUNNING 时间      |
| `finishedAt`      | string \| null                                              | 进入终态时间           |
| `createdAt`       | string                                                      | 创建时间               |
| `updatedAt`       | string                                                      | 更新时间               |

### AiImageGenerationJobItem（图片生成任务）

| 字段             | 类型                             | 说明                |
| ---------------- | -------------------------------- | ------------------- |
| `id`             | number                           | 任务 ID             |
| `userId`         | number                           | 发起用户 ID         |
| `modelId`        | number                           | 使用的槽位 ID       |
| `status`         | `PENDING` \| `RUNNING` \| `SUCCEEDED` \| `FAILED` \| `CANCELED` | 任务状态 |
| `clientRequestId`| string \| null                   | 幂等键              |
| `prompt`         | string                           | 图片生成提示词      |
| `promptHash`     | string                           | prompt 的 SHA-256   |
| `metadata`       | AiMetadata \| null               | 业务关联引用        |
| `options`        | object \| null                   | 图片参数（size/quality/n） |
| `result`         | object \| null                   | 生成结果（urls 等） |
| `errorCode`      | string \| null                   | 失败错误码          |
| `errorMessage`   | string \| null                   | 错误摘要            |
| `startedAt`      | string \| null                   | 开始时间            |
| `finishedAt`     | string \| null                   | 完成时间            |
| `createdAt`      | string                           | 创建时间            |
| `updatedAt`      | string                           | 更新时间            |

### AiMetadata

| 字段               | 类型           | 说明             |
| ------------------ | -------------- | ---------------- |
| `novelId`          | number         | 关联作品 ID      |
| `chapterId`        | number         | 关联章节 ID      |
| `promptTemplateId` | number         | 关联提示词模板 ID |
| `scene`            | string         | 场景标识         |

### AiModelSlotAdmin（管理端槽位）

| 字段                 | 类型                            | 说明                               |
| -------------------- | ------------------------------- | ---------------------------------- |
| `id`                 | number                          | 槽位 ID                            |
| `displayName`        | string                          | 面向前端展示名                     |
| `description`        | string                          | 描述                               |
| `tags`               | string[]                        | 受控标签集合                       |
| `sortOrder`          | number                          | 排序序号                           |
| `enabled`            | boolean                         | 是否启用                           |
| `failoverStrategy`   | `SEQUENTIAL` \| `ROUND_ROBIN`   | 账号调度策略                       |
| `defaultTemperature` | number \| null                  | 推荐温度                           |
| `boundModelId`       | number \| null                  | 绑定的模型定义 ID                  |
| `boundModel`         | ModelDefinitionAdmin \| null    | 绑定的底层模型详情（扁平返回）     |
| `status`             | `SMOOTH` \| `CONGESTED` \| `OUTAGE` | 聚合连通性                    |
| `createdAt`          | string                          | 创建时间                           |
| `updatedAt`          | string                          | 更新时间                           |

### ModelDefinitionAdmin（管理端模型定义）

| 字段                | 类型                              | 说明                               |
| ------------------- | --------------------------------- | ---------------------------------- |
| `id`                | number                            | 模型 ID                            |
| `identifier`        | string                            | 底层 API 模型名                    |
| `displayName`       | string                            | 管理端显示名                       |
| `platform`          | string                            | 协议族                             |
| `endpoint`          | string                            | 端点类型                           |
| `contextWindow`     | number                            | 上下文窗口 token 数                |
| `maxOutputTokens`   | number                            | 最大输出 token 数                  |
| `defaultTemperature`| number                            | 默认温度                           |
| `reasoningEffort`   | `NONE` \| `LOW` \| `MEDIUM` \| `HIGH` | 推理强度                     |
| `extraParams`       | object \| null                    | 额外参数                           |
| `capabilities`      | string[]                          | 能力标签：`TEXT_CHAT` / `TOOL_CALLING` / `STREAMING` / `IMAGE_GENERATION` / `MULTI_MODAL_INPUT` / `JSON_MODE` |
| `enabled`           | boolean                           | 是否可被槽位绑定                   |
| `createdAt`         | string                            | 创建时间                           |
| `updatedAt`         | string                            | 更新时间                           |

### ProviderAccountAdmin（管理端访问账号）

| 字段            | 类型             | 说明                                 |
| --------------- | ---------------- | ------------------------------------ |
| `id`            | number           | 账号 ID                              |
| `platform`      | string           | 协议族                               |
| `label`         | string           | 管理端显示名                         |
| `baseUrl`       | string           | 接口基础地址                         |
| `apiKeyMasked`  | string           | 掩码形式，如 `sk-****abcd`；明文永不返回 |
| `extraHeaders`  | object \| null   | 额外请求头                           |
| `extraParams`   | object \| null   | 额外参数                             |
| `priority`      | number           | SEQUENTIAL 策略排序                   |
| `weight`        | number           | ROUND_ROBIN 权重                     |
| `enabled`       | boolean          | 是否启用                             |
| `createdAt`     | string           | 创建时间                             |
| `updatedAt`     | string           | 更新时间                             |

### ModelAccountBindingAdmin（管理端模型账号绑定）

| 字段       | 类型                            | 说明                    |
| ---------- | ------------------------------- | ----------------------- |
| `modelId`  | number                          | 模型 ID                 |
| `accountId`| number                          | 账号 ID                 |
| `priority` | number                          | 当前模型下的候选顺序    |
| `enabled`  | boolean                         | 是否启用                |
| `account`  | ProviderAccountAdmin            | 扁平嵌入账号摘要        |
| `health`   | ProviderAccountHealthAdmin \| null | 扁平嵌入健康度摘要   |

### ProviderAccountHealthAdmin（管理端健康度）

| 字段                 | 类型           | 说明                     |
| -------------------- | -------------- | ------------------------ |
| `modelId`            | number         | 模型 ID                  |
| `accountId`          | number         | 账号 ID                  |
| `successCount`       | number         | 窗口内成功次数           |
| `failureCount`       | number         | 窗口内失败次数           |
| `p95LatencyMs`       | number \| null | 窗口内 p95 延迟          |
| `consecutiveFailures`| number         | 连续失败计数             |
| `circuitOpenUntil`   | string \| null | 熔断截止时间             |
| `lastSuccessAt`      | string \| null | 最近成功时间             |
| `lastFailureAt`      | string \| null | 最近失败时间             |
| `lastErrorCode`      | string \| null | 最近错误归类码           |
| `updatedAt`          | string         | 更新时间                 |

### PresetOption

| 字段           | 类型                     | 说明                      |
| -------------- | ------------------------ | ------------------------- |
| `key`          | string                   | 占位变量名，如 `"genre"`  |
| `label`        | string                   | 中文标签，如 `"题材"`     |
| `type`         | `"text"` \| `"select"` \| `"textarea"` | 控件类型  |
| `options`      | string[] \| null         | 候选项列表（select 时）   |
| `placeholder`  | string \| null           | 占位提示文本              |
| `required`     | boolean                  | 是否必填，默认 false      |
| `defaultValue` | string \| null           | 默认值                    |

### PromptTemplateVersion

| 字段              | 类型                   | 说明                        |
| ----------------- | ---------------------- | --------------------------- |
| `id`              | number                 | 版本 ID                     |
| `version`         | number                 | 版本号                      |
| `name`            | string                 | 该版本的提示词名称快照      |
| `content`         | string                 | 该版本的提示词内容快照      |
| `presetOptions`   | PresetOption[] \| null | 该版本的预制选项快照        |
| `description`     | string \| null         | 该版本的提示词介绍快照      |
| `usageGuide`      | string \| null         | 该版本的使用方法快照        |
| `changeNote`      | string \| null         | 变更说明                    |
| `createdAt`       | string                 | 快照创建时间                |

### PromptPrivacy 枚举

| 值           | 说明                               |
| ------------ | ---------------------------------- |
| `PRIVATE`    | 仅自用（仅创建者可见可用）         |
| `SHARED`     | 公开共享（所有作者可见可用）       |
| `AUTHORIZED` | 授权访问（指定用户/角色可见可用）  |

### 权限

| 角色   | 权限                       | 说明                                 |
| ------ | -------------------------- | ------------------------------------ |
| ADMIN  | `prompt.approve`           | 审核提示词                           |
| ADMIN  | `prompt.category.manage`   | 管理提示词分类                       |
| ADMIN  | `creative_tool.manage`     | 管理创意工具                         |
| ADMIN  | `ai.model.manage`          | 管理 AI 模型槽位、模型定义、Provider 账号与健康度 |
| ADMIN  | `ai.conversation.manage`   | 管理任意用户的 AI 会话               |
| ADMIN  | `ai.generation.invoke`     | 触发文本生成                         |
| ADMIN  | `ai.image.generate`        | 触发图片生成                         |
| AUTHOR | `prompt.write`             | 创建/编辑/删除自己的提示词           |
| AUTHOR | `ai.conversation.manage`   | 管理自己的 AI 会话                   |
| AUTHOR | `ai.generation.invoke`     | 触发文本生成                         |
| AUTHOR | `ai.image.generate`        | 触发图片生成                         |
