# 模块 11：日志追踪

**目标：** 结构化日志 + 请求级 correlation ID，可追踪完整对话链路。

## 文件
- `backend/app/logging.py` — loguru 配置 + correlation ID
- `backend/tests/test_logging.py`

## 设计

```python
# contextvars — async 安全，每个请求独立
_correlation_id: ContextVar[str | None] = ContextVar("cid", default=None)

class LogContext:
    """with LogContext() as cid: ...  自动设置/清除 ID"""

def get_logger(name: str) -> Logger:
    """返回自动注入 cid 和 module 的 logger"""
```

## 日志格式
```
2025-09-05 10:23:45.123 | INFO | agent | cid=a3f2b1c | Agent loop started
2025-09-05 10:23:45.456 | DEBUG | tools | cid=a3f2b1c | read_file: src/main.py
2025-09-05 10:23:46.789 | INFO  | agent | cid=a3f2b1c | done | tokens=1234
```

## 注入点
- `api/chat.py` — 请求进入时创建 LogContext
- `agent/core.py` — loop 开始/结束、每次工具调用
- `models/claude.py` — 模型请求摘要（不记录完整 prompt）
- `tools/*.py` — 每次执行（通过 get_logger）

## 依赖
```toml
"loguru>=0.7.0"  # 加入 pyproject.toml
```

## 步骤

- [ ] 写 `logging.py`（setup_logging / LogContext / get_logger）
- [ ] 写测试（correlation ID 隔离、格式验证）
- [ ] 在 `main.py` 调用 `setup_logging(level="DEBUG")`
- [ ] 在 agent/tools/api 各处注入 `get_logger()`
- [ ] `pytest tests/test_logging.py -v` → 通过
- [ ] 启动后发一条消息，观察日志输出格式

## ⏸ 审核后继续

## 验收标准
- [ ] 安装依赖并通过所有测试：`pip install -e ".[dev]" && python -m pytest tests/ -v`
- [ ] 无警告，无跳过（0 failed, 0 skipped）
- [ ] 我审核代码通过
- [ ] 我确认后才 commit
