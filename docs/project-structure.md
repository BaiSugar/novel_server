# 项目结构

> 最后更新：2026-05-10  
> **每次新增/删除/移动文件或文件夹后，必须同步更新本文档。**

```
novel/                              # 项目根
├── app/                            # 应用主目录
│   ├── common/                     # 全局模块（$g 注册源）
│   │   ├── index.ts                 # success() / error() / ctrl() / 全局导出
│   │   ├── schemas.ts               # TypeBox 数据模型（自动注册为 elysia.model）
│   │   ├── schemaDerive.ts          # 响应模型类型推导 ResType / ResSchemaFun
│   │   └── permission.ts            # 角色-权限静态映射
│   │
│   ├── controller/                 # 控制器层 - 目录名 = URL 前缀
│   │   ├── v1/                      # API v1 版本
│   │   │   ├── v1.ctrl.ts           #   父级占位（提供 /v1 前缀）
│   │   │   ├── auth/                #   认证模块 → /v1/auth/*
│   │   │   │   └── auth.ctrl.ts     #     register / login / refresh / logout / me
│   │   │   ├── user/                #   用户模块 → /v1/user/*
│   │   │   │   └── user.ctrl.ts     #     list / :id（骨架）
│   │   │   └── novel/               #   作品模块 → /v1/novel/*
│   │   │       ├── novel.ctrl.ts    #     作品 CRUD + 归档 + 回收站
│   │   │       └── chapter.ctrl.ts  #     章节 CRUD + 排序
│   │   │   └── prompt/              #   提示词模块 → /v1/prompts/*
│   │   │       └── prompt.ctrl.ts   #     提示词 CRUD + 审核 + 版本管理
│   │   └── test/                    # 测试模块（开发期保留）
│   │       ├── test.ctrl.ts
│   │       └── test/
│   │           └── testsub/
│   │               └── test.ctrl.ts
│   │
│   ├── service/                    # 业务逻辑层 - 按业务域分目录
│   │   ├── auth/
│   │   │   └── auth.service.ts      # register / login / refresh / logout / getMe
│   │   ├── user/
│   │   │   └── user.service.ts      # list / detail（骨架）
│   │   └── novel/
│   │       ├── novel.service.ts     # 作品 CRUD + 归档/回收站/恢复/字数统计
│   │       └── chapter.service.ts   # 章节 CRUD + 排序
│   │   └── prompt/
│   │       └── prompt.service.ts    # 提示词 CRUD + 审核 + 版本快照 + 恢复
│   │
│   ├── lib/                        # 基础设施（扁平，不感知业务）
│   │   ├── prisma.ts                # Prisma 客户端单例（MariaDB 适配器）
│   │   ├── logger.ts                # 自研日志库（按天轮转、ANSI 彩色 stdout）
│   │   ├── audit.ts                 # 审计日志（分业务类别、年度 JSON 行日志）
│   │   ├── httpError.ts             # HTTP 业务错误类 + 状态码→错误码映射
│   │   ├── redis.ts                 # Redis 客户端（未启用降级为裸 bun redis）
│   │   └── error.ts                 # 全局未捕获异常处理
│   │
│   ├── plugins/                    # Elysia 插件（扁平，按顺序挂载）
│   │   ├── index.plug.ts            # 插件入口：cors + openapi + static + controller(routes)
│   │   ├── controller.plug.ts       # 控制器插件：路由挂载 + 请求/响应日志 + 错误拦截
│   │   ├── auth.plug.ts             # 鉴权插件：Bearer 解析 + 权限宏
│   │   ├── macro.plug.ts            # 通用宏插件：res() 统一响应格式校验
│   │   ├── ratelimit.plug.ts        # 限流插件：IP + 路径粒度请求频率控制
│   │   └── schemas.plug.ts          # 数据模型注册插件
│   │
│   ├── utils/                      # 工具函数（扁平）
│   │   ├── password.ts              # Argon2id 密码哈希/校验
│   │   ├── token.ts                 # JWT 签发/验证 + Refresh Token 生成/哈希
│   │   ├── chapterContentCodec.ts   # 章节正文压缩加密/解密解压
│   │   ├── wordCount.ts             # 章节字数字符统计（去空白）
│   │   ├── file.ts                  # 文件流写入 + glob 路径树
│   │   ├── watch.ts                 # 目录监听（路由热更新）
│   │   └── menu-ui.ts               # CLI 菜单工具
│   │
│   ├── config/
│   │   ├── database.ts              # 基于 .env 生成数据库连接串
│   │   └── encryption.ts            # 章节正文加密密钥配置
│   │
│   ├── bootstrap/
│   │   ├── migrate.ts               # 自动应用 Prisma 迁移
│   │   └── admin.ts                 # 首次启动创建管理员
│   │
│   ├── cluster.ts                   # 集群入口（多进程 + 熔断）
│   └── index.ts                     # 单进程入口
│
├── prisma/
│   ├── schema.prisma                # Prisma 数据模型
│   └── migrations/                  # 迁移文件
│
├── docs/
│   ├── api.md                       # API 对接文档
│   ├── security.md                  # JWT 即时撤销机制详细文档
│   └── project-structure.md         # 本文件
│
├── support/
│   ├── script/
│   │   ├── index.ts                  # 路由生成器入口（generate / watcher）
│   │   ├── routes.ts                 # 自动路由生成核心
│   │   └── batchExport.ts            # 模型批量导出生成
│   └── generated/
│       ├── routes.ts                 # 自动生成的路由文件（勿手动编辑）
│       └── schema.ts                 # 自动生成的 schema 导出
│
├── .cursor/
│   ├── rules/                        # Cursor 规则
│   └── skills/                       # 代理技能
│       └── code-review/              # 后端代码审查
│           ├── SKILL.md
│           ├── checklist.md
│           └── examples.md
│
├── .env                              # 环境变量
├── package.json                      # 依赖与脚本
├── tsconfig.json                     # TypeScript 配置
├── biome.jsonc                       # Biome 格式化配置
├── bunfig.toml                       # Bun 配置
├── prisma.config.ts                  # Prisma 配置
└── AGENTS.md                         # 项目总参考文档
```

