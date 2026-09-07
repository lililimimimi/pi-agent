# 模块 7：集成接线 ✅

**目标：** 将模块 1-6 串联为可用系统 — 注入 Security、跳过审批、智能 Provider 降级、集成测试。

## 问题

1. SecurityInterceptor 未注入 AgentLoop
2. 审批流程无恢复机制，工具执行中断
3. 前端 provider 硬编码，无 API Key 时报错
4. 无集成测试，从未验证完整链路

## 修复

- `container.py` 新增 `security_interceptor` 单例，`chat.py` 传入 AgentLoop
- `core.py` 注释掉 `check_approval()` 分支，所有工具自动执行
- 新增 `GET /api/models/default`：优先非 mock provider，全部不可用时降级 mock
- 前端启动时调 `/api/models/default`，无用户偏好时自动选择，有偏好则保留

## 文件

- `backend/app/container.py` — 新增 `security_interceptor`
- `backend/app/main.py` — 初始化 SecurityInterceptor
- `backend/app/api/chat.py` — AgentLoop 传入 security_interceptor
- `backend/app/agent/core.py` — 跳过 check_approval 分支
- `backend/app/api/models.py` — 新增 `/api/models/default`
- `backend/app/models/base.py` — ModelRouter 新增 `providers` 属性
- `frontend/src/services/api.ts` — 新增 `fetchDefaultModel()`
- `frontend/src/stores/chatStore.ts` — 新增 `initProvider` action
- `frontend/src/App.tsx` — 启动时调用 `initProvider`
- `backend/tests/test_integration.py` — 集成测试

## 步骤

- [x] 注入 SecurityInterceptor（container → main → chat）
- [x] 跳过审批分支，更新相关测试
- [x] 新增 `GET /api/models/default` + 测试
- [x] 集成测试：工具执行流 + 安全拦截流
- [x] 前端智能 provider 降级
- [ ] 手动联调验证

## 验收标准

- [x] `cd backend && python -m pytest tests/ -v` → 53 passed
- [x] `cd frontend && npx tsc --noEmit` → 无错误
- [ ] 手动联调：发消息 → 流式回复 → 工具自动执行
