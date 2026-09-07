# 模块 5：安全限制

- [x] 写 `security.py`（InterceptResult + CommandAllowlist + SecurityInterceptor）
- [x] 写测试：路径越界 / 危险命令 / 白名单通过 / git 操作通过
- [x] 注入 AgentLoop：确认 `__init__` 已接受 `security_interceptor` 参数（已预置）
- [x] `pytest tests/test_security.py -v` → 全部通过（37 passed）
