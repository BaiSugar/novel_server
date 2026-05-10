# JWT 即时撤销机制

> 最后更新：2026-05-10

---

## 设计目标

标准的 JWT 是无状态令牌，签发后无法主动撤销——只能等待过期。本系统的 `tokenVersion` 字段解决了这个问题：**密码修改或账号封禁后，已签发的 JWT 在下一次请求时立即失效**。

---

## 数据模型

### User.tokenVersion

```prisma
model User {
  /// 令牌版本号，修改密码或封禁时自增，使已签发的 JWT 立即失效。
  tokenVersion  Int  @default(1)  @map("token_version")
}
```

- 注册时默认 `tokenVersion = 1`
- 每次密码修改 → `tokenVersion += 1`
- 每次封禁/解封 → `tokenVersion += 1`（可选）

### Access Token 载荷

```typescript
interface AccessTokenPayload {
  sub: number;        // 用户 ID
  role: UserRole;     // 角色
  tv: number;         // 签发时的 tokenVersion 快照
  type: "access";     // 令牌类型
  iat: number;        // 签发时间（Unix 秒）
  exp: number;        // 过期时间（Unix 秒）
}
```

---

## 完整流转链路

### 正常请求（tokenVersion 未变）

```
前端请求 → Authorization: Bearer <accessToken>
    ↓
auth.plug derive
  → getCurrentUserByAccessToken(token)
    ↓
    1. verifyAccessToken(token)
       → 验证 HMAC 签名 → 解析 payload: { sub: 42, tv: 1, exp: ... }
    ↓
    2. SELECT id, username, role, status, tokenVersion FROM users WHERE id = 42
       → user.tokenVersion = 1
    ↓
    3. payload.tv (1) === user.tokenVersion (1) ✓
    ↓
  → currentUser = { id: 42, username: "...", role: "AUTHOR", status: "ACTIVE" }
    ↓
controller handler 正常执行 → 200 OK
```

### 撤销场景（密码修改后 tokenVersion 自增）

```
管理员/用户修改密码 → UPDATE users SET token_version = 2 WHERE id = 42
    ↓
前端发请求，仍携带旧 JWT (tv: 1)
    ↓
auth.plug derive
  → getCurrentUserByAccessToken(token)
    ↓
    1. verifyAccessToken → payload: { sub: 42, tv: 1 }
    ↓
    2. SELECT ... FROM users WHERE id = 42
       → user.tokenVersion = 2
    ↓
    3. payload.tv (1) !== user.tokenVersion (2) ✗ → return null
    ↓
  → currentUser = null
    ↓
beforeHandle: requireAuth → set.status = 401
  → 返回 { code: "UNAUTHORIZED", message: "未登录" }
```

### 前端自动恢复（Refresh Token 轮换）

```
前端收到 401
    ↓
POST /v1/auth/refresh { refreshToken: "..." }
    ↓
auth.service.refresh()
    ↓
    1. hashRefreshToken(refreshToken) → SHA-256 哈希
    2. SELECT ... FROM refresh_tokens WHERE token_hash = '...'
       （Refresh Token 不绑定 tokenVersion，通过哈希查 DB）
    ↓
    3. 检查 revokedAt / expiresAt / user.status
    ↓
    4. 读取 user.tokenVersion = 2 (当前 DB 值)
    ↓
    5. issueTokens(userId, role, tokenVersion: 2, family)
       → signAccessToken(userId, role, tv: 2)
       → 新 accessToken 携带 tv: 2
    ↓
返回 { accessToken: "...(tv:2)...", refreshToken: "...", expiresIn: 900 }
    ↓
前端替换 accessToken → 重试原请求 → 200 OK
```

---

## Refresh Token 为何不受影响

