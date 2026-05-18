# 设计质量检查清单

对照本清单逐项自检。对"否"的项，必须在方案中显式说明原因或修正方案；不允许静默跳过。

---

## 1. 分层与依赖方向

- [ ] controller 不直接操作 Prisma
- [ ] controller 不包含业务逻辑（循环、条件分支、数据转换）
- [ ] service 不 import 任何 `elysia` 相关类型（`Context`、`set`、`cookie`）
- [ ] service 不 import controller 文件
- [ ] lib 不 import service / controller / plugins
- [ ] utils 不 import service / controller / plugins
- [ ] plugins 只在需要时 import service（鉴权类插件可引用 `auth.service`）
- [ ] 依赖方向单向：`plugins ← controller ← service ← lib / utils`

---

## 2. 模块化与目录结构

- [ ] 新增业务域有独立的 `service/<domain>/` 与 `controller/v1/<domain>/` 目录
- [ ] 一个业务域内的多个资源拆成多个 `*.ctrl.ts` / `*.service.ts`，不塞进同一文件
- [ ] 不创建 `<10 行、无独立业务语义`的小函数独立成文件
- [ ] 不创建空目录或"以后会用"的占位文件
- [ ] 跨域复用走 service 公开函数，不直接读对方 Prisma 表
- [ ] `docs/project-structure.md` 的目录树已同步

---

## 3. 命名与代码规范

- [ ] 文件名使用既定后缀：`*.ctrl.ts` / `*.service.ts` / `*.plug.ts`
- [ ] 实体名使用 PascalCase 单数（`Novel` 不是 `Novels`）
- [ ] 字段名使用 camelCase（`userId` 不是 `user_id`）
- [ ] 枚举值使用 UPPER_SNAKE_CASE（`ACTIVE` / `BANNED`）
- [ ] 所有导出函数均有 JSDoc 注释
- [ ] 所有导出函数均有显式返回类型（包括 `Promise<T>`）
- [ ] 禁止 `any` / 隐式 any
- [ ] 逻辑嵌套 ≤ 3 层

---

## 4. 响应与错误规范

- [ ] 所有成功响应通过 `$g.success(data, message?)`
- [ ] 所有错误通过 `throw new HttpError(message, status)`
- [ ] 不在 controller 手动构建错误响应对象
- [ ] 每个端点的错误场景在设计中显式列出（401/403/404/409/422）
- [ ] 不在 service 中返回 `{ code, message }` 形式的裸错误对象
- [ ] 错误消息不硬编码 HTTP 状态码文本（如 "404 Not Found"）

---

## 5. 鉴权与权限

- [ ] 每个端点都明确了鉴权要求（公开 / `requireAuth` / `requireRole` / `requirePermission`）
- [ ] 资源归属校验在 service 层完成（`where: { id, userId }`）
- [ ] 新增权限已在 `app/common/permission.ts` 的 `Permission` 联合类型与 `ROLE_PERMISSIONS` 中登记
- [ ] 角色映射遵循最小权限原则
- [ ] 不直接读 `currentUser.role` 字符串判断，使用 `hasPermission()` 或 `requirePermission` 宏

---

## 6. 数据模型

- [ ] 每个表都有 `createdAt` / `updatedAt`（除非有特殊理由）
- [ ] 外键关系明确指定 `onDelete` 策略
- [ ] 常用查询条件有对应索引
- [ ] 唯一约束明确（UNIQUE 或复合 UNIQUE）
- [ ] 字段长度约束明确（VarChar 长度、Decimal 精度）
- [ ] 枚举值不超出业务场景所需
- [ ] 不用 JSON 字段塞结构化且常查询的数据
- [ ] 迁移策略说明是否破坏性、是否需要回填

---

## 7. 接口契约

- [ ] 路径遵循 `/v1/<domain>/<resource>` 规范
- [ ] 资源名用复数
- [ ] GET 列表端点有分页参数（`page` / `pageSize` 或 `cursor`）
- [ ] GET 列表端点返回总数或下一页游标
- [ ] POST 创建端点返回创建的完整资源（含 id）
- [ ] PATCH 部分更新 / PUT 整体替换的语义已明确
- [ ] DELETE 是硬删除还是软删除已明确
- [ ] 所有 path / query / body 参数都在 Elysia schema 中定义（最小长度、最大长度、枚举、正则）

---

## 8. 审计与日志

- [ ] 敏感/重要操作已规划审计记录（创建、更新、删除、审核、鉴权事件）
- [ ] `AUDIT_REGISTRY` 有对应 `prefix` + `category` + `methods` 条目
- [ ] 新增审计类别时 `AuditCategory` 已扩展
- [ ] 日志不会记录密码、token、明文私钥等敏感字段（`SENSITIVE_KEYS` 已覆盖）

---

## 9. 硬编码与配置

- [ ] 超时、密钥、地址、端口不写死，通过 `.env` + `app/config/`
- [ ] 错误消息不散落在 controller，统一在 service 通过 `HttpError` 抛出
- [ ] 业务枚举在 Prisma enum 或 `app/common/` 定义
- [ ] 不在代码里出现 `http://` / `https://` 的业务目标地址

---

## 10. 文档与命令同步

- [ ] 新增/删除/移动文件后将更新 `docs/project-structure.md`
- [ ] 新增 controller 文件后将执行 `bun run generate_script`
- [ ] 新增端点后将更新 `docs/api.md`
- [ ] 新增业务域、实体、重要流程时考虑是否更新 `docs/` 下专题文档
- [ ] 破坏性迁移或密钥变更已在风险小节列出

---

## 11. 解耦与可维护性

- [ ] 同一业务域内部函数可独立替换，不影响其他业务域
- [ ] service 公开函数列表清晰，内部辅助函数不 export
- [ ] 不存在 A → B → A 循环依赖
- [ ] 跨域依赖是否必要（能否通过事件或数据冗余解耦）已评估
- [ ] 方案保留合理扩展点（如策略模式、接口注入）但不过度抽象

---

## 评审意见模板

检查完成后按以下格式输出总结：

```
## 自检结果

### 通过
- <维度>: <具体说明>

### 需修正
- <维度>: <问题> → <修正方案>

### 已权衡（已知偏离但合理）
- <维度>: <偏离点> → <理由>
```