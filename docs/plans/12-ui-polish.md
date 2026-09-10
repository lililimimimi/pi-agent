# 模块 12：前端体验增强

**目标：** 一批独立的前端小功能，统一在一个模块完成，快速提升日常使用体验。

## 功能清单

### 1. 代码块复制按钮
- Markdown 渲染的代码块右上角显示复制图标
- 点击后写入剪贴板，图标变 ✓，1.5s 后复原
- 实现：扩展 `MessageBubble.tsx` 中的 `rehype-highlight` 代码块渲染

### 2. Context 用量显示（右上角）
- 显示当前对话已用 context 占模型上限的百分比
- 格式：`Context 12k / 200k`，进度条颜色：绿→黄（80%）→红（95%）
- 数据来源：SSE `usage` 事件（input_tokens 累计）；模型上限硬编码 map
- 位置：ChatView header 右侧，不抢焦点

### 3. 网络/模型错误提示
- 网络断开 → Toast："网络连接已断开，请检查网络"
- 模型返回错误（4xx/5xx）→ Toast 显示错误信息，含重试按钮
- SSE 中断超过 5s → Toast："连接已中断，正在重连..."
- 实现：全局 Toast 组件 + `useNetworkStatus` hook + chatStore 错误状态

### 4. 快捷键
| 快捷键 | 动作 |
|--------|------|
| `Cmd+Enter` | 发送消息（补充原有 Enter） |
| `Cmd+K` | 新建对话 |
| `Cmd+,` | 打开设置（模块 11 的 SettingsModal） |
| `Cmd+/` | 聚焦输入框 |

实现：`useKeyboardShortcuts` hook，挂载到 App 级别。

## 文件

- `frontend/src/components/MessageBubble.tsx` — 代码块复制按钮
- `frontend/src/components/ContextBar.tsx` — context 用量进度条
- `frontend/src/components/Toast.tsx` — 全局 Toast 组件
- `frontend/src/hooks/useNetworkStatus.ts` — 网络状态检测
- `frontend/src/hooks/useKeyboardShortcuts.ts` — 全局快捷键注册
- `frontend/src/stores/chatStore.ts` — 新增 error 状态 + contextUsage

## 步骤

- [ ] 代码块复制：扩展 MessageBubble，加复制按钮，测试剪贴板写入
- [ ] ContextBar：写组件 + 接入 chatStore usage 数据，注入 ChatView header
- [ ] Toast：写全局 Toast + ToastProvider，注入 App 根节点
- [ ] useNetworkStatus：监听 `online/offline` + SSE 超时，触发 Toast
- [ ] chatStore：处理 SSE 错误事件，写入 error 状态
- [ ] useKeyboardShortcuts：注册 4 个快捷键，挂载到 App
- [ ] 写组件测试：复制按钮状态、Toast 显示/消失、快捷键触发
- [ ] `npx tsc --noEmit` → 无错误

## ⏸ 审核后继续

## 验收标准
- [ ] 代码块一键复制，有视觉反馈
- [ ] 右上角实时显示 context 用量，颜色随用量变化
- [ ] 网络断开 / 模型错误有 Toast 提示
- [ ] Cmd+Enter 发送，Cmd+K 新建，Cmd+, 打开设置，Cmd+/ 聚焦输入框
- [ ] `npx tsc --noEmit` → 无错误
