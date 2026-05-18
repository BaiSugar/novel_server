---
name: system-design
description: 对新功能、新业务域、新 API、新数据表进行实施前的系统设计与策划，产出符合本项目规则的设计方案（分层、模块化、解耦、规范化）。适用场景：用户请求"设计/策划/规划/架构/方案/拆分"某个功能、业务域、API、数据模型；或在动手写代码前需要先明确接口契约、数据模型、分层边界、依赖关系与落地步骤时。不负责直接编码，只产出可评审的设计文档与落地清单。
---

# 系统设计策划（Novel 后端）

本 skill 用于**实施前**的系统设计与策划。目标是在写代码之前，先把方案在文档层面打磨清楚，确保与项目既有规则（见 `.cursor/rules/dev.mdc` 与 `docs/project-structure.md`）完全一致：分层、模块化、解耦、规范化。

**边界**：本 skill 只产出设计方案文档，不直接写业务代码；编码阶段由 `code-review` skill 或普通实现流程衔接。

## 何时应用

满足以下任一条件即应用本 skill：

- 用户要求"设计/策划/规划/架构/方案/拆分"某个功能、业务域、API、数据模型
- 新增业务域（new domain）、新增 API 端点、新增数据表或字段、新增插件、新增审计类别
- 用户描述了一个较大的需求，但尚未明确接口、数据模型或分层边界
- 现有设计需要重构、拆分、合并、解耦

## 核心原则（必须遵守）

本项目的设计决策必须同时通过以下检查，任意一条不满足视为方案不过关：

1. **分层正确**：请求只能 `plugins → controller → service → prisma`，绝不跨层；service 不感知 HTTP，controller 不碰 Prisma
2. **模块化**：按业务域划分 `service/<domain>/` 与 `controller/v1/<domain>/`，一个业务域一个目录；domain 之间只通过 service 层显式依赖，不共享内部状态
3. **解耦**：service 不依赖 controller/plugins；lib 不感知任何业务域；utils 不依赖 service/controller；跨域复用走 service 公开函数或 `app/common/`
4. **规范化**：文件命名 `*.ctrl.ts` / `*.service.ts` / `*.plug.ts`；响应统一用 `$g.success()` + `throw new HttpError()`；鉴权通过 `requireAuth / requireRole / requirePermission` 宏；所有导出函数必须写 JSDoc 并有显式返回类型
5. **禁止硬编码**：配置进 `.env` + `app/config/`；错误消息通过 `HttpError` 抛出；业务枚举进 Prisma enum 或 `app/common/`
6. **同步文档**：新增/删除/移动文件后必须更新 `docs/project-structure.md`；新增业务域或审计类别时必须同步 `AUDIT_REGISTRY` 与 `AuditCategory`；新增 controller 文件后需执行 `bun run generate_script`

## 工作流（五阶段）

设计工作按以下五个阶段推进，每个阶段必须有明确产出才能进入下一阶段。详细步骤与阶段产出见 [workflow.md](workflow.md)。

```
需求澄清 → 数据模型设计 → 接口契约设计 → 分层与模块拆分 → 落地清单
  (1)          (2)            (3)           (4)           (5)
```

1. **需求澄清**：明确业务目标、使用者角色、输入输出、非功能约束（鉴权、审计、限流、幂等）
2. **数据模型设计**：Prisma 实体、字段类型、索引、外键、枚举、迁移策略
3. **接口契约设计**：HTTP 方法 + 路径、请求/响应 schema、错误码、权限、审计动作
4. **分层与模块拆分**：controller/service/lib/utils 文件清单、函数签名、跨域依赖
5. **落地清单**：按文件逐项列出改动、文档同步项、需要执行的命令、风险点

## 产出格式

设计文档使用统一模板（见 [templates.md](templates.md)），核心章节如下：

```markdown
# <功能名> 设计方案

## 1. 需求摘要
## 2. 数据模型
## 3. 接口契约
## 4. 分层与文件清单
## 5. 依赖与解耦分析
## 6. 落地步骤
## 7. 风险与权衡
```

产出默认直接呈现在对话中；如果用户明确要求落盘，再写入 `docs/designs/<domain>.md`（此路径不属于既定结构，落盘前先与用户确认）。

## 设计质量检查

完成设计后，对照 [checklist.md](checklist.md) 逐项自检。任何一项"否"都必须在方案中显式说明原因或修正方案。主要维度：

- 分层与依赖方向
- 模块化与目录结构
- 命名与响应规范
- 鉴权与权限
- 审计与日志
- 文档同步项

## 与既有 skill 的边界

- 本 skill：**实施前**的策划与设计，产出可评审的方案
- `code-review` skill：**实施后**的代码审查，对照规则查问题
- 两者互补：设计阶段确定"要做什么、怎么分层"，审查阶段验证"是否按规划做了、是否违反规则"

## 参考资料

- [`.cursor/rules/dev.mdc`](../../rules/dev.mdc)：项目总规则（技术栈、分层、鉴权、响应、审计）
- [`docs/project-structure.md`](../../../docs/project-structure.md)：目录结构与业务域状态
- [`docs/api.md`](../../../docs/api.md)：API 对接文档（接口契约参考）
- [`docs/ai-model.md`](../../../docs/ai-model.md)：AI 模型模块设计（设计文档范例）