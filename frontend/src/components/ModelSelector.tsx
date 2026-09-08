import { useEffect, useState } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { fetchModels } from '@/services/api'
import { ChevronDown } from 'lucide-react'

type ModelInfo = {
  id: string
  name: string
  provider: string
}

export function ModelSelector() {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [open, setOpen] = useState(false)
  const provider = useChatStore((s) => s.provider)
  const model = useChatStore((s) => s.model)
  const setModel = useChatStore((s) => s.setModel)
  const isStreaming = useChatStore((s) => s.isStreaming)

  useEffect(() => {
    fetchModels()
      .then(setModels)
      .catch(() => setModels([]))
  }, [])

  const current = models.find((m) => m.provider === provider && m.id === model)
  const label = current ? current.name : `${provider}/${model}`

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={isStreaming}
        className="flex items-center gap-1.5 rounded-xl bg-card border border-border/60 px-3.5 py-2 text-sm font-medium text-foreground/80 hover:bg-accent shadow-sm disabled:opacity-50 transition-all"
      >
        <span className="max-w-[180px] truncate">{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onPointerDown={() => setOpen(false)} />

          <div className="absolute right-0 top-full mt-2 z-50 min-w-[240px] rounded-2xl border border-border/60 bg-card p-1.5 shadow-lg backdrop-blur-xl" onPointerDown={(e) => e.stopPropagation()}>
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
        </>
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
