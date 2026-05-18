# 设计文档模板

设计方案默认使用此模板呈现。所有小节均为**必填**，没有内容的小节写"无"而不是删除。

---

```markdown
# <功能名> 设计方案

> 范围：<一句话描述>
> 业务域：<domain，对应 service/controller 目录名>
> 版本：v1
> 状态：draft / reviewing / approved

---

## 1. 需求摘要

- **业务目标**：<一句话>
- **使用者**：<ADMIN / AUTHOR / 公开>
- **核心操作**：<创建 / 读取 / 更新 / 删除 / 其他动作>
- **关键约束**：
  - 鉴权：<是否登录 / 是否需要角色或权限>
  - 审计：<是否记录 / 类别 / 动作>
  - 限流：<是否需要 / 策略>
  - 幂等：<是否幂等 / 如何保证>
  - 非功能：<数据量 / 并发 / 延迟 / 加密>

---

## 2. 数据模型

### 2.1 实体 `<EntityName>`

| 字段 | 类型 | 可空 | 默认 | 唯一/索引 | 说明 |
|------|------|------|------|----------|------|
| id | Int (自增) | 否 | — | PK | 主键 |
| userId | Int | 否 | — | INDEX, FK→User | 归属用户 |
| ... | ... | ... | ... | ... | ... |
| createdAt | DateTime | 否 | now() | — | 创建时间 |
| updatedAt | DateTime | 否 | @updatedAt | — | 更新时间 |

**关系**：
- `User` 1 ─ * `<EntityName>`，`onDelete: Cascade`

**枚举**（如有）：
- `<EnumName>`: `VALUE_A` / `VALUE_B` / `VALUE_C`

**Prisma 片段**：

\`\`\`prisma
model <EntityName> {
  id        Int      @id @default(autoincrement())
  userId    Int
  // ...
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
\`\`\`

### 2.2 迁移策略

- **类型**：新表 / 加列 / 改列 / 删列
- **破坏性**：是 / 否
- **回填**：<是否需要、如何回填>

---

## 3. 接口契约

路由前缀：`/v1/<domain>`

| # | 方法 | 路径 | 鉴权 | 审计 | 说明 |
|---|------|------|------|------|------|
| 1 | POST | `/<resource>` | requirePermission | novel.create | 创建 |
| 2 | GET | `/<resource>` | requireAuth | — | 列表（分页） |
| 3 | GET | `/<resource>/:id` | requireAuth | — | 详情 |
| 4 | PATCH | `/<resource>/:id` | requirePermission | novel.update | 更新 |
| 5 | DELETE | `/<resource>/:id` | requirePermission | novel.delete | 删除 |

### 3.1 `POST /<resource>`

- **鉴权**：`requirePermission('novel.write')`
- **body**：
  - `name`: string, 1-255
  - `type`: 'NOVEL' | 'SCRIPT'，可选
- **响应 data**：`Entity`
- **错误**：
  - 409 CONFLICT：名称重复
  - 422 VALIDATION_ERROR：schema 校验失败

（每个端点重复此结构）

---

## 4. 分层与文件清单

### 4.1 Controller

| 文件 | 新增/修改 | 导出 | 依赖 |
|------|-----------|------|------|
| `app/controller/v1/<domain>/<name>.ctrl.ts` | 新增 | default Elysia 实例 | `<Service>` |

### 4.2 Service

| 文件 | 函数 | 签名 |
|------|------|------|
| `app/service/<domain>/<name>.service.ts` | `create` | `(input: CreateInput, userId: number) => Promise<Entity>` |
| 同上 | `list` | `(userId: number, query: ListQuery) => Promise<Paged<Entity>>` |
| 同上 | `detail` | `(id: number, userId: number) => Promise<Entity>` |
| 同上 | `update` | `(id: number, input: UpdateInput, userId: number) => Promise<Entity>` |
| 同上 | `remove` | `(id: number, userId: number) => Promise<void>` |

### 4.3 Common / Lib / Utils

| 文件 | 变更 |
|------|------|
| `app/common/permission.ts` | 新增 `Permission` 值：`<x.y>` |
| `app/common/schemas.ts` | 导出 `<EntitySchema>` |

### 4.4 Plugins

| 文件 | 变更 |
|------|------|
| `app/plugins/controller.plug.ts` | `AUDIT_REGISTRY` 追加 `{ prefix, category, methods }` |
| `app/lib/audit.ts` | `AuditCategory` 扩展（如有） |

---

## 5. 依赖与解耦分析

- **跨域依赖**：<本 domain 是否调用了其他 domain 的 service；如有，列出并说明理由>
- **循环依赖风险**：<是否存在 A → B → A 的风险>
- **对外暴露**：<本 service 的公开函数清单；调用者仅能通过这些函数使用>
- **私有状态**：<不向外暴露的内部辅助函数>

---

## 6. 落地步骤

按顺序执行，每一步可独立验证：

1. 修改 `prisma/schema.prisma`，执行 `bunx --bun prisma migrate dev --name <x>`
2. 执行 `bun run prisma_generate`
3. 扩展 `app/common/permission.ts`（如有）
4. 实现 `app/service/<domain>/<name>.service.ts`
5. 实现 `app/controller/v1/<domain>/<name>.ctrl.ts`
6. 执行 `bun run generate_script` 重新生成路由
7. 更新 `AUDIT_REGISTRY`（如有）
8. 更新 `docs/project-structure.md` 与 `docs/api.md`
9. 执行 `bunx --bun tsc --noEmit` 与 `bun run fix`
10. 手工验证：<列出关键路径>

---

## 7. 风险与权衡

| 风险 | 影响 | 缓解 |
|------|------|------|
| <例：迁移导致历史数据不符合新约束> | <中/高> | <先回填再收紧约束> |
| <例：热点查询无索引> | <中> | <第一版加基础索引，后续观测再调整> |

**已考虑但未采纳的方案**：

- <方案 A>：<为什么不采用>
- <方案 B>：<为什么不采用>
```

---

## 填写要点

1. **小节不要删除**：没有内容写"无"，便于评审时快速判断是否遗漏
2. **字段表逐字段列出**：不要用"etc."或省略号
3. **接口契约必须给错误码**：漏写错误场景会导致实现时临时编造
4. **落地步骤可直接粘贴执行**：命令要完整，不要写"运行迁移"这种含糊描述
5. **风险小节不留空**：至少写一条已知风险或"经评估无明显风险"