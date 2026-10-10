import { useEffect, useState, useRef, useCallback } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { fetchModels } from '@/services/api/models'
import { ChevronDown, Image as ImageIcon } from 'lucide-react'
import type { ModelTestStatus } from '@/services/api/models'

// The picker shows only the models enabled in Settings → Providers.

type ModelInfo = {
  id: string
  name: string
  provider: string
  supports_images?: boolean
  provider_label?: string
  status?: ModelTestStatus | null
}

/** Short display name shown in the selector button badge */
const PROVIDER_DISPLAY: Record<string, string> = {
  pi: 'Claude.ai',
  claude: 'Anthropic',
  anthropic: 'Anthropic',
  deepseek: 'DeepSeek',
  openai: 'OpenAI',
  gemini: 'Gemini',
  siliconflow: 'SiliconFlow',
  ollama: 'Ollama',
  mock: 'Local',
}

export function ModelSelector() {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const provider = useChatStore((s) => s.provider)
  const model = useChatStore((s) => s.model)
  const isStreaming = useChatStore((s) => s.isStreaming)

  // Reload on mount and whenever the list opens, so changes made in Settings show up
  const loadModels = useCallback(() => {
    fetchModels()
      .then(setModels)
      .catch(() => {
        // Keep the last list if the backend is briefly unavailable
      })
  }, [])

  useEffect(() => {
    loadModels()
  }, [loadModels])

  useEffect(() => {
    if (open) loadModels()
  }, [open, loadModels])

  // The selected model must be one the user enabled; otherwise switch to the first enabled one
  const setModel = useChatStore((s) => s.setModel)
  useEffect(() => {
    if (models.length === 0) return
    const stillEnabled = models.some((m) => m.provider === provider && m.id === model)
    if (!stillEnabled) setModel(models[0].provider, models[0].id)
  }, [models, provider, model, setModel])

  // Close on click outside or Escape
  useEffect(() => {
    if (!open) return

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const current = models.find((m) => m.provider === provider && m.id === model)
  const rawLabel = current ? current.name : model
  const modelLabel = rawLabel.includes('/') ? rawLabel.split('/').pop()! : rawLabel
  // Show the provider's name, never its internal id (e.g. custom-qwen-...)
  const providerLabel = current?.provider_label ?? PROVIDER_DISPLAY[provider] ?? 'Provider'

  // Nothing enabled yet: the button itself opens Settings, no popup
  if (models.length === 0) {
    return (
      <button
        onClick={() => window.dispatchEvent(new Event('open-settings'))}
        className="flex items-center gap-2 rounded-xl bg-card border border-border/60 px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent shadow-sm transition-all"
      >
        No model
        <span className="text-sm text-foreground/70">· Settings</span>
      </button>
    )
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen(!open)}
        disabled={isStreaming}
        className="flex items-center gap-2 rounded-xl bg-card border border-border/60 pl-3 pr-2.5 py-1.5 hover:bg-accent shadow-sm disabled:opacity-50 transition-all"
      >
        <span className="text-xs font-semibold px-1.5 py-0.5 rounded-md bg-foreground/[0.07] text-foreground/70 shrink-0 uppercase tracking-wide">
          {providerLabel}
        </span>
        <span className="max-w-[160px] truncate text-sm font-medium text-foreground/80">{modelLabel}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 min-w-[240px] max-h-[70vh] overflow-y-auto rounded-2xl border border-border/60 bg-card p-1.5 shadow-lg backdrop-blur-xl">
          {Object.entries(groupByProvider(models)).map(([providerName, providerModels]) => (
            <div key={providerName}>
              <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {providerModels[0]?.provider_label ?? PROVIDER_DISPLAY[providerName] ?? 'Provider'}
              </div>
              {providerModels.map((m) => {
                const isActive = m.provider === provider && m.id === model
                const dotColor = m.status?.ok ? 'bg-green-500' : m.status ? 'bg-red-500' : 'bg-foreground/20'
                const dotTitle = m.status?.ok
                  ? `Works (${m.status.ms ?? '?'} ms)`
                  : m.status
                    ? /out of extra usage|quota|usage limit|rate limit|429|insufficient/i.test(
                        m.status.error ?? '',
                      )
                      ? 'Out of quota'
                      : 'Last test failed'
                    : 'Not tested'
                return (
                  <button
                    key={`${m.provider}-${m.id}`}
                    onClick={() => {
                      setModel(m.provider, m.id)
                      setOpen(false)
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                      isActive
                        ? 'bg-accent font-medium text-foreground'
                        : 'text-foreground/75 hover:bg-accent/60'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} title={dotTitle} />
                    <span className="min-w-0 flex-1 truncate">{m.name}</span>
                    {m.supports_images && (
                      <ImageIcon
                        className="h-3 w-3 shrink-0 text-muted-foreground"
                        strokeWidth={1.8}
                        aria-label="Supports images"
                      />
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function groupByProvider(models: ModelInfo[]): Record<string, ModelInfo[]> {
  const groups: Record<string, ModelInfo[]> = {}
  for (const m of models) {
    if (!groups[m.provider]) groups[m.provider] = []
    groups[m.provider].push(m)
  }
  return groups
}
