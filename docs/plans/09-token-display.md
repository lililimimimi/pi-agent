# 模块 9：Token 用量显示

**目标：** 实时显示每次对话的 token 消耗（输入 / 输出 / 总计）。

## 文件
- `backend/app/types.py` — UsageInfo, UsageChunk
- `backend/app/models/claude.py` — 捕获 message_start / message_delta
- `backend/app/agent/core.py` — 转发 usage SSE 事件
- `frontend/src/types/index.ts` — TokenUsage
- `frontend/src/stores/chatStore.ts` — 存储 tokenUsage
- `frontend/src/components/TokenCounter.tsx`

## 后端：从 Claude stream 捕获

```python
# message_start → input_tokens
# message_delta → output_tokens
# message_stop  → emit UsageChunk
class UsageChunk(BaseModel):
    type: str = "usage"
    usage: UsageInfo  # input_tokens, output_tokens, total_tokens
```

## SSE 事件
```
data: {"event": "usage", "data": {"input_tokens": 1234,
        "output_tokens": 567, "total_tokens": 1801}}
```

## 前端 TokenCounter
```tsx
// 显示在 ChatView header 右侧
↑ 1,234  /  ↓ 567  •  1,801 tokens
```
- 每次新对话重置为 null（不显示）
- 收到 usage 事件后更新
- 使用 `toLocaleString()` 格式化数字

## 步骤

- [ ] 添加 `UsageInfo` / `UsageChunk` 到 `types.py`
- [ ] 更新 `claude.py`（捕获 message_start + message_delta）
- [ ] 更新 `agent/core.py`（yield usage SSEEvent）
- [ ] 添加 `TokenUsage` 到前端 types，更新 chatStore
- [ ] 写 `TokenCounter.tsx`，注入 ChatView header
- [ ] `pytest tests/test_claude_provider.py -v` → 通过
- [ ] `npx tsc --noEmit` → 无错误

## ⏸ 审核后继续
