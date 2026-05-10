# 后端 API 对接文档

> 最后更新：2026-05-10  
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
| `keyword`  | string                                              | 按名称/介绍模糊搜索 |

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

> 非作者本人查看时，`content` 字段不返回（`presetOptions` 用于前端渲染输入表单，始终返回）。前端仅在编辑模式（作者本人操作）下获取完整提示词内容。

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
| `usageGuide`   | string \| null                                      | 使用方法     |
| `isApproved`   | boolean                                             | 是否通过审核 |
| `versionCount` | number                                              | 版本数量     |
| `createdAt`    | string                                              | 创建时间     |
| `updatedAt`    | string                                              | 更新时间     |

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

| 角色   | 权限              | 说明                          |
| ------ | ----------------- | ----------------------------- |
| ADMIN  | `prompt.approve`  | 审核提示词                    |
| AUTHOR | `prompt.write`    | 创建/编辑/删除自己的提示词    |
| AUTHOR | `prompt.read`     | 查看公开和自己有权限的提示词  |
