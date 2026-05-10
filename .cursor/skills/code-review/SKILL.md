---
name: code-review
description: 对后端代码变更和新功能进行审查。对照 AGENTS.md 规则检查硬编码、OOT、路由同步、project-structure.md 同步、JSDoc 完整性、类型安全、Controller/Service 分层、响应格式等。Use when code changes are made, new APIs are added, or the user asks for a code review.
disable-model-invocation: true
---

# 后端代码审查

对每次代码变更和新增功能，对照 `AGENTS.md` 中的规则进行检查。

## 检查流程

1. 确定变更范围：通过 `git diff` 或对比最近修改的文件确认改动边界
2. 按下方检查清单逐项审查
3. 对每个违规项指明具体文件、行号和修复建议
4. 输出结果按严重程度分级：**严重**（必须修复）、**建议**（考虑改进）、**通过**

详细检查清单见 [checklist.md](checklist.md)，正反示例见 [examples.md](examples.md)。

## 输出格式

```
## 审查结果

### 严重（必须修复）
- [文件:行号] 问题描述 → 修复建议

### 建议（考虑改进）
- [文件:行号] 问题描述 → 改进方向

### 通过项
- 检查项: 通过
```