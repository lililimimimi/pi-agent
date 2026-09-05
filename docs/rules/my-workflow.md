# 工作流规范

> Conventional Commits、TDD、Semver 等基础概念不再展开。只记录具体决策。

## Git

- 分支: `feature/{ticket}-slug`、`fix/{ticket}-slug`、`hotfix/{ticket}-slug`
- main 受保护: PR only，CI green + ≥1 approval，squash merge，合后删分支
- PR < 400 行。超过必须拆分或说明理由
- 每个 commit 必须测试通过。feature 和 refactor 分开提交

## TDD 流程

```
写一个失败测试 → 写最小实现通过 → commit
→ 重构（测试仍通过）→ 单独 commit refactor
→ 重复
```

- **在 Seam 测试**: seam = 公共接口（函数签名、API endpoint、模块导出）。不测私有方法
- **垂直切片**: 一个测试 → 一个实现 → 下一个。不要一次写完所有测试
- **期望值独立于实现**: 来自 spec 或手算，不是把生产代码逻辑再跑一遍

## Code Review — 双轴

每次 review 沿两个独立轴评估，不合并排序：

1. **Standards**: 代码是否遵守仓库编码规范？
2. **Spec**: 代码是否完整实现了 issue/spec 要求？是否有 scope creep？

严重度前缀：
- 🔴 BLOCKER / 🟠 MUST FIX → 合并前必须修
- 🟡 SUGGESTION / 🟢 NIT → 作者自行决定
- 💬 QUESTION → 必须回复
- 👍 PRAISE → **每次 review 至少一个**

## 发布

- Semver: `MAJOR.MINOR.PATCH`
- Hotfix: 从 main 切分支 → fix + test → PR → tag patch → cherry-pick 回 develop
