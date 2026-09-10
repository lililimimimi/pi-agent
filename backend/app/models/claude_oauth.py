"""
ClaudeOAuthProvider — 复用 Pi CLI 的 Claude.ai 订阅 OAuth token。

与 ClaudeProvider 相同的流式逻辑，但使用
  anthropic.AsyncAnthropic(auth_token=<oat01-...>)
而非 api_key，这样不消耗 API 额度，走的是订阅计费。
"""
from __future__ import annotations

from app.config.pi_oauth import get_access_token
from app.models.claude import ClaudeProvider, _MODELS
from app.models.base import ModelInfo


class ClaudeOAuthProvider(ClaudeProvider):
    """Claude via Pi CLI OAuth — no API key needed."""

    provider_name = "pi"

    def __init__(self) -> None:
        token = get_access_token()
        if not token:
            raise RuntimeError("Pi OAuth token not available or expired.")
        try:
            import anthropic
        except ImportError as exc:
            raise RuntimeError("anthropic package not installed.") from exc

        self._anthropic = anthropic
        # auth_token → SDK sends "Authorization: Bearer <token>"
        self._client = anthropic.AsyncAnthropic(auth_token=token)

    def list_models(self) -> list[ModelInfo]:
        # Return the same hardcoded model list, but tagged as "pi" provider
        return [
            ModelInfo(
                id=m.id,
                name=m.name,
                provider="pi",
                supports_tools=m.supports_tools,
            )
            for m in _MODELS
        ]
