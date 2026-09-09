# PROGRESS

## Session: 模块 15 — Pi SDK 集成

### 这个 session 做了什么

实现了 `docs/plans/08-pi-sdk.md` 的完整内容：

- **`pi-bridge/`**：新建 Express + Pi SDK 桥接服务
  - `server.ts`：创建 Pi SDK session，把事件流映射为前端 SSE 格式
  - 自动读取 `backend/.env`（DEEPSEEK_API_KEY 等）
  - 支持 provider 级别路由：deepseek / anthropic 均走 Pi SDK
  - MODEL_ALIASES 把前端 model id 映射到 Pi SDK model id
  - 找不到 model 时按 provider 回退到默认 model

- **`backend/app/api/chat.py`**：改为无脑 proxy，把所有请求转发给 pi-bridge

- **`backend/app/types.py`**：新增 `PermissionRequestEvent`

- **`frontend/src/types/index.ts`**：新增 `permission_request` SSE 事件类型

- **测试**：更新后端测试（mock bridge），bridge 集成测试（health + approve）

### 下一个 session 从哪里继续

下一个计划：`docs/plans/09-frontend-agent-ui.md`

### 未解决的问题

- **Anthropic 403**：OAuth token（Claude.ai 订阅）不能调用 Anthropic API，需要单独的 API key（`console.anthropic.com`）填到 `backend/.env` 的 `ANTHROPIC_API_KEY`
- **bridge 启动**：必须用 `npm run dev`（watch 模式），`npx tsx server.ts` 在用户终端会自动退出（原因未明）
- **Node 版本**：bridge 必须在 v22.19.0 下运行（`nvm use 22.19.0`），低版本不兼容 Pi SDK
