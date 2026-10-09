# 模块 19：Tauri 桌面打包

**依赖：** 模块 18（用 agent 做网页）通过，三个服务能一起运行。

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
├── 启动 pi-bridge sidecar（Node 服务，运行 AI 代理，端口 3100）
├── 等待两个服务就绪（health check 轮询，最多 10s）
├── 打开前端窗口（加载 localhost:8000 或内嵌静态文件）
└── 窗口关闭 → 终止两个 sidecar 进程
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

## 第一步：一键启动（先人工测试）

**文件：** `scripts/start.sh`（已写好，日志在 `logs/`）

- [ ] 关掉已在运行的三个服务，执行 `./scripts/start.sh`，浏览器自动打开应用，能发一条消息得到回复
- [ ] 按 Ctrl+C，`lsof -i :8000 -i :3100 -i :5173` 无输出（端口已释放）
- [ ] 端口已被占用时，给出清晰提示并退出

这一步通过后，再开始下面的学习步骤。

## 学习步骤（每一步单独验证，再进入下一步）

在项目外的单独文件夹里做前 3 步，不改动本项目。

1. [ ] 装工具：Rust（rustup）、Tauri CLI、Xcode 命令行工具
2. [ ] 最小 Tauri 应用：能打开一个窗口，显示一行字
3. [ ] 让 Tauri 启动一个 Python 小程序作为 sidecar，退出窗口时它也退出
4. [ ] 换成真正的 FastAPI 后端：Tauri 启动它，等 `/api/health` 通过后才打开窗口
5. [ ] 加入 pi-bridge：两个服务一起启动、一起关闭
6. [ ] 打包：前端 `vite build`，后端用 PyInstaller，pi-bridge 打包成可执行文件，再 `tauri build`

**待定：** Python 的打包方式（PyInstaller 单文件，或 venv 首次启动创建）。第 6 步开始前先选定。

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
