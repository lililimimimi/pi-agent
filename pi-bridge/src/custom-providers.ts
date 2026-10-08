/**
 * Providers the Pi SDK does not ship with, registered from the app's own config.
 *
 * Each one is an OpenAI-compatible endpoint. The key and the model list come from
 * ~/.pi/agent/config.json (the same file the backend writes from the Settings page),
 * so changing them in Settings takes effect on the next request.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type CustomProvider = {
  id: string;
  name: string;
  baseUrl: string;
};

export const CUSTOM_PROVIDERS: CustomProvider[] = [
  { id: "siliconflow", name: "SiliconFlow", baseUrl: "https://api.siliconflow.cn/v1" },
];

/** Providers the user added in Settings (ids start with "custom-"). */
export function readUserProviders(
  configPath = join(homedir(), ".pi", "agent", "config.json"),
): CustomProvider[] {
  try {
    const cfg = JSON.parse(readFileSync(configPath, "utf-8"));
    const providers: Record<string, { name?: string; base_url?: string }> = cfg?.providers ?? {};
    return Object.entries(providers)
      .filter(([id]) => id.startsWith("custom-"))
      .map(([id, p]) => ({ id, name: p.name ?? id, baseUrl: p.base_url ?? "" }))
      .filter((p) => p.baseUrl);
  } catch {
    return [];
  }
}

type ConfigProvider = { api_key?: string; models?: Array<string | { id: string }> };

/** Reads one provider's key and cached model ids from config.json. */
export function readProviderFromConfig(
  providerId: string,
  configPath = join(homedir(), ".pi", "agent", "config.json"),
): { apiKey: string; modelIds: string[] } {
  try {
    const cfg = JSON.parse(readFileSync(configPath, "utf-8"));
    const p: ConfigProvider = cfg?.providers?.[providerId] ?? {};
    const modelIds = (p.models ?? [])
      .map((m) => (typeof m === "string" ? m : m.id))
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    return { apiKey: p.api_key ?? "", modelIds };
  } catch {
    return { apiKey: "", modelIds: [] };
  }
}

/** Signature of what was registered, so we only re-register when something changed. */
const registered = new Map<string, string>();

/**
 * Registers (or re-registers) every custom provider that has a key and models.
 * Safe to call on every request.
 */
export function syncCustomProviders(
  runtime: { registerProvider(id: string, config: unknown): void; unregisterProvider(id: string): void },
  configPath?: string,
): void {
  for (const p of [...CUSTOM_PROVIDERS, ...readUserProviders(configPath)]) {
    const { apiKey, modelIds } = readProviderFromConfig(p.id, configPath);
    if (!apiKey || modelIds.length === 0) continue;

    const signature = JSON.stringify([apiKey, modelIds]);
    if (registered.get(p.id) === signature) continue;

    try {
      runtime.unregisterProvider(p.id);
    } catch {
      // not registered yet
    }
    runtime.registerProvider(p.id, {
      name: p.name,
      baseUrl: p.baseUrl,
      apiKey,
      api: "openai-completions",
      models: modelIds.map((id) => ({
        id,
        name: id,
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        contextWindow: 128000,
        maxTokens: 4096,
      })),
    });
    registered.set(p.id, signature);
  }
}

/** App provider id → Pi SDK provider id, for keys entered in Settings. */
export const BUILTIN_KEY_PROVIDERS: Record<string, string> = {
  deepseek: "deepseek",
  openai: "openai",
  anthropic: "anthropic",
};

/**
 * Sends keys entered in Settings (config.json) to the SDK runtime.
 * Environment keys are still read elsewhere; this only adds what Settings holds.
 */
export async function syncBuiltinKeys(
  runtime: { setRuntimeApiKey(id: string, key: string): Promise<void> },
  configPath?: string,
): Promise<void> {
  for (const [appId, piId] of Object.entries(BUILTIN_KEY_PROVIDERS)) {
    const { apiKey } = readProviderFromConfig(appId, configPath);
    if (!apiKey || apiKey.startsWith("[")) continue; // "[oauth]" is a sentinel, not a key
    if (builtinKeySent.get(piId) === apiKey) continue;
    await runtime.setRuntimeApiKey(piId, apiKey);
    builtinKeySent.set(piId, apiKey);
  }
}

const builtinKeySent = new Map<string, string>();
