# 模块 10：Tauri 桌面打包

**目标：** 将前后端打包为 macOS 原生 .app / .dmg。

## 文件
- `src-tauri/` — Tauri Rust 项目（`tauri init` 生成）
- `src-tauri/src/main.rs` — 启动 FastAPI sidecar，监听退出
- `src-tauri/tauri.conf.json` — 窗口配置、sidecar 权限
- `scripts/build-backend.sh` — 打包 Python 为单文件可执行（PyInstaller）

## 职责划分

```
Tauri (Rust)
├── 启动 FastAPI sidecar（打包后的可执行文件）
├── 等待后端就绪（health check 轮询，最多 10s）
├── 打开前端窗口（加载 localhost:8000 或内嵌静态文件）
└── 窗口关闭 → 终止 sidecar 进程
```

## Python 打包方案

```bash
# 不内嵌 Python 运行时（用户需安装 Python 3.11+）
# 首次启动自动创建 venv
src-tauri/resources/setup.sh:
  python3 -m venv .venv
  .venv/bin/pip install -r requirements.txt
```

## tauri.conf.json 关键配置

```json
{
  "bundle": { "identifier": "com.yourname.code-assistant" },
  "app": { "windows": [{ "width": 1200, "height": 800 }] },
  "plugins": { "shell": { "sidecar": true } }
}
```

## 步骤

- [ ] `cargo install tauri-cli` + `npx tauri init`
- [ ] 写 `main.rs`（sidecar 启动 + health check + 退出处理）
- [ ] 配置 `tauri.conf.json`（窗口、权限、bundle ID）
- [ ] 写 `scripts/setup-venv.sh`（首次启动创建 venv）
- [ ] `npm run tauri dev` → 验证前后端在 Tauri 窗口内运行
- [ ] `npm run tauri build` → 生成 .dmg，安装后冷启动测试

## ⏸ 审核后 Phase 2 完成

## 验收标准
- [ ] 安装依赖并通过所有测试：`pip install -e ".[dev]" && python -m pytest tests/ -v`
- [ ] 无警告，无跳过（0 failed, 0 skipped）
- [ ] 我审核代码通过
- [ ] 我确认后才 commit
