# 模块 11：模型配置

**目标：** 设置页面配置各 provider 的 API Key，检测可用模型并显示连接状态，解决 Anthropic 403 等鉴权问题。

## 支持的 Provider

| Provider | API Key | 备注 |
|----------|---------|------|
| Anthropic (Claude) | `ANTHROPIC_API_KEY` | console.anthropic.com |
| DeepSeek | `DEEPSEEK_API_KEY` | platform.deepseek.com |
| OpenAI | `OPENAI_API_KEY` | platform.openai.com |
| SiliconFlow | `SILICONFLOW_API_KEY` | 国内中转，支持多个模型 |
| Ollama | 无需 Key | 本地服务，配置 base URL |

## 文件

**后端**
- `backend/app/config/providers.py` — ProviderConfig，读写 `~/.pi/agent/config.json`
- `backend/app/api/providers.py` — REST endpoints（CRUD + 连接测试）
- `backend/tests/test_providers.py`

**前端**
- `frontend/src/components/SettingsModal.tsx` — 设置弹窗（Cmd+, 打开）
- `frontend/src/components/ProviderCard.tsx` — 单个 provider 配置卡片

## 配置存储

```json
// ~/.pi/agent/config.json
{
  "providers": {
    "anthropic":   { "api_key": "sk-ant-...", "enabled": true },
    "deepseek":    { "api_key": "sk-...",     "enabled": true },
    "openai":      { "api_key": "sk-...",     "enabled": false },
    "siliconflow": { "api_key": "sk-...",     "enabled": true },
    "ollama":      { "base_url": "http://localhost:11434", "enabled": true }
  }
}
```

API Key 写入本地文件，不进 `.env`，不提交 git。

## 后端 API

```
GET  /api/providers              → 返回所有 provider 状态（key 脱敏：sk-ant-...****）
PUT  /api/providers/:id          → 更新 api_key / base_url / enabled
POST /api/providers/:id/test     → 发送最小请求，返回 {ok, latency_ms, models[]}
GET  /api/providers/:id/models   → 返回该 provider 可用模型列表
```

## 连接测试逻辑

```python
# 每个 provider 的测试策略
anthropic:   GET /v1/models（或发 1 token 请求）
deepseek:    GET /v1/models
openai:      GET /v1/models
siliconflow: GET /v1/models
ollama:      GET http://localhost:11434/api/tags
```

返回：`{ok: true, latency_ms: 234, models: ["claude-3-5-sonnet", ...]}`

## 前端 ProviderCard

```
┌─ Anthropic (Claude) ────────────────── ● 已连接 ─┐
│ API Key  [sk-ant-...****          ] [测试连接]    │
│ 可用模型  claude-3-5-sonnet / claude-3-haiku      │
└──────────────────────────────────────────────────┘

┌─ Ollama ──────────────────────────── ○ 未连接 ──┐
│ Base URL [http://localhost:11434  ] [测试连接]   │
│                                                  │
└──────────────────────────────────────────────────┘
```

- 状态指示：● 已连接（绿）/ ○ 未配置（灰）/ ✕ 连接失败（红）
- 测试连接后实时刷新模型列表
- 模型选择器只显示已连接 provider 的模型

## 步骤

- [ ] 写 `config/providers.py`（读写 `~/.pi/agent/config.json`，key 脱敏）
- [ ] 写 `api/providers.py`（list / update / test / models 四个 endpoints）
- [ ] 实现各 provider 的连接测试逻辑（httpx 异步请求）
- [ ] 写 `SettingsModal.tsx`（弹窗框架，Cmd+, 触发）
- [ ] 写 `ProviderCard.tsx`（输入框 + 测试按钮 + 状态指示 + 模型列表）
- [ ] 接入模型选择器：只展示 enabled + 已连接的 provider 模型
- [ ] 写测试（mock httpx，测试各 provider test 逻辑；config 读写）
- [ ] `pytest tests/test_providers.py -v` → 通过

## ⏸ 审核后继续

## 验收标准
- [ ] 五个 provider 均可配置 API Key / Base URL
- [ ] 测试连接按钮返回状态和可用模型列表
- [ ] 模型选择器只显示已连接的模型
- [ ] API Key 脱敏显示，不明文存 git
- [ ] `pytest tests/test_providers.py -v` → 通过，0 failed
