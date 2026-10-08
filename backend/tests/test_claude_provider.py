"""
Tests for image content in the Claude provider.

The Anthropic client is mocked, so these check the request body we build,
not the live API.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from app.models.claude import ClaudeProvider, _to_anthropic_messages
from app.types import ImageContent, Message, MessageContent, Role


PNG_B64 = "iVBORw0KGgo="


def _image_message(text: str = "what is this?") -> Message:
    return Message(
        role=Role.USER,
        content=[
            MessageContent(type="text", text=text),
            MessageContent(
                type="image",
                image=ImageContent(media_type="image/png", data=PNG_B64),
            ),
        ],
    )


def test_text_only_user_message_stays_a_string():
    out = _to_anthropic_messages([Message(role=Role.USER, content="hello")])
    assert out == [{"role": "user", "content": "hello"}]


def test_image_message_becomes_text_and_base64_image_blocks():
    out = _to_anthropic_messages([_image_message()])

    assert out == [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "what is this?"},
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": PNG_B64,
                    },
                },
            ],
        }
    ]


def test_assistant_message_with_list_content_is_flattened_to_text():
    msg = Message(
        role=Role.ASSISTANT,
        content=[MessageContent(type="text", text="it is a cat")],
    )
    out = _to_anthropic_messages([msg])
    assert out == [{"role": "assistant", "content": [{"type": "text", "text": "it is a cat"}]}]


async def test_chat_stream_sends_image_block_to_api():
    provider = ClaudeProvider(api_key="test-key")

    captured: dict = {}

    class _EmptyStream:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        def __aiter__(self):
            return self

        async def __anext__(self):
            raise StopAsyncIteration

    def _fake_stream(**kwargs):
        captured.update(kwargs)
        return _EmptyStream()

    with patch.object(provider._client.messages, "stream", MagicMock(side_effect=_fake_stream)):
        chunks = [c async for c in provider.chat_stream("claude-sonnet-4-5", [_image_message()], [])]

    assert chunks == []
    user_content = captured["messages"][0]["content"]
    assert user_content[1] == {
        "type": "image",
        "source": {"type": "base64", "media_type": "image/png", "data": PNG_B64},
    }
