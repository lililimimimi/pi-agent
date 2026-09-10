# Module 13: Execution Preview (执行前确认)

- [x] 后端 `types.py`：新增 `ExecutionPreviewEvent`
- [x] 后端 `api/preview.py`：confirm / cancel endpoints（转发到 bridge）
- [x] 后端 `api/chat.py`：透传 `execution_preview` 开关 + 测试
- [x] pi-bridge `src/preview.ts`：步骤提取 + PreviewRegistry
- [ ] pi-bridge `src/preview.test.ts`：preview 生成、confirm、超时取消 测试
- [ ] pi-bridge `server.ts`：扩展 `tool_call` hook → emit preview → 等待 confirm
- [ ] pi-bridge `server.ts`：`/preview/:id/confirm` / `/cancel` endpoints + 测试
- [ ] 前端 `services/api.ts`：confirm/cancel 调用
- [ ] 前端 `types/index.ts`：`execution_preview` SSE 事件类型
- [ ] 前端 `stores/chatStore.ts`：处理 `execution_preview` 事件 + confirm/cancel action
- [ ] 前端 `components/ExecutionPreviewCard.tsx`：步骤列表 + 确认/取消 + 60s 倒计时
- [ ] 前端 `App.tsx`：条件渲染 ExecutionPreviewCard
- [ ] 前端测试：ExecutionPreviewCard 渲染 + 确认/取消/倒计时
- [ ] 验证：`npx tsc --noEmit && npx vitest run`、`pytest tests/`、`npm test` (bridge)
- [ ] 更新 `docs/plans/13-execution-preview.md` 勾选 + `PROGRESS.md`

## ⏸ 审核后继续
