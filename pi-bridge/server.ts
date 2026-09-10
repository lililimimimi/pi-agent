import crypto from "node:crypto";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as dotenv from "dotenv";
import express from "express";

// 加载后端 .env（bridge 和 backend 在同一项目根目录下）
const envPath = resolve(fileURLToPath(import.meta.url), "../../backend/.env");
dotenv.config({ path: envPath });
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { buildPreview, isWriteTool, PreviewRegistry } from "./src/preview.js";

// Pi CLI does this at startup: forces HTTP/1.1 (allowH2: false).
// Without it, Node.js uses HTTP/2 which Anthropic rejects for OAuth tokens → 403.
import { configureHttpDispatcher } from
  "./node_modules/@earendil-works/pi-coding-agent/dist/core/http-dispatcher.js";
configureHttpDispatcher();
console.log("[bridge] HTTP dispatcher configured (HTTP/1.1 enforced, no H2)");
import type { AgentSession, AgentSessionEvent, ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PORT = parseInt(process.env.PI_BRIDGE_PORT || "3100", 10);



// Provider → env var mapping for API keys
const PROVIDER_KEY_ENV: Record<string, string> = {
  deepseek: "DEEPSEEK_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
}

// "pi" is our OAuth-subscription alias for the "anthropic" provider
// These map to the same ModelRuntime provider but skip API key injection
const PROVIDER_ALIAS: Record<string, string> = {
  pi: "anthropic",
};

// Model ID overrides: when frontend sends non-Pi-SDK model IDs
const MODEL_ALIASES: Record<string, string> = {
  "deepseek-ai/DeepSeek-V3": "deepseek-v4-flash",
  "deepseek-ai/DeepSeek-V4-Pro": "deepseek-v4-pro",
  "deepseek-ai/DeepSeek-R1": "deepseek-v4-pro",
  "deepseek-ai/DeepSeek-V2.5": "deepseek-v4-flash",
};

// Default model per provider when alias/lookup fails
const PROVIDER_DEFAULT_MODEL: Record<string, string> = {
  deepseek: "deepseek-v4-flash",
  anthropic: "claude-sonnet-4-5",
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

export const previewRegistry = new PreviewRegistry();

type PreviewController = {
  enabled: boolean;
  confirmed: boolean;
  cancelled: boolean;
  assistantText: string;
  send: (event: string, data: Record<string, unknown>) => void;
};

/**
 * Inline extension that pauses the agent before its first write tool call and
 * waits for the user to confirm or cancel the execution preview. Read-only
 * tools bypass the gate entirely.
 */
function makePreviewExtension(ctrl: PreviewController) {
  return (pi: ExtensionAPI) => {
    pi.on("tool_call", async (event) => {
      if (!ctrl.enabled || ctrl.confirmed || ctrl.cancelled) return;
      if (!isWriteTool(event.toolName)) return;

      const previewId = crypto.randomUUID();
      const steps = buildPreview({
        assistantText: ctrl.assistantText,
        toolName: event.toolName,
        args: event.input as Record<string, unknown>,
      });
      ctrl.send("execution_preview", { preview_id: previewId, steps, has_write_ops: true });

      const decision = await previewRegistry.wait(previewId, {
        onTimeout: () => {
          ctrl.send("text", { content: "\n\n> ⏱ 执行预览超时，已自动取消。\n" });
        },
      });

      if (decision === "confirm") {
        ctrl.confirmed = true;
        return;
      }

      ctrl.cancelled = true;
      if (decision === "cancel") {
        ctrl.send("text", { content: "\n\n> ⏹ 已取消执行。\n" });
      }
      return { block: true, reason: "Execution cancelled at preview", terminate: true };
    });
  };
}

export const app = express();
app.use(express.json());

app.post("/chat", async (req, res) => {
  console.log(`[bridge] POST /chat body:`, JSON.stringify(req.body)?.slice(0, 200));
  const { messages, model: rawModel } = req.body;
  // Resolve provider alias (e.g. "pi" → "anthropic")
  const rawProvider: string = req.body.provider ?? "anthropic";
  const provider = PROVIDER_ALIAS[rawProvider] ?? rawProvider;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  function send(event: string, data: Record<string, unknown>) {
    res.write(`data: ${JSON.stringify({ event, data })}\n\n`);
  }

  const previewCtrl: PreviewController = {
    enabled: req.body.execution_preview !== false,
    confirmed: false,
    cancelled: false,
    assistantText: "",
    send,
  };

  let runtime: ModelRuntime;
  try {
    console.log(`[bridge] getModelRuntime provider=${provider}`);
    runtime = await getModelRuntime(provider);
    console.log(`[bridge] runtime ready`);
  } catch (err: unknown) {
    send("error", { message: err instanceof Error ? err.message : "Failed to init runtime" });
    send("done", {});
    res.end();
    return;
  }

  // Resolve model: alias first, then look up in runtime, then fallback to provider default
  const modelId = MODEL_ALIASES[rawModel] ?? rawModel;
  let model = runtime.getModel(provider, modelId);
  if (!model) {
    // Try to find any working model for this provider
    const fallbackId = PROVIDER_DEFAULT_MODEL[provider] ?? PROVIDER_DEFAULT_MODEL[rawProvider];
    if (fallbackId) {
      model = runtime.getModel(provider, fallbackId);
      console.log(`[bridge] model ${modelId} not found, fallback to ${fallbackId} found=${!!model}`);
    }
  } else {
    console.log(`[bridge] model resolved: ${provider}/${modelId} found=${!!model}`);
  }

  let session: AgentSession;
  try {
    console.log(`[bridge] createAgentSession...`);
    let resourceLoader: DefaultResourceLoader | undefined;
    if (previewCtrl.enabled) {
      resourceLoader = new DefaultResourceLoader({
        cwd: process.cwd(),
        agentDir: getAgentDir(),
        extensionFactories: [makePreviewExtension(previewCtrl)],
      });
      await resourceLoader.reload();
    }
    const result = await createAgentSession({
      sessionManager: SessionManager.inMemory(),
      modelRuntime: runtime,
      tools: ["read", "bash", "edit", "write"],
      ...(model ? { model } : {}),
      ...(resourceLoader ? { resourceLoader } : {}),
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
      case "turn_start":
        // Reset the plan buffer so each turn's steps are independent.
        previewCtrl.assistantText = "";
        break;
      case "message_update": {
        const ame = event.assistantMessageEvent;
        if (ame.type === "text_delta") {
          previewCtrl.assistantText += ame.delta;
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

app.post("/preview/:id/confirm", (req, res) => {
  const ok = previewRegistry.resolve(req.params.id, "confirm");
  if (!ok) return res.status(404).json({ error: "Preview not found" });
  res.json({ status: "ok" });
});

app.post("/preview/:id/cancel", (req, res) => {
  const ok = previewRegistry.resolve(req.params.id, "cancel");
  if (!ok) return res.status(404).json({ error: "Preview not found" });
  res.json({ status: "ok" });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// ── Models endpoints ─────────────────────────────────────────────────────────

async function ensureRuntime(): Promise<ModelRuntime> {
  if (!modelRuntimeInstance) {
    modelRuntimeInstance = await ModelRuntime.create();
  }
  // Inject all available API keys
  for (const [provider, envVar] of Object.entries(PROVIDER_KEY_ENV)) {
    if (process.env[envVar]) {
      await modelRuntimeInstance.setRuntimeApiKey(provider, process.env[envVar]!);
    }
  }
  return modelRuntimeInstance;
}

app.get("/models", async (_req, res) => {
  try {
    const runtime = await ensureRuntime();
    const available = await runtime.getAvailable();
    const models = available.map((m) => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
      supports_tools: true,
    }));
    res.json(models);
  } catch (err) {
    console.error("[bridge] /models error:", err);
    res.json([]);
  }
});

app.get("/models/default", async (_req, res) => {
  try {
    const runtime = await ensureRuntime();
    const available = await runtime.getAvailable();
    // Prefer non-mock provider
    const preferred = available.find((m) => m.provider !== "mock") ?? available[0];
    if (preferred) {
      res.json({ provider: preferred.provider, model: preferred.id });
    } else {
      res.json({ provider: "mock", model: "mock-1" });
    }
  } catch {
    res.json({ provider: "mock", model: "mock-1" });
  }
});

// ── API Key Management ─────────────────────────────────────────────

app.post("/api-keys", async (req, res) => {
  try {
    const { provider, apiKey } = req.body as { provider: string; apiKey: string };
    const runtime = await ensureRuntime();
    await runtime.setRuntimeApiKey(provider, apiKey);
    res.json({ status: "ok" });
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? String(err) });
  }
});

app.get("/api-keys/status", async (_req, res) => {
  try {
    const runtime = await ensureRuntime();
    const result = Object.keys(PROVIDER_KEY_ENV).map((provider) => ({
      provider,
      configured: runtime.hasConfiguredAuth(provider),
    }));
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? String(err) });
  }
});

app.delete("/api-keys/:provider", async (req, res) => {
  try {
    const runtime = await ensureRuntime();
    await runtime.removeRuntimeApiKey(req.params.provider);
    res.json({ status: "ok" });
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? String(err) });
  }
});

// Only start listening / keep-alive when this file is run directly
// (not when imported by tests).
const isMain =
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));

if (isMain) {
  app.listen(PORT, () => console.log(`pi-bridge listening on port ${PORT}`));

  // Keep process alive (Pi SDK imports may otherwise drain the event loop)
  setInterval(() => {}, 1 << 30);
}