| 令牌类型 | 存储方式 | tokenVersion 绑定 | 撤销方式 |
|---------|---------|------------------|---------|
| Access Token (JWT) | 无状态（仅在前端） | **是**（载荷中的 `tv` 字段） | `tv` 不匹配即失效 |
| Refresh Token | DB 存 SHA-256 哈希 | **否**（通过哈希查找） | 标记 `revokedAt` 或过期 |

Refresh Token 的设计是"服务端存储、不可逆哈希"。刷新时直接查 DB 拿到最新 `tokenVersion`，签发的新 JWT 自然携带最新 `tv`。因此 **用户修改密码后无需重新登录**。

---

## 关键代码位置

| 职责 | 文件 | 函数/字段 |
|------|------|----------|
| User 模型定义 | `prisma/schema.prisma` | `tokenVersion  Int  @default(1)` |
| JWT 载荷类型 | `app/utils/token.ts` | `AccessTokenPayload.tv` |
| JWT 签发 | `app/utils/token.ts` | `signAccessToken(userId, role, tokenVersion)` |
| JWT 载荷类型守卫 | `app/utils/token.ts` | `isAccessTokenPayload() → 检查 tv` |
| 签发令牌对 | `app/service/auth/auth.service.ts` | `issueTokens(userId, role, tokenVersion, family?)` |
| 验证当前用户 | `app/service/auth/auth.service.ts` | `getCurrentUserByAccessToken() → 比对 payload.tv === user.tokenVersion` |
| 鉴权插件 | `app/plugins/auth.plug.ts` | `derive` 调用 `getCurrentUserByAccessToken` |
| 注册 | `app/service/auth/auth.service.ts` | 新用户默认 `tokenVersion: 1` |
| 登录 | `app/service/auth/auth.service.ts` | 从 DB 读取 `tokenVersion` 传入 `issueTokens` |
| 刷新 | `app/service/auth/auth.service.ts` | 从 `stored.user.tokenVersion` 传入 `issueTokens` |

---

## 如何触发自增

当前 `tokenVersion` 的自增逻辑尚未在代码中实现（仅做了签发和验证）。需要自增的场景及位置：

| 场景 | 位置 | SQL 伪代码 |
|------|------|-----------|
| 用户修改密码 | `auth.service.ts` 新增 `changePassword()` | `UPDATE users SET password_hash = '...', token_version = token_version + 1 WHERE id = ?` |
| 管理员封禁用户 | `user.service.ts` 新增 `banUser()` | `UPDATE users SET status = 'BANNED', token_version = token_version + 1 WHERE id = ?` |
| 管理员解封用户 | `user.service.ts` 新增 `unbanUser()` | `UPDATE users SET status = 'ACTIVE', token_version = token_version + 1 WHERE id = ?` |

注意必须用 `token_version + 1` 而非硬编码值，以支持并发自增。

---

## 安全性分析

| 威胁 | 防护效果 |
|------|---------|
| 密码被修改后旧 token 继续使用 | ✓ 下次请求立即 401 |
| 封禁用户仍用旧 token 操作 | ✓ 下次请求立即 401 |
| Refresh token 被盗用 | ✗ 不受 tokenVersion 影响，需配合撤销机制 |
| 同一 token 在多个设备使用 | ✓ 任一设备修改密码后所有设备立即失效 |
| 并发自增竞争 | ✓ 使用 `token_version + 1` SQL 原子自增 |

---

## 与普通 JWT 过期对比

| 维度 | 纯 JWT 过期 | tokenVersion 即时撤销 |
|------|-----------|---------------------|
| 密码修改后生效时间 | 最多 15 分钟（JWT 过期） | 下一次请求（秒级） |
| 封禁后生效时间 | 最多 15 分钟 | 下一次请求（秒级） |
| 需要额外存储 | 无 | User 表增加 1 个 Int |
| 额外 DB 查询 | 无 | 每次请求 1 次（已在 auth.plug 中） |
| 对前端透明 | 是 | 是（401 → refresh → 重试） |

---

## 前端对接指南

### 概述

