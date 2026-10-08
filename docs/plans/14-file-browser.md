# 模块 14：项目文件浏览

**目标：** 侧边栏展示项目文件树，点击文件直接发给 agent 分析，无需手动输入路径。

## UI 布局

```
┌──────────────────┬─────────────────────────────┐
│ 📁 项目文件      │                             │
│ ─────────────── │       对话区域               │
│ ▼ src/           │                             │
│   ▼ components/  │                             │
│     ChatPanel.tsx│                             │
│     InputBar.tsx │                             │
│   ▶ stores/      │                             │
│   index.tsx      │                             │
│ ▶ backend/       │                             │
│                  │                             │
│ [选择项目根目录] │                             │
└──────────────────┴─────────────────────────────┘
```

## 文件

**后端**
- `backend/app/api/files.py` — 文件树 / 文件内容 endpoints
- `backend/tests/test_files_api.py`

**前端**
- `frontend/src/components/FileBrowser.tsx` — 文件树主组件
- `frontend/src/components/FileTreeNode.tsx` — 递归树节点（展开/折叠）
- `frontend/src/stores/fileBrowserStore.ts` — 项目根路径、展开状态

## 后端 API

```
GET /api/files/tree?root=<path>&depth=3   → 文件树 JSON
GET /api/files/content?path=<file>        → 文件内容（文本）
```

文件树响应：
```json
{"name": "src", "type": "dir", "children": [
  {"name": "App.tsx", "type": "file", "path": "src/App.tsx", "size": 1234}
]}
```

安全限制：
- 只允许读取用户明确选定的根目录下的文件
- 自动忽略：`node_modules/`, `.git/`, `__pycache__/`, `*.pyc`

## 点击文件 → 发给 Agent

点击文件后，在输入框插入：
```
请分析这个文件：`src/components/ChatPanel.tsx`

[文件内容自动附加]
```

用户可在发送前补充问题，也可直接发送。

## 步骤

- [x] 写 `api/files.py`（tree endpoint + content endpoint + 安全校验）
- [x] 写 `fileBrowserStore.ts`（根路径配置、展开状态管理）
- [x] 写 `FileTreeNode.tsx`（递归渲染，展开/折叠动画）
- [x] 写 `FileBrowser.tsx`（搜索框 + 树 + 选择根目录按钮）
- [x] 接入 InputBar：点击文件 → 填充消息草稿 + 附加文件内容
- [x] 集成到 layout：FileBrowser 与 SessionSidebar 切换（Tab 或分区）
- [x] 写测试（tree 构建、忽略规则、content 读取、路径安全校验）
- [x] `pytest tests/test_files_api.py -v` → 通过

## ⏸ 审核后继续

## 验收标准
- [x] 侧边栏展示项目文件树，支持展开/折叠
- [x] 点击文件自动填充输入框，附加文件内容
- [x] `node_modules/`、`.git/` 等目录自动隐藏
- [x] 只能读取用户选定根目录内的文件（路径穿越防护）
- [x] `pytest tests/test_files_api.py -v` → 通过，0 failed
