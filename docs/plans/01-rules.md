# 模块 1：规范文件

**目标：** 创建全局代码规范，供 Agent 注入 system prompt。

## 文件
- `~/.code-assistant/rules/react-typescript.md`
- `~/.code-assistant/rules/fastapi-python.md`
- `~/.code-assistant/rules/my-workflow.md`
- `docs/rules/`（备份，纳入 git）

## 步骤

- [ ] 创建目录
```bash
mkdir -p ~/.code-assistant/rules
mkdir -p docs/rules
```

- [ ] 创建 `react-typescript.md`
内容要点：函数组件、strict TS、Tailwind+shadcn/ui、Zustand、命名规范

- [ ] 创建 `fastapi-python.py`
内容要点：Pydantic v2、async、分层架构、ToolResult 不抛异常

- [ ] 创建 `my-workflow.md`
内容要点：Conventional Commits、TDD、YAGNI、先写测试再 commit

- [ ] 备份到 `docs/rules/` 并提交
```bash
cp ~/.code-assistant/rules/*.md docs/rules/
git add docs/rules/
git commit -m "docs: add global code rules"
```

## ⏸ 审核后继续模块 2
