import crypto from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as dotenv from "dotenv";
import express from "express";

// 加载后端 .env（bridge 和 backend 在同一项目根目录下）
const envPath = resolve(fileURLToPath(import.meta.url), "../../backend/.env");
dotenv.config({ path: envPath });
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import type { AgentSession, AgentSessionEvent } from "@earendil-works/pi-coding-agent";

const PORT = parseInt(process.env.PI_BRIDGE_PORT || "3100", 10);

// Provider → env var mapping for API keys
const PROVIDER_KEY_ENV: Record<string, string> = {
  deepseek: "DEEPSEEK_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
};

// Model ID overrides: when frontend sends non-Pi-SDK model IDs
// e.g. "deepseek-ai/DeepSeek-V3" → "deepseek-v4-flash"
const MODEL_ALIASES: Record<string, string> = {
  "deepseek-ai/DeepSeek-V3": "deepseek-v4-flash",
  "deepseek-ai/DeepSeek-R1": "deepseek-v4-pro",
};

let modelRuntimeInstance: ModelRuntime | undefined;

async function getModelRuntime(provider: string): Promise<ModelRuntime> {
  if (!modelRuntimeInstance) {
    modelRuntimeInstance = await ModelRuntime.create();
  }
  // Inject API key for the provider if available via env
  const keyEnv = PROVIDER_KEY_ENV[provider];
  if (keyEnv && process.env[keyEnv]) {
    await modelRuntimeInstance.setRuntimeApiKey(provider, process.env[keyEnv]!);
  }
  return modelRuntimeInstance;
}

const sessions = new Map<string, AgentSession>();

export const app = express();
app.use(express.json());

app.post("/chat", async (req, res) => {
  const { messages, provider = "anthropic", model: rawModel } = req.body;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  function send(event: string, data: Record<string, unknown>) {
    res.write(`data: ${JSON.stringify({ event, data })}\n\n`);
  }

  let runtime: ModelRuntime;
  try {
    runtime = await getModelRuntime(provider);
  } catch (err: unknown) {
    send("error", { message: err instanceof Error ? err.message : "Failed to init runtime" });
    send("done", {});
    res.end();
    return;
  }

  // Resolve model: alias first, then look up in runtime
  const modelId = MODEL_ALIASES[rawModel] ?? rawModel;
  const model = runtime.getModel(provider, modelId);

  let session: AgentSession;
  try {
    const result = await createAgentSession({
      sessionManager: SessionManager.inMemory(),
      modelRuntime: runtime,
      tools: ["read", "bash", "edit", "write"],
      ...(model ? { model } : {}),
    });
    session = result.session;
  } catch (err: unknown) {
    send("error", { message: err instanceof Error ? err.message : "Failed to create session" });
    send("done", {});
    res.end();
    return;
  }

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
          output: typeof event.result === "string" ? event.result : JSON.stringify(event.result),
          is_error: event.isError,
        });
        break;
      case "agent_end": {
        for (const msg of event.messages ?? []) {
          if ("role" in msg && msg.role === "assistant") {
            const m = msg as { stopReason?: string; errorMessage?: string; usage?: { input: number; output: number } };
            if (m.stopReason === "error" && m.errorMessage) {
              send("error", { message: m.errorMessage });
            }
            if (m.usage) {
              send("usage", { input_tokens: m.usage.input || 0, output_tokens: m.usage.output || 0 });
            }
          }
        }
        send("done", {});
        cleanup();
        res.end();
        break;
      }
    }
  });

  const userMessages = (messages as Array<{ role: string; content: string }>).filter(m => m.role === "user");
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
      send("error", { message: err instanceof Error ? err.message : "Unknown error" });
      send("done", {});
      cleanup();
      res.end();
    }
  }

  req.on("close", cleanup);
});

app.post("/approve", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const isMain = process.argv[1] && import.meta.url.endsWith(
  process.argv[1].replace(/\\/g, "/")
);
if (isMain) {
  app.listen(PORT, () => console.log(`pi-bridge listening on port ${PORT}`));
}
