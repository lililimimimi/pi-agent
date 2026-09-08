import crypto from "node:crypto";
import express from "express";
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";

const PORT = parseInt(process.env.PI_BRIDGE_PORT || "3100", 10);

// Reusable ModelRuntime (process-level singleton)
let modelRuntimeInstance: ModelRuntime | undefined;

async function getModelRuntime(): Promise<ModelRuntime> {
  if (!modelRuntimeInstance) {
    modelRuntimeInstance = await ModelRuntime.create();
  }
  return modelRuntimeInstance;
}

// In-memory session store for approve flow
const sessions = new Map<string, AgentSession>();

const app = express();
app.use(express.json());

// POST /chat — create session + stream SSE
app.post("/chat", async (req, res) => {
  const { messages, cwd = process.cwd() } = req.body;

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Helper to send SSE data
  function send(event: string, data: Record<string, unknown>) {
    res.write(`data: ${JSON.stringify({ event, data })}\n\n`);
  }

  let runtime: ModelRuntime;
  try {
    runtime = await getModelRuntime();
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to create ModelRuntime";
    send("error", { message });
    send("done", {});
    res.end();
    return;
  }

  let session: AgentSession;
  try {
    const result = await createAgentSession({
      cwd,
      sessionManager: SessionManager.inMemory(),
      modelRuntime: runtime,
      tools: ["read", "bash", "edit", "write"],
    });
    session = result.session;
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to create agent session";
    send("error", { message });
    send("done", {});
    res.end();
    return;
  }

  // Generate session ID for approval flow
  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, session);

  let ended = false;

  function cleanup() {
    if (!ended) {
      ended = true;
      unsubscribe();
      sessions.delete(sessionId);
    }
  }

  // Subscribe to session events
  const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
    switch (event.type) {
      case "message_update": {
        const ame = event.assistantMessageEvent;
        if (ame.type === "text_delta") {
          send("text", { content: ame.delta });
        }
        break;
      }

      case "tool_execution_start":
        send("tool_call", {
          tool_call_id: event.toolCallId,
          tool_name: event.toolName,
          arguments: event.args as Record<string, unknown>,
        });
        break;

      case "tool_execution_end":
        send("tool_result", {
          tool_call_id: event.toolCallId,
          output:
            typeof event.result === "string"
              ? event.result
              : JSON.stringify(event.result),
          is_error: event.isError,
        });
        break;

      case "agent_end": {
        // Extract usage from the messages
        const msgs = event.messages || [];
        for (const msg of msgs) {
          if (
            "role" in msg &&
            msg.role === "assistant" &&
            "usage" in msg &&
            msg.usage
          ) {
            const usage = msg.usage as {
              input: number;
              output: number;
            };
            send("usage", {
              input_tokens: usage.input || 0,
              output_tokens: usage.output || 0,
            });
          }
        }
        send("done", {});
        cleanup();
        res.end();
        break;
      }
    }
  });

  // Construct user message from the last message in the array
  const userMessages = (messages as Array<{ role: string; content: string }>).filter(
    (m) => m.role === "user",
  );
  const lastUserMsg = userMessages[userMessages.length - 1];
  if (!lastUserMsg) {
    send("error", { message: "No user message found" });
    send("done", {});
    cleanup();
    res.end();
    return;
  }

  try {
    await session.prompt(lastUserMsg.content);
  } catch (err: unknown) {
    if (!ended) {
      const message =
        err instanceof Error ? err.message : "Unknown error";
      send("error", { message });
      send("done", {});
      cleanup();
      res.end();
    }
  }

  // Handle client disconnect
  req.on("close", () => {
    cleanup();
  });
});

// POST /approve — accept/reject a permission request
app.post("/approve", async (_req, res) => {
  // NOTE: Permission gating is not yet implemented in Pi SDK's public API.
  // This is a placeholder for when the SDK supports approval flow.
  // const { session_id, tool_call_id, approved } = req.body;
  res.json({ status: "ok" });
});

// GET /health
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

export { app };

// Only start listening when run directly (not imported for testing)
const isMainModule =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));
if (isMainModule) {
  app.listen(PORT, () => {
    console.log(`pi-bridge listening on port ${PORT}`);
  });
}
