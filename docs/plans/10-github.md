# 模块 6：GitHub 集成

**目标：** 支持 git 本地操作 + GitHub API（PR、Issue、仓库信息）。

## 文件
- `backend/app/tools/git_tool.py` — 本地 git 操作
- `backend/app/tools/github_tool.py` — GitHub REST API
- `backend/tests/test_git_tool.py`
- `backend/tests/test_github_tool.py`

## GitTool（本地）

```python
operations = ["status", "diff", "log", "branch",  # 自动执行
              "add", "commit", "push", "pull"]      # 需要审批

def check_approval(self, args) -> bool:
    return args["operation"] in {"add", "commit", "push", "pull"}
```

## GitHubTool（API）

```python
operations = ["list_prs", "get_pr", "list_issues",   # 自动执行
              "create_pr", "create_issue"]             # 需要审批

# 依赖：GITHUB_TOKEN 环境变量
# 使用：httpx 调用 api.github.com
```

## 配置
```yaml
# ~/.code-assistant/config.yaml
github:
  token: ${GITHUB_TOKEN}
  default_owner: your-username
```

## 步骤

- [ ] 写 `git_tool.py`（subprocess + 按操作动态审批）
- [ ] 写 `github_tool.py`（httpx + token 鉴权 + 5 个操作）
- [ ] 写测试（git 用 tmp_path real repo，github 用 mock httpx）
- [ ] 注册到 `main.py` ToolRegistry
- [ ] `pytest tests/test_git_tool.py tests/test_github_tool.py -v` → 通过

## ⏸ 审核后继续

## 验收标准
- [ ] 安装依赖并通过所有测试：`pip install -e ".[dev]" && python -m pytest tests/ -v`
- [ ] 无警告，无跳过（0 failed, 0 skipped）
- [ ] 我审核代码通过
- [ ] 我确认后才 commit
