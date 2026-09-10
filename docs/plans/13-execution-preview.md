# 模块 13：执行前确认机制

**目标：** Agent 在执行工具调用前，先用自然语言描述打算做什么，用户确认后再执行，提升透明度和可控性。

## 交互流程

```
用户：帮我把 main.py 里的 foo() 重构成异步函数

Agent：我打算做以下操作：
  1. 读取 main.py 查看当前实现
  2. 修改 foo() 为 async def，更新所有调用点
  3. 运行 pytest 验证无回归

  [继续执行]  [取消]

→ 用户点击「继续执行」
→ Agent 开始逐步执行，每步通过 ToolCallCard 实时展示
```

## 设计决策

- **触发时机**：仅在对话首次工具调用前触发一次（非每个工具调用都确认）
- **自动跳过**：只读操作（read_file、list_dir）不触发确认
- **超时**：60s 无响应 → 自动取消，提示用户
- **可关闭**：设置里可全局关闭此机制（高级用户）

## 文件

**后端**
- `pi-bridge/src/preview.ts` — 生成执行预览的 prompt
- `backend/app/types.py` — ExecutionPreviewEvent

**前端**
- `frontend/src/components/ExecutionPreviewCard.tsx` — 预览卡片 + 确认/取消按钮
- `frontend/src/stores/chatStore.ts` — 新增 executionPreview 状态

## SSE 事件

```json
{"event": "execution_preview", "data": {
  "preview_id": "<uuid>",
  "steps": ["读取 main.py", "修改 foo()", "运行 pytest"],
  "has_write_ops": true
}}
```

Bridge 在生成第一个工具调用前先 emit 此事件，等待前端 POST `/api/preview/:id/confirm` 再继续。

## 步骤

- [ ] `types.py`：新增 `ExecutionPreviewEvent`
- [ ] `pi-bridge/src/preview.ts`：从 agent plan 提取步骤列表
- [ ] bridge `server.ts`：emit preview 事件 → 等待 confirm
- [ ] `backend/app/api/preview.py`：confirm / cancel endpoints
- [ ] `ExecutionPreviewCard.tsx`：渲染步骤列表 + 按钮 + 60s 倒计时
- [ ] `chatStore.ts`：处理 `execution_preview` SSE 事件
- [ ] 集成到 `ChatPanel`：条件渲染 ExecutionPreviewCard
- [ ] 写测试：preview 生成、confirm 流转、超时取消
- [ ] `pytest tests/ -v` → 通过

## ⏸ 审核后继续

## 验收标准
- [ ] Agent 执行前显示步骤预览卡片
- [ ] 用户点击「继续执行」后 agent 正常运行
- [ ] 用户点击「取消」后 agent 停止，消息提示已取消
- [ ] 60s 无操作自动取消
- [ ] 只读操作不触发预览
