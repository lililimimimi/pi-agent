# 模块 2：Agent Core

**目标：** 实现 Agent 循环 — 接收消息、调用模型、执行工具、流式返回。

## 文件
- `backend/app/types.py` — TextChunk, ToolCallChunk, ToolResult, Message, SSEEvent
- `backend/app/tools/base.py` — Tool ABC, ToolRegistry, check_approval(args)
- `backend/app/models/base.py` — ModelProvider ABC, ModelRouter
- `backend/app/agent/core.py` — AgentLoop.run()
- `backend/tests/test_agent_core.py`

## 核心逻辑（AgentLoop.run）

```
while iterations < MAX:
    stream model → yield TextChunk / ToolCallChunk
    if no tool calls → break
    for each tool_call:
        check_approval(args) → True → emit approval_request, pause
        SecurityInterceptor.before_tool_call() → blocked → emit error, skip
        tool.execute(args) → emit tool_result
    append results → continue loop
yield SSEEvent("done")
```

## 步骤

- [x] 写 `types.py`（数据类型）
- [x] 写 `tools/base.py`（Tool ABC + check_approval + ToolRegistry）
- [x] 写 `models/base.py`（ModelProvider ABC + ModelRouter + MockProvider）
- [x] 写 `agent/core.py`（AgentLoop）
- [x] 写测试：纯文本响应 / 工具自动执行 / 工具需审批 / 未知工具
- [x] 运行：`pytest tests/test_agent_core.py -v` → 全部通过

## ⏸ 展示测试结果，审核后继续模块 3

## 验收标准
- [x] 安装依赖并通过所有测试：`pip install -e ".[dev]" && python -m pytest tests/ -v`
- [x] 无警告，无跳过（0 failed, 0 skipped）
- [x] 我审核代码通过
- [x] 我确认后才 commit
