from __future__ import annotations

from typing import AsyncIterator, Any

from app.models.base import ModelRouter
from app.tools.base import ToolRegistry
from app.types import (
    Message, Role, SSEEvent,
    TextChunk, ToolCallChunk,
    ToolCall, ToolResult,
)


class AgentLoop:
    MAX_ITERATIONS = 20

    def __init__(
        self,
        model_router: ModelRouter,
        tool_registry: ToolRegistry,
        security_interceptor: Any | None = None,
    ) -> None:
        self._router = model_router
        self._tools = tool_registry
        self._security = security_interceptor

    async def run(
        self,
        provider_name: str,
        model_id: str,
        messages: list[Message],
    ) -> AsyncIterator[SSEEvent]:
        provider = self._router.get_provider(provider_name)
        if provider is None:
            yield SSEEvent(event="error", data={"message": f"Unknown provider: {provider_name}"})
            return

        tool_schemas = self._tools.get_schemas()
        history = list(messages)
        session_paused = False

        for _ in range(self.MAX_ITERATIONS):
            tool_calls_this_turn: list[ToolCallChunk] = []
            text_this_turn = ""

            async for chunk in provider.chat_stream(model_id, history, tool_schemas):
                if isinstance(chunk, TextChunk):
                    text_this_turn += chunk.content
                    yield SSEEvent(event="text", data={"content": chunk.content})

                elif isinstance(chunk, ToolCallChunk):
                    tool_calls_this_turn.append(chunk)
                    yield SSEEvent(event="tool_call", data={
                        "tool_call_id": chunk.tool_call_id,
                        "tool_name": chunk.tool_name,
                        "arguments": chunk.arguments,
                    })

            # No tool calls — model finished
            if not tool_calls_this_turn:
                break

            # Record assistant turn
            history.append(Message(
                role=Role.ASSISTANT,
                content=text_this_turn,
                tool_calls=[
                    ToolCall(
                        tool_call_id=tc.tool_call_id,
                        tool_name=tc.tool_name,
                        arguments=tc.arguments,
                    )
                    for tc in tool_calls_this_turn
                ],
            ))

            # Execute each tool call
            tool_results: list[ToolResult] = []
            paused = False

            for tc in tool_calls_this_turn:
                tool = self._tools.get(tc.tool_name)

                # Unknown tool
                if tool is None:
                    result = ToolResult(
                        tool_call_id=tc.tool_call_id,
                        output=f"Tool '{tc.tool_name}' not found.",
                        is_error=True,
                    )
                    yield SSEEvent(event="tool_result", data={
                        "tool_call_id": tc.tool_call_id,
                        "output": result.output,
                        "is_error": True,
                    })
                    tool_results.append(result)
                    continue

                # Security check (if interceptor is set)
                if self._security is not None:
                    check = self._security.before_tool_call(tc.tool_name, tc.arguments)
                    if not check.allowed:
                        result = ToolResult(
                            tool_call_id=tc.tool_call_id,
                            output=f"Security violation: {check.reason}",
                            is_error=True,
                        )
                        yield SSEEvent(event="security_violation", data={
                            "tool_call_id": tc.tool_call_id,
                            "reason": check.reason,
                        })
                        yield SSEEvent(event="tool_result", data={
                            "tool_call_id": tc.tool_call_id,
                            "output": result.output,
                            "is_error": True,
                        })
                        tool_results.append(result)
                        continue

                # Approval required — pause loop
                if tool.check_approval(tc.arguments):
                    yield SSEEvent(event="approval_request", data={
                        "tool_call_id": tc.tool_call_id,
                        "tool_name": tc.tool_name,
                        "arguments": tc.arguments,
                    })
                    yield SSEEvent(event="waiting_for_approval", data={
                        "tool_call_id": tc.tool_call_id,
                    })
                    paused = True
                    break

                # Auto-execute
                result = await tool.execute(tc.arguments)
                result.tool_call_id = tc.tool_call_id
                yield SSEEvent(event="tool_result", data={
                    "tool_call_id": tc.tool_call_id,
                    "output": result.output,
                    "is_error": result.is_error,
                })
                tool_results.append(result)

            if paused:
                session_paused = True
                break

            history.append(Message(
                role=Role.TOOL,
                content="",
                tool_results=tool_results,
            ))

        if not session_paused:
            yield SSEEvent(event="done", data={})
