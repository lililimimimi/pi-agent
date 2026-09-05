# 模块 4：React 前端

**目标：** 对话 UI — 流式渲染、工具审批、图片上传、Token 用量显示。

## 技术栈
Vite + React 19 + TypeScript + Tailwind CSS + shadcn/ui + Zustand

## 文件
- `frontend/src/types/index.ts` — Message, ToolCall, TokenUsage, ImageAttachment
- `frontend/src/services/api.ts` — createChat(), streamChat(), approveToolCall()
- `frontend/src/stores/chatStore.ts` — Zustand: messages, streaming, tokenUsage
- `frontend/src/components/ChatView.tsx` — 消息列表 + 自动滚动
- `frontend/src/components/MessageBubble.tsx` — Markdown + 代码高亮 + 图片渲染
- `frontend/src/components/InputBar.tsx` — 输入框 + 图片附件 + 发送
- `frontend/src/components/ToolCallCard.tsx` — 工具调用展示 + 审批按钮
- `frontend/src/components/TokenCounter.tsx` — ↑ input / ↓ output • total

## UI 布局
```
┌──────────────────────────────────┐
│  CodeAssistant  [TokenCounter]   │  ← 顶部 header
├──────────────────────────────────┤
│  消息列表（自动滚动）              │  ← ScrollArea
│  ├ 用户消息（右对齐，含图片）      │
│  └ AI 回复（Markdown + ToolCard）│
├──────────────────────────────────┤
│  [📎]  输入框...           [➤]  │  ← InputBar
└──────────────────────────────────┘
```

## 步骤

- [ ] `npm create vite@latest frontend -- --template react-ts`
- [ ] 安装依赖：tailwind、shadcn/ui、zustand、react-markdown、highlight.js
- [ ] 写 types + api service（SSE 解析）
- [ ] 写 chatStore（处理 text / tool_call / tool_result / usage / done 事件）
- [ ] 写四个组件（ChatView / MessageBubble / InputBar / ToolCallCard / TokenCounter）
- [ ] `npx tsc --noEmit` → 无错误
- [ ] 启动前后端联调：发消息 → 看到流式回复

## ⏸ 展示 tsc 结果 + 浏览器截图，审核后继续模块 5

## 验收标准
- [ ] 安装依赖并通过所有测试：`pip install -e ".[dev]" && python -m pytest tests/ -v`
- [ ] 无警告，无跳过（0 failed, 0 skipped）
- [ ] 我审核代码通过
- [ ] 我确认后才 commit
