# 模块 16：Skill 规范文件管理

**目标：** 全局 + 项目级规范自动加载，注入 Agent system prompt。

## 文件
- `backend/app/rules/engine.py` — RulesEngine（加载 + 合并）
- `backend/app/rules/detector.py` — StackDetector（检测技术栈）
- `backend/tests/test_rules_engine.py`

## 加载逻辑

```python
def build_rules(self, project_path: str) -> str:
    rules = [load("my-workflow.md")]          # 始终加载
    stack = StackDetector.detect(project_path)
    if "react" in stack:
        rules.append(load("react-typescript.md"))
    if "fastapi" in stack:
        rules.append(load("fastapi-python.md"))
    local = Path(project_path) / ".assistant/rules.md"
    if local.exists():
        rules.append(local.read_text())       # 最高优先级
    return "\n\n---\n\n".join(rules)
```

## StackDetector
- `package.json` 含 `react` → react
- `pyproject.toml` / `requirements.txt` 含 `fastapi` → fastapi

## 步骤

- [x] 写 `detector.py`（读文件内容，返回 set[str]）
- [x] 写 `engine.py`（加载 + 合并，文件缺失时跳过）
- [x] 写测试（单栈/双栈/无规范/项目级覆盖）
- [x] 接入 system prompt（偏离计划：`agent/core.py` 没有 `build_context()`，且聊天不经过 `AgentLoop`；实际路径为 `api/chat.py` 生成规范 → bridge 通过 `appendSystemPrompt` 注入）
- [x] `pytest tests/test_rules_engine.py -v` → 通过（16 个）

## ⏸ 审核后全部模块完成

## 验收标准
- [x] 安装依赖并通过所有测试：`pip install -e ".[dev]" && python -m pytest tests/ -v`
- [x] 无警告，无跳过（0 failed, 0 skipped）
- [ ] 我审核代码通过
- [ ] 我确认后才 commit
