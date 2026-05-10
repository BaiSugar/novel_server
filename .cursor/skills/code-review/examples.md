# 审查示例

## 硬编码

### 错误：错误消息直接写死在 service 中

```typescript
// ❌ service/novel/novel.service.ts
export async function detail(bookId: number) {
  const book = await prisma.novelBook.findUnique({ where: { id: bookId } });
  if (!book) {
    return { code: "NOT_FOUND", message: "作品不存在" };  // 不应返回裸对象
  }
  return book;
}
```

### 正确：通过 HttpError 统一抛出

```typescript
// ✅ service/novel/novel.service.ts
import { HttpError } from "@/app/lib/httpError";

export async function detail(bookId: number) {
  const book = await prisma.novelBook.findUnique({ where: { id: bookId } });
  if (!book) throw new HttpError("作品不存在", 404);
  return book;
}
```

### 错误：配置值硬编码

```typescript
// ❌ app/utils/token.ts
const expiresIn = 900;  // 硬编码
```

### 正确：通过环境变量获取

```typescript
// ✅ app/utils/token.ts
export function getAccessTokenExpiresIn(): number {
  return Number(process.env.ACCESS_TOKEN_EXPIRES_IN ?? 900);
}
```

---

## 无意义内容

### 错误：无用注释

```typescript
// ❌
const name = book.name;  // 获取书名
const result = await prisma.novelBook.findMany(...);  // 查询数据库
```

### 错误：仅转发调用的函数

```typescript
// ❌ 没有额外逻辑，只是转调用
export function getBook(id: number) {
  return findBookById(id);
}
```

### 正确：有独立业务语义

```typescript
// ✅ 包含鉴权检查
export async function detail(bookId: number, userId: number) {
  const book = await prisma.novelBook.findFirst({
    where: { id: bookId, userId },
  });
  if (!book) throw new HttpError("作品不存在", 404);
  return book;
}
```

---

## OOT（偏离任务）

### 错误：任务要求「创建作品 CRUD」，却加了 AI 生成接口

```typescript
// ❌ 任务没要求 createNovelWithAI
export async function createNovelWithAI(prompt: string) { ... }
```

### 错误：创建了 8 行的小函数独立成文件

```typescript
// ❌ app/service/novel/helpers.ts
export function formatBookName(name: string) {
  return name.trim();
}
```

---

## 项目结构同步

### 正确做法

新增 `app/service/novel/chapter.service.ts` 后，在 `docs/project-structure.md` 中更新：

```text
│   └── novel/
│       ├── novel.service.ts      # 作品 CRUD
│       └── chapter.service.ts    # 章节 CRUD  ← 新增
```

---

## JSDoc 与类型安全

### 错误：缺少 JSDoc、缺少返回类型

```typescript
// ❌
export async function login(input: LoginInput) {
  // ...
}
```

### 正确：完整 JSDoc 和返回类型

```typescript
// ✅
/**
 * 登录账号。
 * @param input 登录入参。
 * @returns 认证结果。
 */
export async function login(input: LoginInput): Promise<AuthResult> {
  // ...
}
```

### 错误：Controller 缺少参数校验

```typescript
// ❌ 没有 body schema 校验
.post("books", async ({ body }) => {
  return $g.success(await NovelService.create(body));
}, { requireAuth: true })
```

### 正确：完整的 Elysia schema

```typescript
// ✅
.post("books", async ({ body }) =>
  $g.success(await NovelService.create(body)),
  {
    requireAuth: true,
    body: t.Object({
      name: t.String({ minLength: 1, maxLength: 255 }),
      type: t.Optional(t.Union([t.Literal("NOVEL"), t.Literal("SCRIPT")])),
    }),
  },
)
```

---

## Controller / Service 分层

### 错误：Controller 中直接操作 Prisma

```typescript
// ❌ controller 中直接查数据库
.get("books/:bookId", async ({ params }) => {
  const book = await prisma.novelBook.findUnique({
    where: { id: Number(params.bookId) },
  });
  return $g.success(book);
})
```

### 正确：Controller 调用 Service

```typescript
// ✅
import * as NovelService from "@/app/service/novel/novel.service";

.get("books/:bookId", async ({ currentUser, params }) =>
  $g.success(await NovelService.detail(Number(params.bookId), currentUser!.id)),
)
```

---

## 响应格式一致性

### 错误：手动构建错误响应

```typescript
// ❌ controller 中返回裸错误对象
.set.status = 404;
return { code: "NOT_FOUND", message: "未找到" };
```

### 正确：通过 HttpError 统一处理

```typescript
// ✅ service 中抛错，controller.plug onError 统一拦截
throw new HttpError("作品不存在", 404);
```