前端只需实现标准的 JWT + Refresh Token 流程，**无需感知 `tokenVersion` 的存在**。后端通过 `tokenVersion` 撤销旧 token，前端通过 401 拦截自动换新 token——两个机制解耦。

### 1. Token 存储

| Token | 存储位置 | 原因 |
|-------|---------|------|
| `accessToken` | 内存变量（非持久化） | 短期有效（15min），丢失后走 refresh |
| `refreshToken` | `localStorage` 或 `httpOnly cookie` | 长期有效（7d），需要跨页面/刷新持久化 |

```typescript
// 推荐：内存变量
let accessToken: string | null = null;

// refreshToken 存 localStorage
function saveTokens(tokens: { accessToken: string; refreshToken: string }) {
  accessToken = tokens.accessToken;
  localStorage.setItem("refreshToken", tokens.refreshToken);
}
```

### 2. 请求拦截器：自动附加 Authorization

所有需要鉴权的请求自动携带 `accessToken`：

```typescript
// 以 axios 为例
axios.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});
```

### 3. 响应拦截器：401 自动刷新

当收到 401 时，自动用 `refreshToken` 换新 token，然后重试原请求。**关键：同一时刻只允许一个刷新请求，并发请求排队等待**。

```typescript
let refreshPromise: Promise<string> | null = null;

axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // 只拦截 401，且不是 refresh 自身或 login
    if (error.response?.status !== 401) throw error;
    if (originalRequest.url?.includes("/auth/refresh")) throw error;
    if (originalRequest.url?.includes("/auth/login")) throw error;

    // 防止并发刷新：多个请求同时 401 时，只发一次 refresh
    if (!refreshPromise) {
      refreshPromise = (async () => {
        try {
          const refreshToken = localStorage.getItem("refreshToken");
          if (!refreshToken) throw new Error("no refresh token");

          const { data } = await axios.post("/v1/auth/refresh", { refreshToken });
          accessToken = data.data.tokens.accessToken;
          localStorage.setItem("refreshToken", data.data.tokens.refreshToken);
          return data.data.tokens.accessToken;
        } catch {
          // 刷新失败 → 清除所有 token → 跳转登录
          accessToken = null;
          localStorage.removeItem("refreshToken");
          window.location.href = "/login";
          throw error;
        } finally {
          refreshPromise = null;
        }
      })();
    }

    // 等待刷新完成，拿到新 token 后重试
    const newToken = await refreshPromise;
    originalRequest.headers.Authorization = `Bearer ${newToken}`;
    return axios(originalRequest);
  },
);
```

### 4. 登录/注册后存储 token

```typescript
async function login(account: string, password: string) {
  const { data } = await axios.post("/v1/auth/login", { account, password });
  const { accessToken, refreshToken } = data.data.tokens;
  saveTokens({ accessToken, refreshToken });
  // 获取当前用户
  const { data: me } = await axios.get("/v1/auth/me");
  return me.data;
}
```

### 5. 登出

```typescript
async function logout() {
  const refreshToken = localStorage.getItem("refreshToken");
  if (refreshToken) {
    await axios.post("/v1/auth/logout", { refreshToken }).catch(() => {});
  }
  accessToken = null;
  localStorage.removeItem("refreshToken");
  window.location.href = "/login";
}
```

### 6. API 端点速查

| 操作 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 注册 | `POST` | `/v1/auth/register` | 返回 `{ user, tokens }` |
| 登录 | `POST` | `/v1/auth/login` | 返回 `{ user, tokens }` |
| 刷新 | `POST` | `/v1/auth/refresh` | body: `{ refreshToken }`，返回 `{ user, tokens }` |
| 登出 | `POST` | `/v1/auth/logout` | body: `{ refreshToken }` |
| 当前用户 | `GET` | `/v1/auth/me` | 需要 Authorization |

### 7. 与 tokenVersion 的关系

