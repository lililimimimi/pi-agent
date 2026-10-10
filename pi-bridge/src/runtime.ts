import { ModelRuntime } from '@earendil-works/pi-coding-agent'
import { syncBuiltinKeys, syncCustomProviders } from './custom-providers.js'

// Provider → env var mapping for API keys
export const PROVIDER_KEY_ENV: Record<string, string> = {
  deepseek: 'DEEPSEEK_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
}

// "pi" is our OAuth-subscription alias for the "anthropic" provider
// These map to the same ModelRuntime provider but skip API key injection
export const PROVIDER_ALIAS: Record<string, string> = {
  pi: 'anthropic',
}

// Model ID overrides: when frontend sends non-Pi-SDK model IDs
export const MODEL_ALIASES: Record<string, string> = {
  'deepseek-ai/DeepSeek-V3': 'deepseek-v4-flash',
  'deepseek-ai/DeepSeek-V4-Pro': 'deepseek-v4-pro',
  'deepseek-ai/DeepSeek-R1': 'deepseek-v4-pro',
  'deepseek-ai/DeepSeek-V2.5': 'deepseek-v4-flash',
}

// Default model per provider when alias/lookup fails
export const PROVIDER_DEFAULT_MODEL: Record<string, string> = {
  deepseek: 'deepseek-v4-flash',
  anthropic: 'claude-sonnet-4-5',
}

let modelRuntimeInstance: ModelRuntime | undefined

export async function getModelRuntime(provider: string): Promise<ModelRuntime> {
  if (!modelRuntimeInstance) {
    modelRuntimeInstance = await ModelRuntime.create()
  }
  syncCustomProviders(modelRuntimeInstance)
  await syncBuiltinKeys(modelRuntimeInstance)
  // Inject API key for the provider if available via env
  const keyEnv = PROVIDER_KEY_ENV[provider]
  if (keyEnv && process.env[keyEnv]) {
    await modelRuntimeInstance.setRuntimeApiKey(provider, process.env[keyEnv]!)
  }
  return modelRuntimeInstance
}

export async function ensureRuntime(): Promise<ModelRuntime> {
  if (!modelRuntimeInstance) {
    modelRuntimeInstance = await ModelRuntime.create()
  }
  syncCustomProviders(modelRuntimeInstance)
  await syncBuiltinKeys(modelRuntimeInstance)
  // Inject all available API keys
  for (const [provider, envVar] of Object.entries(PROVIDER_KEY_ENV)) {
    if (process.env[envVar]) {
      await modelRuntimeInstance.setRuntimeApiKey(provider, process.env[envVar]!)
    }
  }
  return modelRuntimeInstance
}
