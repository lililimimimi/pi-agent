# 模块 5：安全限制

**目标：** 工具调用前拦截危险操作，限制 bash 命令范围。

## 文件
- `backend/app/security.py` — SecurityInterceptor + CommandAllowlist
- `backend/tests/test_security.py`

## 拦截规则

**文件工具**（read_file / write_file / git_tool）
- 路径必须在 PROJECT_ROOT 内
- 拒绝 `../`、绝对路径越界

**run_command 白名单**（Phase 2 启用）
```python
ALLOWED = ["pytest", "python -m pytest", "git ", "npm test",
           "npx tsc", "ls", "cat", "grep", "diff", "echo"]
```

**永久黑名单（正则）**
```python
BLOCKED = [r"rm\s+-rf", r"sudo", r"curl.+\|(bash|sh)",
           r":\(\)\{.*\}", r">/dev/", r"mkfs", r"nohup", r"&\s*$"]
```

## SecurityInterceptor 接口

```python
class SecurityInterceptor:
    def before_tool_call(self, tool_name: str, args: dict) -> InterceptResult:
        # InterceptResult(allowed=bool, reason=str)
```

AgentLoop 在 `tool.execute()` 前调用，被拒则返回 `security_violation` SSE 事件。

## 步骤

- [ ] 写 `security.py`（InterceptResult + CommandAllowlist + SecurityInterceptor）
- [ ] 写测试：路径越界 / 危险命令 / 白名单通过 / git 操作通过
- [ ] 注入 AgentLoop：`__init__` 接受 `security_interceptor` 参数
- [ ] `pytest tests/test_security.py -v` → 全部通过

## ⏸ 展示测试结果，审核后完成 Phase 1