前端**完全不需要**关心 `tokenVersion`。当后端因 `tokenVersion` 不匹配返回 401 时，前端的 401 拦截器会按上述流程自动刷新 token，用户无感知。唯一区别是：原本 15 分钟后才到期的 token 被提前拒绝了——但对前端来说都是 401，处理方式完全一样。

### 8. 正确实现 vs 错误实现

#### 错误实现（当前 client.ts）

```typescript
try {
  return await sendRequest<T>(path, options);
} catch (error) {
  if (error.status === 401 && options.auth !== false) {
    clearAuthTokens();     // ← 直接清 token
    redirectToLogin();     // ← 直接跳登录
  }
  throw error;
}
```

**问题**：每次 token 过期或被撤销，用户必须重新登录。`refreshAuthSession` 函数存在但从未被调用。

#### 正确实现

核心原则：**401 时先尝试刷新，成功了就重试原请求，失败了才跳登录**。对调用方透明——`requestApi("/v1/novel/books")` 的调用者永远只看到 200 或报错，不会看到 401。

```typescript
let refreshPromise: Promise<string> | null = null;

async function requestApi<T>(path: string, options: RequestOptions = {}): Promise<T> {
  try {
    return await sendRequest<T>(path, options);
  } catch (error) {
    if (!(error instanceof ApiClientError && error.status === 401 && options.auth !== false)) {
      throw error;
    }

    // 排除刷新接口自身和登录接口，避免死循环
    if (path.includes("/auth/refresh") || path.includes("/auth/login")) {
      throw error;
    }

    // 并发 401 排队：同一时刻只发一次 refresh
    if (!refreshPromise) {
      refreshPromise = doRefresh();
    }

    try {
      const newToken = await refreshPromise;
      // 用新 token 重试原请求
      return sendRequest<T>(path, { ...options, headers: { ...options.headers, Authorization: `Bearer ${newToken}` } });
    } catch {
      // 刷新也失败了 → 清 token → 跳登录
      clearAuthTokens();
      redirectToLogin();
      throw error;
    }
  }
}

async function doRefresh(): Promise<string> {
  try {
    const refreshToken = getRefreshToken();
    if (!refreshToken) throw new Error("no refresh token");
    const { data } = await sendRequest<{ tokens: { accessToken: string; refreshToken: string } }>(
      "/v1/auth/refresh",
      { method: "POST", body: { refreshToken }, auth: false },
    );
    setAccessToken(data.tokens.accessToken);
    setRefreshToken(data.tokens.refreshToken);
    return data.tokens.accessToken;
  } finally {
    refreshPromise = null; // 无论成功失败都释放锁
  }
}
```

**为什么原请求不会"先失败后刷新"？**

时序如下：

```
requestApi("/v1/novel/books")
  → sendRequest → 后端返回 401
  → catch 块拦截（未 throw，调用方无感知）
  → doRefresh() → 200，拿到新 token
  → sendRequest("/v1/novel/books") 重试 → 200
  → 返回给调用方 { id: 1, name: "..." }
  → 调用方看到：正常返回 200，完全不知道中间发生了 401 + refresh
```

如果页面同时发了 3 个 API 请求且 token 过期：

```
请求 A: GET /books     → 401 → refreshPromise = doRefresh() → 等待
请求 B: GET /chapters  → 401 → refreshPromise 已存在 → 排队等待
请求 C: GET /prompts   → 401 → 排队等待

doRefresh() 完成 → newToken
请求 A 重试 → 200 ✓
请求 B 重试 → 200 ✓
请求 C 重试 → 200 ✓

用户看到：三个接口同时正常返回，无感知
```

### 9. 需要改动的文件

| 文件 | 改动 |
|------|------|
| `client.ts` | `requestApi` 的 401 catch 从 `clearAuthTokens + redirect` 改为 `refresh + retry` |
| `auth.ts` | 确保 `getRefreshToken` / `setRefreshToken` / `setAccessToken` 函数导出供 `client.ts` 使用 |