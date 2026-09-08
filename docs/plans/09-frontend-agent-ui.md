# 模块 16：前端 Agent 执行界面

**依赖：** 15-pi-sdk.md（backend 需先支持 `permission_request` 事件）

**目标：** 让 Agent 执行过程可视、可控 — 工具调用实时展示，危险操作需用户审批。

## 文件

- `frontend/src/components/ToolCallCard.tsx` — 扩展：显示工具状态（pending/running/done/rejected）、折叠参数与结果
- `frontend/src/components/ApprovalModal.tsx` — 新增：弹窗展示命令详情，提供 Approve / Reject 按钮，倒计时自动拒绝
- `frontend/src/components/AgentStatusBar.tsx` — 新增：顶部状态条，显示 agent 运行状态（idle/thinking/tool_calling/awaiting_approval）
- `frontend/src/stores/chatStore.ts` — 新增 `permissionRequests` 状态，处理 `permission_request` SSE 事件

## 步骤

- [ ] `chatStore.ts`：新增 `permissionRequests` map，添加 `handlePermissionRequest` / `respondPermission` actions
- [ ] `chatStore.ts`：SSE 解析器识别 `permission_request` 事件，写入 store
- [ ] 实现 `ApprovalModal.tsx`：展示命令、风险提示、Approve/Reject 按钮，调用 `respondPermission`
- [ ] 扩展 `ToolCallCard.tsx`：增加状态 badge、可折叠参数/结果区域、耗时显示
- [ ] 实现 `AgentStatusBar.tsx`：根据 store 中最新事件推导状态，带动画指示器
- [ ] 集成到 `ChatPanel`：渲染 `AgentStatusBar` + 条件渲染 `ApprovalModal`
- [ ] 写组件测试：ToolCallCard 状态切换、ApprovalModal 审批流程、StatusBar 状态推导

## 验收标准

- [ ] 工具调用卡片实时显示状态变化，参数和结果可折叠查看
- [ ] bash/write 触发审批弹窗，用户操作后 agent 继续或停止
- [ ] AgentStatusBar 正确反映 agent 当前阶段，无操作 30s 后回到 idle
