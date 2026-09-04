# CodeAssistant — 专属 AI Coding Assistant 设计文档

> 日期：2025-09-05
> 状态：已确认

## 1. 项目概述

构建一个专属的 AI coding assistant 桌面应用，支持多项目管理、多模型切换、完整 Agent 能力，并深度集成个人工作流和代码规范。

### 目标

- 深度集成个人工作流（代码风格规范、项目模板）
- 支持 React/TypeScript 和 FastAPI 两套技术栈
- 学习 agent 框架设计和全栈开发

### 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React + TypeScript + Vite + Tailwind CSS + shadcn/ui |
| 后端 | FastAPI + Python |
| 桌面 | Tauri (Rust) |
| 数据库 | SQLite |
| 通信 | SSE（流式响应）+ REST（操作请求） |

## 2. 整体架构

```
CodeAssistant/
├── frontend/          # React + TypeScript (Vite)
├── backend/           # FastAPI + Python
│   ├── api/           # SSE + REST 端点
│   ├── agent/         # Agent Core — 规划/执行循环
│   ├── models/        # Model Router — 多模型统一接口
│   ├── tools/         # Tool System — 可插拔工具
│   ├── projects/      # Project Manager — 项目与上下文管理
│   └── rules/         # Rules Engine — 全局/项目级代码规范
├── src-tauri/         # Tauri (Rust) — 桌面壳
└── docs/              # 设计文档与规范模板
```

### 数据流

```
用户输入 → Frontend (REST POST) → API Layer → Agent Core
                                                  ↓
                                          Model Router → Claude/OpenAI/Ollama
                                                  ↓
                                          Tool System → 文件/命令/Git
                                                  ↓
                                          SSE 流式响应 → Frontend
```

### 通信方式：SSE + REST

| 做什么 | 方式 | 说明 |
|--------|------|------|
| 发消息 | POST /api/chat | 触发 Agent 处理 |
| 流式响应 | SSE /api/chat/stream | Agent 实时推送文本和工具调用 |
| 审批工具 | POST /api/tool/approve | 用户批准/拒绝工具调用 |
| 取消执行 | POST /api/chat/cancel | 中止当前 Agent 循环 |
| 项目/对话管理 | REST CRUD | 标准增删改查 |

## 3. Agent Core — 核心循环

Agent Core 是系统中枢，负责接收用户消息、组装上下文、调用模型、执行工具调用的完整循环。

### 执行流程

```
用户消息
  ↓
加载上下文（项目文件结构 + 代码规范 + 对话历史）
  ↓
┌─────────── Agent Loop ───────────┐
│  组装 prompt → 调用模型           │
│       ↓                          │
│  模型返回纯文本？→ 流式推送给前端   │
│  模型请求工具调用？               │
│       ↓                          │
│  需要用户审批？                   │
│    是 → SSE 推送审批请求           │
│         等待 POST /tool/approve   │
│    否 → 直接执行                  │
│       ↓                          │
│  执行工具，结果回传模型            │
│  继续循环                        │
└──────────────────────────────────┘
  ↓
任务完成，保存对话历史
```

### 伪代码

```python
async def agent_loop(message, project, conversation):
    context = await build_context(project)
    messages = conversation.history + [message]

    while True:
        stream = model_router.chat(messages, context)

        async for chunk in stream:
            if chunk.type == "text":
                yield sse_event("text", chunk.content)
            elif chunk.type == "tool_call":
                tool = tool_registry.get(chunk.tool_name)

                if tool.requires_approval:
                    yield sse_event("approval_request", chunk)
                    approved = await wait_for_approval()
                    if not approved:
                        messages.append(tool_rejected(chunk))
                        continue

                result = await tool.execute(chunk.args)
                messages.append(tool_result(chunk, result))
                continue

        break

    conversation.save(messages)
```

### 关键设计点

- **工具审批分级**：读取操作自动执行，写操作和命令执行需要用户确认
- **上下文组装**：每次调用模型前注入项目结构、相关代码、代码规范到 system prompt
- **对话历史**：存到本地 SQLite，每个项目独立的对话记录
- **流式输出**：模型每生成一个 token 就通过 SSE 推到前端

## 4. Model Router — 多模型统一接口

### 抽象接口

```python
class ModelProvider(ABC):
    async def chat_stream(self, messages, tools) -> AsyncIterator[Chunk]:
        """流式返回文本或工具调用"""
        ...

    def list_models(self) -> list[ModelInfo]:
        """该供应商下可用的模型"""
        ...
```

### 实现

```
ModelRouter
├── ClaudeProvider    →  Anthropic API (claude-sonnet, opus...)
├── OpenAIProvider    →  OpenAI API (gpt-4o, o3...)
└── OllamaProvider   →  本地 HTTP (localhost:11434)
```

