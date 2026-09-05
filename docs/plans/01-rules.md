# 模块 1：规范文件 ✅

**目标：** 创建全局代码规范（pi skills 格式），供 Agent 注入 system prompt。

## 文件
- `~/.pi/agent/skills/react-typescript/SKILL.md`（全局）
- `~/.pi/agent/skills/fastapi-python/SKILL.md`（全局）
- `~/.pi/agent/skills/my-workflow/SKILL.md`（全局）
- `.pi/skills/`（项目级，纳入 git）

## 步骤

- [x] 创建 `react-typescript` skill (71 行)
内容要点：技术栈选择、深模块设计、seam 纪律、discriminated union、测试哲学

- [x] 创建 `fastapi-python` skill (101 行)
内容要点：分层架构、领域异常体系、Pydantic v2 模式、Annotated 依赖、RORO

- [x] 创建 `my-workflow` skill (40 行)
内容要点：双轴 code review、TDD 垂直切片、seam 测试、commit 纪律

- [x] 全局 + 项目级双份部署，提交到 `feat/module-1-rules` 分支

## ⏸ 审核后继续模块 2

## 验收标准
- [ ] 安装依赖并通过所有测试：`pip install -e ".[dev]" && python -m pytest tests/ -v`
- [ ] 无警告，无跳过（0 failed, 0 skipped）
- [ ] 我审核代码通过
- [ ] 我确认后才 commit
