# 模块 7：多模型切换

**目标：** 支持 Claude / OpenAI / Ollama，前端可切换模型。

## 文件
- `backend/app/models/base.py` — ModelProvider ABC, ModelRouter
- `backend/app/models/claude.py` — ClaudeProvider（已有，扩展）
- `backend/app/models/openai.py` — OpenAIProvider
- `backend/app/models/ollama.py` — OllamaProvider（localhost:11434）
- `backend/app/api/models.py` — GET /api/models
- `frontend/src/components/ModelSelector.tsx`

## Provider 接口

```python
class ModelProvider(ABC):
    provider_name: str

    def list_models(self) -> list[ModelInfo]: ...
    async def chat_stream(self, model_id, messages, tools
                         ) -> AsyncIterator[TextChunk | ToolCallChunk | UsageChunk]: ...
```

## 工具格式转换（Router 负责）
- Claude → `tool_use` / `tool_result` 格式
- OpenAI → `function_calling` 格式
- Ollama → 仅支持工具的模型（llama3.1+）

## API
```
GET /api/models → [{ id, name, provider, supports_tools, supports_vision }]
```

## 前端 ModelSelector
顶部 header 下拉框：`claude-sonnet-4` ▾，切换后存 localStorage。

## 步骤

- [ ] 写 `openai.py`（openai SDK，stream=True）
- [ ] 写 `ollama.py`（httpx 调用 localhost:11434，无 SDK）
- [ ] 写 `api/models.py`（GET /api/models）
- [ ] 写 `ModelSelector.tsx`（下拉 + localStorage 记忆）
- [ ] 写测试（mock HTTP，验证 chunk 格式统一）
- [ ] `pytest tests/test_model_router.py -v` → 通过

## ⏸ 审核后继续

## 验收标准
- [ ] 安装依赖并通过所有测试：`pip install -e ".[dev]" && python -m pytest tests/ -v`
- [ ] 无警告，无跳过（0 failed, 0 skipped）
- [ ] 我审核代码通过
- [ ] 我确认后才 commit