### 关键设计点

- **统一的 Chunk 格式**：输出标准化为 `TextChunk` 和 `ToolCallChunk`，Agent Core 不需要关心底层模型
- **工具描述转换**：内部统一定义工具 schema，Router 负责转成各家格式（Claude `tool_use`、OpenAI `function_calling`）
- **API Key 管理**：存在本地配置文件中，前端可以在设置页配置
- **不做 Fallback 机制**：先手动选择模型，后期有需要再加自动降级

## 5. Tool System — 可插拔工具

### 工具接口

```python
class Tool(ABC):
    name: str
    description: str
    parameters: dict             # JSON Schema
    requires_approval: bool

    async def execute(self, args: dict) -> ToolResult:
        ...
```

### 内置工具清单

| 工具 | 功能 | 需要审批 |
|------|------|----------|
| `read_file` | 读取文件内容 | ❌ |
| `list_directory` | 列出目录结构 | ❌ |
| `search_code` | 搜索代码（grep/ripgrep） | ❌ |
| `write_file` | 创建/覆盖文件 | ✅ |
| `edit_file` | 精确编辑文件片段 | ✅ |
| `run_command` | 执行 shell 命令 | ✅ |
| `git_operation` | Git 操作 | ✅ (push/commit) ❌ (status/log/diff) |

### 注册机制

```python
class ToolRegistry:
    def register(self, tool: Tool):
        ...

    def get_all(self) -> list[Tool]:
        """返回所有工具，供 Model Router 转成模型格式"""
        ...
```

### 安全边界

- 工具只能操作当前项目目录内的文件，路径越界直接拒绝
- `run_command` 的工作目录锁定在项目根目录
- 所有写操作和命令执行记录到日志，前端可查看历史

## 6. Project Manager — 项目与上下文管理

### 数据目录

```
~/.code-assistant/
├── config.yaml              # 全局配置（API keys、默认模型）
├── rules/                   # 全局代码规范
│   ├── react-typescript.md
│   ├── fastapi-python.md
│   └── my-workflow.md
├── db.sqlite                # 对话历史、项目元数据
└── projects/                # 项目索引缓存
```

### 项目感知

添加项目时自动扫描生成上下文：

- **语言/框架检测**：通过 `package.json` → React/TS、`pyproject.toml` → FastAPI
- **文件树快照**：忽略 `node_modules`、`.git` 等
- **关键文件摘要**：README、入口文件、配置文件
- **规范匹配**：根据技术栈自动加载对应全局规范

### 数据库结构（SQLite）

| 表 | 字段 |
|----|------|
| `projects` | id, path, name, detected_stack, created_at |
| `conversations` | id, project_id, title, created_at |
| `messages` | id, conversation_id, role, content, tool_calls, created_at |

## 7. Rules Engine — 代码规范系统

### 文件结构

```
~/.code-assistant/rules/              # 全局规范
├── react-typescript.md               # React/TS 代码规范
├── fastapi-python.md                 # FastAPI 规范
└── my-workflow.md                    # 个人开发习惯

项目根目录/
└── .assistant/
    └── rules.md                      # 项目级规范（覆盖/扩展全局）
```

### 三个全局规范文件

| 文件 | 内容范围 |
|------|----------|
| `react-typescript.md` | 组件写法、命名规范、hooks 使用、类型定义、目录结构、状态管理偏好 |
| `fastapi-python.md` | API 设计风格、Pydantic 模型写法、错误处理、项目分层、命名惯例 |
| `my-workflow.md` | Git commit 习惯、PR 流程、测试要求、注释风格、通用编码偏好 |

### 加载与合并逻辑

```python
def build_rules(project: Project) -> str:
    rules = []

    # 1. 始终加载个人工作流
    rules.append(load("~/.code-assistant/rules/my-workflow.md"))

    # 2. 根据项目技术栈自动匹配
    if project.has("package.json"):
        rules.append(load("~/.code-assistant/rules/react-typescript.md"))
    if project.has("pyproject.toml") or project.has("requirements.txt"):
        rules.append(load("~/.code-assistant/rules/fastapi-python.md"))

    # 3. 项目级规范最后加载，优先级最高
    project_rules = project.path / ".assistant/rules.md"
    if project_rules.exists():
        rules.append(load(project_rules))

    return merge(rules)
```

### 优先级（从低到高）

1. `react-typescript.md` / `fastapi-python.md`（全局，按技术栈自动匹配）
2. `my-workflow.md`（全局，始终加载）
3. `.assistant/rules.md`（项目级，最高优先）

