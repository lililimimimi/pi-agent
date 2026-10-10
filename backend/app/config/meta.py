"""
Provider metadata: which providers exist, their labels, default models and env var names.

No file access here; see app.config.store for config.json and app.config.sync for Pi logins.
"""

from __future__ import annotations

from typing import Any

# ---------------------------------------------------------------------------
# Supported providers & defaults
# ---------------------------------------------------------------------------

PROVIDER_IDS = (
    "pi",
    "anthropic",
    "deepseek",
    "openai",
    "openai-codex",
    "gemini",
    "siliconflow",
    "ollama",
)

PROVIDER_META: dict[str, dict[str, Any]] = {
    "pi": {
        "label": "Claude.ai subscription (Pi)",
        "key_field": "none",
        "placeholder": "",
    },
    "anthropic": {
        "label": "Anthropic (Claude)",
        "key_field": "api_key",
        "placeholder": "sk-ant-...",
    },
    "deepseek": {"label": "DeepSeek", "key_field": "api_key", "placeholder": "sk-..."},
    "openai": {"label": "OpenAI", "key_field": "api_key", "placeholder": "sk-..."},
    "openai-codex": {
        "label": "OpenAI (ChatGPT subscription)",
        "key_field": "none",
        "placeholder": "",
    },
    "gemini": {
        "label": "Google Gemini",
        "key_field": "api_key",
        "placeholder": "AIza...",
    },
    "siliconflow": {
        "label": "SiliconFlow",
        "key_field": "api_key",
        "placeholder": "sk-...",
    },
    "ollama": {
        "label": "Ollama (local)",
        "key_field": "base_url",
        "placeholder": "http://localhost:11434",
    },
}

# Default model lists — used when syncing from env vars (before user tests)
DEFAULT_MODELS: dict[str, list[str]] = {
    "pi": ["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-3-5"],
    "anthropic": ["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-3-5"],
    "deepseek": ["deepseek-chat", "deepseek-reasoner"],
    "openai": ["gpt-4o", "gpt-4o-mini", "o1-mini"],
    "gemini": ["gemini-2.5-pro", "gemini-2.0-flash", "gemini-1.5-pro"],
    "siliconflow": ["Qwen/Qwen2.5-72B-Instruct", "deepseek-ai/DeepSeek-V3"],
    "ollama": [],
}

# Env var name for each provider's API key
ENV_KEY_MAP: dict[str, str] = {
    "anthropic": "ANTHROPIC_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
    "openai": "OPENAI_API_KEY",
    "gemini": "GEMINI_API_KEY",
    "siliconflow": "SILICONFLOW_API_KEY",
}

_DEFAULT_PROVIDER: dict[str, Any] = {
    "api_key": "",
    "base_url": "",
    "enabled": False,
    "models": [],
    "connected": False,
}

_OLLAMA_DEFAULT: dict[str, Any] = {
    "api_key": "",
    "base_url": "http://localhost:11434",
    "enabled": True,
    "models": [],
    "connected": False,
}


CUSTOM_PREFIX = "custom-"


def is_custom_provider(provider_id: str) -> bool:
    return provider_id.startswith(CUSTOM_PREFIX)
