# PROGRESS

## 当前状态

### 已完成（模块 1–16）

- 基础规则、Agent Core、后端 FastAPI、前端 React 架构
- 安全拦截、多模型路由、集成接线
- Pi SDK 接入（pi-bridge Express 服务），能真正读写文件
- 前端 Agent 执行界面：工具调用卡片、审批弹窗、状态条
- 前后端流式输出连通，UI 苹果风格基本完成
- **会话持久化**：JSONL 存储、兼容 Pi 原生格式、侧边栏搜索/批量删除、项目目录浏览器（含新建文件夹）
- **模型配置 + Provider 管理**：Settings 页面、Claude.ai 订阅直连、多 provider 支持
- **前端体验增强**：代码块复制、Context 用量显示、全局 Toast、网络监控、快捷键
- **执行前确认机制**：Agent 写操作前展示步骤预览卡片，用户确认/取消，60s 超时自动取消

#### 模块 16 具体交付

| 类别 | 内容 |
|------|------|
| `rules/detector.py` | `StackDetector`：读取 `package.json`（react）、`pyproject.toml` / `requirements.txt`（fastapi） |
| `rules/engine.py` | `RulesEngine`：全局 `my-workflow` 始终加载，按技术栈加载 React / FastAPI 规范，项目级 `.assistant/rules.md` 最后加载；去掉 frontmatter；缺失文件跳过 |
| `api/chat.py` | `ChatRequest.project_path`；创建会话时生成规范文本，随请求发给 bridge |
| `pi-bridge/server.ts` | 接收 `rules`，通过 `DefaultResourceLoader({ appendSystemPrompt })` 注入 system prompt |
| `chatStore.ts` / `api.ts` | 发送聊天时带上当前项目路径 |
| `pi-bridge/src/cwd.ts` | 会话工作目录使用所选项目路径（不存在则回退到 bridge 目录）；工具和规范都以此为准 |
| 测试 | `test_rules_engine.py` 16 个（检测、合并顺序、项目覆盖、缺失文件、接口转发） |
| 测试结果 | backend 155/155 ✅（无警告），bridge 31/31 ✅，frontend 71/71 ✅ |
| 验证 | 带自定义规则请求 bridge，模型回复按规则以指定词开头 |
| 偏离计划 | 计划写的 `agent/core.py` `build_context()` 不存在，且聊天不经过 `AgentLoop`，改为在聊天路径注入；规范文件实际在 `.pi/skills/<name>/SKILL.md` |

#### 模块 15 具体交付

| 类别 | 内容 |
|------|------|
| `types.py` | `ImageContent`、`MessageContent`；`Message.content` 支持字符串或分段列表；限制：JPEG/PNG/GIF/WebP、≤5MB、每条最多 4 张 |
| `api/chat.py` | 校验图片分段；会话文件只存文字 + `[附图 N 张]`；bridge 返回非 200 时向前端发 `error` 事件 |
| `models/claude.py` | 用户图片转为 Anthropic base64 image block |
| `models/deepseek.py`、`base.py` | 只取文字，兼容分段内容 |
| `pi-bridge/src/content.ts` | 文字/图片分段 → Pi `prompt` 输入 |
| `pi-bridge/src/vision.ts` | 按模型 `input` 能力路由：同 provider 有视觉模型则自动切换，否则忽略图片并提示 |
| `pi-bridge/server.ts` | 带图片的消息不启用 agent 工具；JSON 请求体上限 100KB → 20MB（默认值会拒收截图） |
| `InputBar.tsx` | 📎 多选、粘贴（含截图，页面级监听）、拖拽；超过 5MB 的图片先在浏览器里缩小再检查 |
| `chatStore.ts` | 发送时把当前消息的图片编码为 content 分段；历史消息去掉占位文字 |
| `lib/image.ts` | 类型/大小校验、`prepareImage` 缩放、粘贴/拖拽文件提取、data URL 解析 |
| 测试 | 后端 `test_claude_provider.py`（4）、`test_api_chat_images.py`（8）；bridge `content.test.ts`、`vision.test.ts`（+server 大请求用例）；前端 `image.test.ts`、`InputBar.paste.test.tsx`（5）、`sendWithImage.test.ts` |
| 测试结果 | backend 139/139 ✅，bridge 31/31 ✅，frontend 71/71 ✅ |
| 顺带修复 | `sessions/store.py` 文件句柄泄漏（消除 ResourceWarning） |

#### 模块 14 具体交付（含后续补充）

| 类别 | 内容 |
|------|------|
| `api/files.py` | `GET /api/files/tree`（`root`/`dir`/`depth`，懒加载）、`GET /api/files/content`（`root`+`path`）；忽略 `node_modules`/`.git`/`__pycache__`/`*.pyc`；路径穿越、绝对路径、symlink 逃逸返回 403；二进制 415、超过 1MB 413 |
| `main.py` | 注册 `files_router` |
| `fileBrowserStore.ts` | 根路径、按目录缓存的子节点、展开状态、待附加文件；侧边栏切换视图 |
| `FileTreeNode.tsx` | 递归树节点，展开/折叠（grid-rows 过渡动画），点击文件触发读取 |
| `FileBrowser.tsx` | 跟随当前项目目录、按已加载节点搜索、「Choose root folder」 |
| `Sidebar.tsx` | Sessions / Files 分段切换 |
| `InputBar.tsx` | 点击文件 → 填充「请分析这个文件」草稿 + 文件 chip；发送时附加文件内容 |
| 测试 | `test_files_api.py` 18 用例、`fileBrowserStore.test.ts` 4 用例 |
| 测试结果 | backend 126/126 ✅，frontend 42/42 ✅ |

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

### 待完成（模块 17–19）

| 模块 | 文件 | 内容 |
|------|------|------|
| 17 | 17-trace.md | 日志追踪 |
| 18 | 18-tauri.md | Tauri 桌面打包 |
| 19 | 19-docker.md | Docker 容器隔离（备用） |

## 当前问题

无

## 下一步

等待用户审核模块 16，之后从 `docs/plans/17-trace.md` 开始。
