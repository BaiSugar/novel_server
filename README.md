[English](./README-en.md) | [中文](./README.md)

# Novel 后端

Novel 是一个面向 AI 网文写作平台的后端服务，负责用户鉴权、作品与章节管理、提示词体系、上下文素材库、备忘录、AI 模型槽位管理，以及统一的文本 / 图片生成任务编排。

项目基于 Bun + Elysia + Prisma 构建，使用 MySQL / MariaDB 作为主要数据存储，并以分层服务结构承载复杂写作业务。

## 核心能力

- **账号与权限**：用户注册、登录、Refresh Token 轮换、角色权限校验。
- **作品创作管理**：作品、章节、排序、归档、回收站、章节正文加密存储。
- **提示词体系**：提示词分类、模板变量、版本快照、审核、收藏。
- **上下文素材库**：角色库、词条库、作品素材绑定、单层文件夹归纳。
- **备忘录**：全局备忘录与作品备忘录，用于记录长期偏好、创作计划、伏笔和约束。
- **AI 模型管理**：模型槽位、供应商账号、模型绑定、健康状态与故障处理。
- **AI 生成编排**：统一 SSE 生成入口，支持 `STANDARD` 单轮生成与 `AGENT` 工具循环。
- **编辑器写作场景**：行内续写、剧情建议、选区扩写、章节改文提案、素材同步。
- **图片生成任务**：图片生成请求、任务状态与结果管理。
- **日志与审计**：请求日志、响应日志、审计日志、错误统一封装。

## 技术栈

| 层 | 技术 |
| --- | --- |
| Runtime | Bun |
| Web 框架 | Elysia 1.4.x |
| ORM | Prisma 7.x |
| 数据库 | MySQL / MariaDB |
| 缓存 | Redis，可选 |
| 类型检查 | TypeScript |
| 代码风格 | Biome |

## 架构概览

```text
请求 → plugins 链 → controller → service → Prisma → MySQL
                         ↑                    ↑
                       $g              基础设施与业务服务
```

- `plugins/`：鉴权、响应宏、限流、OpenAPI、静态资源、自动路由挂载。
- `controller/`：薄控制层，只做参数校验、鉴权宏声明和响应组装。
- `service/`：业务核心层，承载数据校验、状态转换、模型调用、工具执行和数据库操作。
- `lib/`：Prisma、日志、审计、错误、Redis 等基础设施。
- `utils/`：Token、密码、章节内容编解码、SSE、字数统计等通用工具。
- `docs/`：API、AI 模型、AI 生成、项目结构和安全机制文档。

## 主要目录

```text
app/
├── controller/          # API 控制器，按版本和业务域组织
├── service/             # 业务服务，按业务域组织
├── plugins/             # Elysia 插件链
├── lib/                 # 基础设施
├── utils/               # 通用工具
├── config/              # 环境配置
└── bootstrap/           # 启动初始化

prisma/                  # Prisma schema、迁移与初始化 SQL
docs/                    # 对接文档和设计文档
support/                 # 自动路由与生成脚本
```

完整目录说明见 [`docs/project-structure.md`](./docs/project-structure.md)。

## 快速开始

### 1. 安装依赖

```bash
bun install
```

### 2. 配置环境变量

复制并配置项目所需的 `.env`，重点包括：

- 数据库连接信息
- `JWT_SECRET`
- 章节正文加密密钥
- 可选 Redis 地址
- 首次启动管理员配置

### 3. 初始化数据库

```bash
bunx --bun prisma generate
bunx --bun prisma migrate dev
```

生产环境可使用：

```bash
bunx --bun prisma migrate deploy
bunx --bun prisma generate
```

### 4. 启动开发服务

```bash
bun run dev
```

## 常用命令

```bash
bun run dev                         # 开发模式，监听路由生成与服务启动
bun run build                       # 构建 Bun 产物
bun run start                       # 生产模式启动
bun run start-hot                   # 生产模式热更新启动
bun run generate_script             # 生成自动路由
bun run prisma_generate             # 生成 Prisma Client
bun run generate_prisma_migrate_dev # 开发环境迁移
bun run prisma_generate_migrate_deploy # 生产环境迁移并生成 Client
bun run prisma_studio               # 打开 Prisma Studio
bun run fix                         # Biome 格式化与修复
```

## API 与系统文档

- [`docs/api.md`](./docs/api.md)：前端 API 对接文档。
- [`docs/ai-model.md`](./docs/ai-model.md)：AI 模型槽位、账号、绑定和健康状态设计。
- [`docs/ai-generation.md`](./docs/ai-generation.md)：AI 文本 / 图片生成、SSE、AGENT 工具链和编辑提案设计。
- [`docs/security.md`](./docs/security.md)：JWT 即时撤销机制。
- [`docs/project-structure.md`](./docs/project-structure.md)：项目目录和分层原则。

## AI 生成链路

文本生成统一使用：

```text
POST /v1/ai/generation/stream
```

生成任务通过 SSE 返回事件，核心事件包括：

- `job.created`
- `message.delta`
- `message.reasoning_delta`
- `tool.call`
- `tool.result`
- `edit.proposal`
- `message.completed`
- `job.succeeded`
- `job.failed`

后端负责模型上下文构建、历史裁剪、工具调用、敏感内容脱敏、章节编辑提案校验、素材同步和任务状态落库。

## 开发原则

- controller 保持薄层，业务逻辑放入 service。
- 用户输入、模型输出、工具结果和素材正文均按不可信数据处理。
- 提示词正文、章节正文、工具结果正文等敏感内容默认不对前端暴露。
- 新增业务域时同步审计日志配置。
- 新增、删除或移动文件夹后同步更新 `docs/project-structure.md`。

## 许可证

本项目基于 [GNU Affero General Public License v3.0](./LICENSE) 开源。

## 致谢

感谢 [Elysia](https://elysiajs.com/) 为本项目提供高性能、类型友好的 Bun Web 框架基础。

## 友情链接

 [linux.do 社区](https://linux.do/) 对项目交流与支持。