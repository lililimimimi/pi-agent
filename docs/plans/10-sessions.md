# 模块 10：会话持久化

**目标：** 刷新不丢历史，侧边栏管理 session 和项目，与 Pi 生态兼容。

## 存储

```
~/.pi/agent/sessions/<uuid>.jsonl   # 每行一条 JSON
~/.pi/agent/projects.json           # 已添加的项目列表
```

JSONL 行格式：`meta`（首行，含自动标题）/ `message` / `tool_call`
- title = 用户第一条消息前 20 字，写入后不再修改

## 文件

**后端：** `sessions/store.py` · `sessions/models.py` · `api/sessions.py` · `api/projects.py`

**前端：** `sessionStore.ts` · `projectStore.ts` · `SessionSidebar.tsx` · `SessionItem.tsx` · `AddProjectModal.tsx` · `NewMenu.tsx`

## API

```
GET/POST/DELETE  /api/sessions      /api/sessions/:id
GET/POST/DELETE  /api/projects      /api/projects/:id
```

POST /api/projects 需校验目录存在；name 自动取目录名。

## 侧边栏交互

```
PROJECTS  [📁+]  [＋]
▼ pi-agent
  [🔍 搜索...]
  今天
    ▸ 帮我优化登录组件   14:32
```

- `[📁+]` → AddProjectModal（输入路径）
- `[＋]` → 浮层菜单：📁 新建项目 / 💬 新建对话（同 Cmd+K）

## 步骤

- [ ] `sessions/models.py`：SessionMeta, SessionRecord
- [ ] `sessions/store.py`：create / append / list / get / delete
- [ ] `api/sessions.py`：CRUD endpoints
- [ ] `api/chat.py`：append user/assistant；首条消息截取 title
- [ ] `api/projects.py`：CRUD + 路径校验，持久化到 projects.json
- [ ] `sessionStore.ts` + `projectStore.ts`（Zustand）
- [ ] `AddProjectModal.tsx` + `NewMenu.tsx`
- [ ] `SessionSidebar.tsx` + `SessionItem.tsx`，集成 header 图标
- [ ] 写测试：session CRUD、project 路径校验、title 截取
- [ ] `pytest tests/test_sessions.py -v` → 通过

## ⏸ 审核后继续

## 验收标准
- [ ] 刷新后历史完整保留，title 自动取首条消息前 20 字
- [ ] 侧边栏按时间倒序显示 session，搜索框实时过滤
- [ ] `[📁+]` 添加项目（校验路径）；`[＋]` 菜单新建项目/对话
- [ ] `.jsonl` 格式与 Pi web 兼容
- [ ] `pytest tests/test_sessions.py -v` → 0 failed
