# 集成接线模块 — 设计文档

> 日期：2025-09-08
> 状态：已确认

## 1. 问题描述

模块 1-6 各自独立完成，但存在以下集成缺口：

1. **SecurityInterceptor 未注入 AgentLoop** — `chat.py` 创建 AgentLoop 时只传了 `model_router` 和 `tool_registry`，`security_interceptor` 缺失
2. **审批流程断开** — AgentLoop 遇到审批时 break 退出，无恢复机制。当前阶段跳过审批，所有工具自动执行
3. **前端 provider 硬编码** — `chatStore.ts` 默认 `deepseek`，无 API Key 时直接报错
4. **无集成测试** — 各模块只有单元测试，从未验证完整链路

## 2. 目标

- 修补后端内部接线（Security 注入 + 跳过审批）
- 前端启动时智能降级选择可用 provider
- 后端集成测试覆盖完整 SSE 链路
- 手动联调验证前后端端到端通信

## 3. 方案：最小缝合

在现有代码上做最小改动，只修补断开的接线。不重构架构。

### 3.1 SecurityInterceptor 注入

**文件：** `backend/app/container.py`, `backend/app/api/chat.py`

- `container.py` 新增 `security_interceptor` 单例（`project_root="."`, 后续项目管理时动态传入）
- `chat.py` 创建 AgentLoop 时传入 `container.security_interceptor`

### 3.2 跳过审批

**文件：** `backend/app/agent/core.py`

- 在 `AgentLoop.run()` 中跳过 `check_approval()` 分支（注释/条件跳过），保留代码结构方便后续恢复
- 不修改各工具的 `requires_approval` 属性

### 3.3 前端智能降级

**文件：** `backend/app/api/models.py`, `frontend/src/stores/chatStore.ts`

后端新增 `GET /api/models/default`：
- 遍历已注册 provider，优先返回非 mock 的第一个可用 provider + model
- 全部不可用时降级到 `mock / mock-1`

前端 `chatStore.ts` 启动逻辑：
1. 先用 localStorage 缓存值（如果有）
2. 启动时调 `/api/models/default` 刷新
3. 后端不可达时用缓存兜底

保留现有 `setModel()` 和 localStorage 机制不变。

### 3.4 集成测试

**文件：** `backend/tests/test_integration.py`

用 FastAPI TestClient + MockProvider，覆盖三个场景：

| 测试用例 | 验证内容 |
|---------|---------|
| `test_full_chat_flow` | 发消息 → text 事件 → done 事件 |
| `test_tool_execution_flow` | 模型请求工具调用 → 自动执行 → tool_result 事件 |
| `test_security_blocks_dangerous_tool` | 写越界路径 → SecurityInterceptor 拦截 → security_violation 事件 |

### 3.5 手动联调

集成测试通过后启动前后端：

```bash
# 后端
cd backend && uvicorn app.main:app --port 8000 --reload

# 前端
cd frontend && npm run dev
```

验证项：
1. 页面加载 → 自动选中可用 provider
2. 发消息 → 流式回复正常
3. 工具调用 → 自动执行，结果显示在 ToolCallCard

## 4. 改动文件清单

| 文件 | 操作 |
|------|------|
| `backend/app/container.py` | 修改：新增 `security_interceptor` |
| `backend/app/api/chat.py` | 修改：AgentLoop 传入 security_interceptor |
| `backend/app/agent/core.py` | 修改：跳过 check_approval 分支 |
| `backend/app/api/models.py` | 修改：新增 `GET /api/models/default` |
| `frontend/src/stores/chatStore.ts` | 修改：启动时调 `/api/models/default` |
| `backend/tests/test_integration.py` | 新增：集成测试 |

## 5. 不做的事

- 不重构 container.py / main.py 架构
- 不实现审批恢复机制（后续单独模块）
- 不写前端自动化测试
- 不改各工具的 `requires_approval` 属性值
