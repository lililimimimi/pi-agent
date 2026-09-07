# 模块 3：FastAPI 后端

**目标：** HTTP 层 — SSE 流式接口 + 工具实现 + Claude Provider。

## 文件
- `backend/app/main.py` — FastAPI app, CORS, 依赖注入
- `backend/app/api/chat.py` — POST /api/chat, GET /api/chat/stream/{id}
- `backend/app/models/claude.py` — ClaudeProvider（streaming + tool_use + usage）
- `backend/app/tools/read_file.py` — ReadFileTool（requires_approval=False）
- `backend/app/tools/write_file.py` — WriteFileTool（requires_approval=True）
- `backend/app/tools/git_tool.py` — GitTool（check_approval 按操作类型）
- `backend/app/logging.py` — loguru + correlation ID
- `backend/tests/test_api_chat.py`

## 关键接口

```
POST /api/chat          → { session_id }
GET  /api/chat/stream/{id} → text/event-stream
POST /api/tool/approve  → { approved: bool }
GET  /api/health        → { status: "ok" }
```

## SSE 事件格式
```
data: {"event": "text",             "data": {"content": "..."}}
data: {"event": "tool_call",        "data": {"tool_name": ..., "args": ...}}
data: {"event": "approval_request", "data": {"tool_call_id": ...}}
data: {"event": "tool_result",      "data": {"output": ..., "is_error": bool}}
data: {"event": "usage",            "data": {"input_tokens": N, "output_tokens": N}}
data: {"event": "done",             "data": {}}
```

## 步骤

- [x] 写 `main.py`（FastAPI + MockProvider 开发模式）
- [x] 写 `api/chat.py`（POST + SSE stream）
- [x] 写 `models/claude.py`（stream + tool_use + usage 捕获）
- [x] 写三个 tool（read_file / write_file / git_tool）
- [x] 写 `logging.py`（loguru + contextvars correlation ID）
- [x] 写测试，运行：`pytest tests/ -v` → 全部通过
- [x] 启动验证：`uvicorn app.main:app --port 8000` + `curl /api/health`

## ⏸ 展示测试结果，审核后继续模块 4

## 验收标准
- [x] 安装依赖并通过所有测试：`pip install -e ".[dev]" && python -m pytest tests/ -v`
- [x] 无警告，无跳过（0 failed, 0 skipped）
- [x] 我审核代码通过
- [x] 我确认后才 commit
