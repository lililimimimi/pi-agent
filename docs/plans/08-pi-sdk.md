# 模块 8：Pi SDK 集成

**目标：** 用 Pi SDK 替换自研 Agent 循环，通过 Node.js Bridge 服务对接，前端 API 契约不变。

## 架构

```
Frontend ──SSE──▶ FastAPI (chat.py) ──HTTP/SSE──▶ pi-bridge (Express)
                   proxy 转发                      ├─ Pi SDK session
                                                   ├─ read/write/bash tools
                                                   └─ permission gating
```

## 文件

- `pi-bridge/package.json` — Express + `@earendil-works/pi-coding-agent` 依赖
- `pi-bridge/server.ts` — 创建 Pi SDK session，暴露 `/chat` SSE 端点，转发 events
- `backend/app/api/chat.py` — 改为 proxy 模式，将请求转发至 pi-bridge，透传 SSE 流
- `backend/app/types.py` — 新增 `permission_request` SSE 事件类型

## 步骤

- [ ] 初始化 `pi-bridge/` 项目，安装 Express + Pi SDK
- [ ] 实现 `server.ts`：`createAgentSession({ cwd, tools })` → SSE 流
- [ ] 映射 Pi SDK 事件（`text_delta` / `tool_use` / `tool_result` / `permission_request`）为现有 SSE 格式
- [ ] 实现 `/approve` POST 端点，转发权限决策给 session
- [ ] 修改 `chat.py`：用 `httpx` 异步代理到 bridge，透传 SSE
- [ ] 修改 `types.py`：增加 `PermissionRequestEvent` 类型
- [ ] 写 bridge 集成测试（mock Pi SDK session）
- [ ] 端到端测试：前端发消息 → bridge 调用工具 → 流式返回

## 验收标准

- [ ] 前端发送消息后能收到与原有格式一致的 `text_delta` / `tool_use` / `tool_result` 事件流
- [ ] 危险工具（bash、write）触发 `permission_request`，前端审批后才继续执行
- [ ] 自研 `AgentLoop` 不再被调用，所有 agent 逻辑由 Pi SDK 驱动