合并方式：Markdown 拼接 + 优先级顺序，模型自然理解"后面的规则覆盖前面的"。项目级规范可以用 `# Override: xxx` 明确覆盖某条全局规范。

### 注入位置

```
System Prompt 结构:
├── 基础人设        "你是一个编码助手..."
├── 项目上下文      文件树、技术栈信息
├── 代码规范（合并后）  ← rules 注入到这里
└── 对话历史
```

## 8. Frontend — 对话 UI

### 页面布局

```
┌─────────────────────────────────────────────────┐
│  Sidebar              │  Main Area              │
│  ┌─────────────────┐  │  ┌───────────────────┐  │
│  │ 🔍 搜索          │  │  │ 项目名 / 模型选择  │  │
│  │                  │  │  │                   │  │
│  │ 📁 项目 A        │  │  │  对话消息流        │  │
│  │   ├ 对话 1       │  │  │  ├ 用户消息        │  │
│  │   ├ 对话 2       │  │  │  ├ AI 回复(Markdown)│  │
│  │   └ 对话 3       │  │  │  ├ 工具调用卡片     │  │
│  │ 📁 项目 B        │  │  │  │  ├ ✅ 已执行     │  │
│  │   └ 对话 1       │  │  │  │  └ 🔔 待审批     │  │
│  │                  │  │  │  └ AI 继续回复      │  │
│  │ ──────────────── │  │  │                   │  │
│  │ ⚙️ 设置          │  │  ├───────────────────┤  │
│  └─────────────────┘  │  │ 📎  输入框     ➤   │  │
│                       │  └───────────────────┘  │
└─────────────────────────────────────────────────┘
```

### 核心组件

| 组件 | 职责 |
|------|------|
| `Sidebar` | 项目列表、对话列表、搜索、设置入口 |
| `ChatView` | 消息流渲染、自动滚动、流式打字效果 |
| `MessageBubble` | 单条消息 — 支持 Markdown / 代码高亮 |
| `ToolCallCard` | 工具调用展示 — 可展开看参数和结果，审批按钮 |
| `InputBar` | 输入框 — 多行、快捷键发送、文件拖拽 |
| `SettingsPanel` | API Key 配置、默认模型、全局规范编辑 |

### 关键体验

- **流式渲染**：SSE 推过来的 token 实时追加，Markdown 边接收边渲染
- **代码块**：语法高亮 + 一键复制 + "应用到文件"按钮
- **工具审批**：卡片内显示要执行的操作，一键批准/拒绝
- **对话管理**：新建、重命名、删除、搜索对话历史

### 技术选型

| 需求 | 方案 |
|------|------|
| 构建工具 | Vite |
| UI 组件库 | shadcn/ui |
| 状态管理 | Zustand |
| Markdown 渲染 | react-markdown + rehype-highlight |
| 代码高亮 | highlight.js |
| 样式 | Tailwind CSS |

## 9. Tauri 桌面集成

### Tauri 的角色（尽量薄）

```
Tauri (Rust)
├── 窗口管理          # 窗口大小、标题栏、系统托盘
├── Python Sidecar    # 启动/管理 FastAPI 后端进程
├── 文件系统权限      # Tauri 权限模型，限制可访问的目录
└── 系统集成          # 原生通知、全局快捷键（可选）
```

### Sidecar 管理

- Tauri 启动时自动拉起 FastAPI 后端
- 前端通过 `localhost:port` 与后端通信
- 关闭 app 时 Tauri 负责 gracefully shutdown 后端进程

### Python 环境方案

- 要求用户本机已安装 Python 3.11+
- 首次启动自动创建 `venv` 并安装依赖
- 不内嵌 Python 运行时，保持 app 体积小

## 10. 开发分期建议

本项目规模较大，建议按以下顺序分期实现，每期独立可用：

### Phase 1：最小可用（MVP）
- 后端：FastAPI 骨架 + Agent Core + Claude Provider + read_file/write_file 工具
- 前端：基础对话 UI（输入框 + 消息流 + 流式渲染）
- 通信：SSE + REST 基本链路跑通
- 目标：能发消息、看到流式回复、执行基本工具调用

### Phase 2：项目管理 + 完整工具
- Project Manager + 项目注册和切换
- 完整工具清单（search_code, edit_file, run_command, git_operation）
- 工具审批机制
- Sidebar 项目/对话列表
- SQLite 对话持久化

### Phase 3：规范系统 + 多模型
- Rules Engine（全局 + 项目级规范加载）
- OpenAI Provider + Ollama Provider
- 模型切换 UI
- 设置面板（API Keys、默认模型）

### Phase 4：桌面打包
- Tauri 集成
- Python Sidecar 管理
- 首次启动引导（环境检测、venv 创建）
- 打包为 .dmg
