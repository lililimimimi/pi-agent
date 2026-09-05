# 模块 13：Skill 规范文件管理

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

- [ ] 写 `detector.py`（读文件内容，返回 set[str]）
- [ ] 写 `engine.py`（加载 + 合并，文件缺失时跳过）
- [ ] 写测试（单栈/双栈/无规范/项目级覆盖）
- [ ] 接入 `agent/core.py` 的 `build_context()`（注入 system prompt）
- [ ] `pytest tests/test_rules_engine.py -v` → 通过

## ⏸ 审核后全部模块完成
