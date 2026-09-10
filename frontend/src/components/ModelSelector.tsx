import { useEffect, useState, useRef } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { fetchModels } from '@/services/api'
import { ChevronDown } from 'lucide-react'

type ModelInfo = {
  id: string
  name: string
  provider: string
}

/** Short display name shown in the selector button badge */
const PROVIDER_DISPLAY: Record<string, string> = {
  pi:          'Claude.ai',   // OAuth subscription
  claude:      'Anthropic',
  anthropic:   'Anthropic',
  deepseek:    'DeepSeek',
  openai:      'OpenAI',
  gemini:      'Gemini',
  siliconflow: 'Silicon',
  ollama:      'Ollama',
  mock:        'Local',
}

export function ModelSelector() {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const provider = useChatStore((s) => s.provider)
  const model = useChatStore((s) => s.model)
  const setModel = useChatStore((s) => s.setModel)
  const isStreaming = useChatStore((s) => s.isStreaming)

  useEffect(() => {
    fetchModels()
      .then(setModels)
      .catch(() => setModels([]))
  }, [])

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
  // Short model name — strip "provider/" prefix
  const rawLabel = current ? current.name : model
  const modelLabel = rawLabel.includes('/') ? rawLabel.split('/').pop()! : rawLabel
  const providerLabel = PROVIDER_DISPLAY[provider] ?? provider

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen(!open)}
        disabled={isStreaming}
        className="flex items-center gap-2 rounded-xl bg-card border border-border/60 pl-3 pr-2.5 py-1.5 hover:bg-accent shadow-sm disabled:opacity-50 transition-all"
      >
        {/* Provider badge */}
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-foreground/[0.07] text-foreground/50 shrink-0 uppercase tracking-wide">
          {providerLabel}
        </span>
        {/* Model name */}
        <span className="max-w-[160px] truncate text-sm font-medium text-foreground/80">{modelLabel}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground/60 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 min-w-[240px] max-h-[70vh] overflow-y-auto rounded-2xl border border-border/60 bg-card p-1.5 shadow-lg backdrop-blur-xl">
          {models.length === 0 && (
            <div className="px-3.5 py-3 text-sm text-muted-foreground">No models available</div>
          )}

          {Object.entries(groupByProvider(models)).map(([providerName, providerModels]) => (
            <div key={providerName}>
              <div className="px-3.5 py-2 text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                {providerName}
              </div>
              {providerModels.map((m) => {
                const isActive = m.provider === provider && m.id === model
                return (
                  <button
                    key={`${m.provider}-${m.id}`}
                    onClick={() => {
                      setModel(m.provider, m.id)
                      setOpen(false)
                    }}
                    className={`w-full text-left rounded-xl px-3.5 py-2 text-sm transition-colors ${
                      isActive
                        ? 'bg-accent font-medium text-foreground'
                        : 'text-foreground/80 hover:bg-accent/60'
                    }`}
                  >
                    {m.name}
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