## 分层原则

| 目录          | 组织方式              | 拆分触发条件                                     |
| ------------- | --------------------- | ------------------------------------------------ |
| `controller/` | 按版本 + 业务域分目录 | 每个业务域一个子目录，每个子资源一个 `*.ctrl.ts` |
| `service/`    | 按业务域分目录        | 每个业务域一个子目录                             |
| `lib/`        | 扁平                  | 固定 5~8 个基础设施文件                          |
| `plugins/`    | 扁平                  | 固定 5~8 个插件                                  |
| `utils/`      | 扁平                  | 不同类型工具拆                                   |
| `common/`     | 扁平                  | 全局注册源                                       |
| `config/`     | 扁平                  | 一个环境维度一个文件                             |

## 版本管理

API 版本通过 `controller/` 下的目录名控制：

```
controller/v1/ → 路由 /v1/*
controller/v2/ → 路由 /v2/*（未来）
```

新增版本时在 `controller/` 下创建 `vN/` 目录，只放有变化的端点。

## 业务域状态

| 域      | 路由      | controller           | service              | 状态   |
| ------- | --------- | -------------------- | -------------------- | ------ |
| 认证    | /v1/auth  | v1/auth/auth.ctrl.ts | auth/auth.service.ts | 已完成 |
| 用户    | /v1/user  | v1/user/user.ctrl.ts | user/user.service.ts | 骨架   |
| 作品    | /v1/novel | v1/novel/            | novel/               | 已完成 |
| 提示词  | /v1/prompts | v1/prompt/prompt.ctrl.ts | prompt/prompt.service.ts | 已完成 |
| AI 生成 | —         | —                    | —                    | 待开发 |
