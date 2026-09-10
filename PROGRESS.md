# PROGRESS

## 当前状态

### 已完成（模块 1–13）

- 基础规则、Agent Core、后端 FastAPI、前端 React 架构
- 安全拦截、多模型路由、集成接线
- Pi SDK 接入（pi-bridge Express 服务），能真正读写文件
- 前端 Agent 执行界面：工具调用卡片、审批弹窗、状态条
- 前后端流式输出连通，UI 苹果风格基本完成
- **会话持久化**：JSONL 存储、兼容 Pi 原生格式、侧边栏搜索/批量删除、项目目录浏览器（含新建文件夹）
- **模型配置 + Provider 管理**：Settings 页面、Claude.ai 订阅直连、多 provider 支持
- **前端体验增强**：代码块复制、Context 用量显示、全局 Toast、网络监控、快捷键
- **执行前确认机制**：Agent 写操作前展示步骤预览卡片，用户确认/取消，60s 超时自动取消

#### 模块 13 具体交付

| 类别 | 内容 |
|------|------|
| `types.py` | 新增 `ExecutionPreviewEvent` Pydantic 模型 |
| `pi-bridge/src/preview.ts` | `buildPreview()`、`extractSteps()`、`describeToolCall()`、`PreviewRegistry`（含超时） |
| `bridge server.ts` | `makePreviewExtension`：首次写操作前 emit `execution_preview` 事件，等待 confirm/cancel/timeout；修复 import 路径 `./preview.js` → `./src/preview.js` |
| `backend/app/api/preview.py` | `POST /api/preview/:id/confirm` 和 `cancel`，转发给 bridge |
| `ExecutionPreviewCard.tsx` | 步骤列表 + 「继续执行」「取消」按钮 + 60s 倒计时，超时自动取消 |
| `chatStore.ts` | 处理 `execution_preview` SSE 事件，存入 `executionPreview` 状态；`clearExecutionPreview` action |
| `api.ts` | 新增 `confirmPreview()` / `cancelPreview()` |
| `ChatView.tsx` | 条件渲染 `ExecutionPreviewCard`（位于消息列表末尾） |
| 测试 | `ExecutionPreviewCard.test.tsx`（4 用例）、`test_api_preview.py`（5 用例）、`src/preview.test.ts`（16 用例）全部通过 |
| 测试结果 | pi-bridge 20/20 ✅，frontend 38/38 ✅，backend 98/98 ✅ |

#### 模块 12 具体交付

| 类别 | 内容 |
|------|------|
| 代码块复制 | `MessageBubble.tsx`：`CodeBlock` 组件，hover 显示复制按钮，点击写入剪贴板，✓ 反馈 1.5s |
| 代码块样式 | 黑色背景（`bg-zinc-950`）、圆角、顶部语言标签（typescript / bash 等） |
| 列表复制 | `ListBlock` 组件：圆角边框列表框右上角加复制按钮，与代码块一致 |
| ContextBar | `ContextBar.tsx`：`Context 12k / 200k` + 2px 进度条，绿→黄(80%)→红(95%) |
| 全局 Toast | `Toast.tsx`：`ToastProvider` + `useToast` hook，4 种类型，自动消失，错误含重试按钮 |
| 网络监控 | `useNetworkStatus.ts`：监听 online/offline，断网 → 持久 Toast，恢复 → 成功 Toast |
| 错误提示 | `ChatView.tsx`：SSE 错误自动 Toast 通知，含重试按钮 |
| 快捷键 | `useKeyboardShortcuts.ts`：`⌘K` 新建、`⌘,` 设置、`⌘/` 聚焦输入框 |
| 快捷键 | `InputBar.tsx`：`⌘Enter` 补充发送（React 受控 state 正确处理） |
| 工具卡片折叠 | `ToolCallGroup`：tool calls 收进可展开区域，不与正文混排 |
| Result 解析 | `extractResultText()`：解析 Anthropic content block 格式，提取纯文本 + exit code |
| 测试修复 | 后端 3 个 mock provider 测试：改用 `BRIDGE` + `get_all_enabled_models` 正确 patch 路径 |
| 测试 | 前端新增 13 个测试（CodeBlock、Toast、useKeyboardShortcuts），全套 34/34 通过 |
| 后端测试 | 103/103 全部通过 |

#### 模块 11 具体交付

| 类别 | 内容 |
|------|------|
| 后端配置 | `config/providers.py`：读写 `~/.pi/agent/config.json`，key 脱敏，7 个 provider 默认值 |
| 后端配置 | `config/pi_oauth.py`：读取 pi CLI OAuth token（`~/.pi/agent/auth.json`），检测有效期 |
| 后端模型 | `models/claude_oauth.py`：`ClaudeOAuthProvider`，用 `auth_token=` 走订阅计费 |
| 后端 API | `GET/PUT /api/providers`、`POST /api/providers/:id/test`、`GET /api/providers/:id/models` |
| 后端 API | `GET /api/models` 优先代理 pi-bridge（source of truth），fallback 读 config.json |
| pi-bridge | `configureHttpDispatcher()` 强制 HTTP/1.1（修复 OAuth 403 根因：Node.js 默认 H2 被 Anthropic 拒绝） |
| pi-bridge | `PROVIDER_ALIAS`：`pi` → `anthropic`，支持订阅路由 |
| 前端组件 | `ProviderCard.tsx`：API key 输入（masked）、Test 按钮、连接状态、模型列表 |
| 前端组件 | `SettingsModal.tsx`：重构为 Providers 标签页，使用 ProviderCard |
| 前端组件 | `ModelSelector.tsx`：显示 Provider 徽章（[Claude.ai] / [DeepSeek] 等） |
| 前端 | `App.tsx`：`⌘,` 快捷键打开设置 |
| 前端 | 侧边栏搜索栏移至 Projects 上方 |
| 测试 | `tests/test_providers.py` 23 个测试全部通过 |

**关键 bug 修复**：OAuth 403 根本原因 = Node.js undici 默认 HTTP/2，Anthropic OAuth 只接受 HTTP/1.1。修复方法：bridge 启动时调用 `configureHttpDispatcher()`（与 pi CLI 行为一致）。

#### 支持的 Provider

| Provider | 认证方式 | 状态 |
|----------|---------|------|
| Claude.ai 订阅 (Pi) | OAuth（自动读取 `~/.pi/agent/auth.json`）| ✅ 自动检测 |
| Anthropic API | `ANTHROPIC_API_KEY` 或 Settings 手动配置 | ✅ |
| DeepSeek / SiliconFlow | `DEEPSEEK_API_KEY` / `SILICONFLOW_API_KEY` | ✅ |
| OpenAI | `OPENAI_API_KEY` | ✅ |
| Google Gemini | `GEMINI_API_KEY` | ✅ |
| Ollama | Base URL（本地，无需 key）| ✅ |

### 待完成（模块 13–19）

| 模块 | 文件 | 内容 |
|------|------|------|
| 14 | 14-file-browser.md | 项目文件浏览（侧边栏文件树） |
| 15 | 15-file-upload.md | 文件上传（通用 + 图片） |
| 16 | 16-skill-rules.md | Skill 规范文件管理 |
| 17 | 17-trace.md | 日志追踪 |
| 18 | 18-tauri.md | Tauri 桌面打包 |
| 19 | 19-docker.md | Docker 容器隔离（备用） |

## 当前问题

无

## 下一步

从 `docs/plans/14-file-browser.md` 开始。
