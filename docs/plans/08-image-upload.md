# 模块 8：图片上传（多模态）

**目标：** 用户可附加图片发送，Claude Vision 解析后回复。

## 文件
- `backend/app/types.py` — ImageContent, MessageContent（扩展 Message.content）
- `backend/app/models/claude.py` — 格式化 image block
- `backend/app/api/chat.py` — ChatRequest 接受 image 字段
- `frontend/src/types/index.ts` — ImageAttachment
- `frontend/src/components/InputBar.tsx` — 📎 按钮 + 预览
- `frontend/src/components/MessageBubble.tsx` — 渲染图片缩略图

## 后端数据结构

```python
class ImageContent(BaseModel):
    media_type: str  # image/jpeg | image/png | image/gif | image/webp
    data: str        # base64

class MessageContent(BaseModel):
    type: str        # "text" | "image"
    text: str | None = None
    image: ImageContent | None = None

# Message.content: str | list[MessageContent]
```

## Claude API 格式
```python
{"type": "image", "source": {"type": "base64",
  "media_type": "image/png", "data": "<base64>"}}
```

## 前端限制
- 格式：JPEG / PNG / GIF / WebP
- 大小：≤ 5MB
- 每条消息限 1 张（Phase 2 可扩展）
- 浏览器 FileReader → base64，ObjectURL → 本地预览

## 步骤

- [ ] 扩展 `types.py`（ImageContent + MessageContent）
- [ ] 更新 `claude.py` 的 `_convert_messages()`
- [ ] 更新 `api/chat.py`（接受 image 字段）
- [ ] 更新 `InputBar.tsx`（文件选择 + 预览 + 移除）
- [ ] 更新 `MessageBubble.tsx`（渲染已发送图片）
- [ ] 写测试（mock Claude API，验证 image block 格式正确）
- [ ] `pytest tests/test_claude_provider.py -v` → 通过

## ⏸ 审核后继续
