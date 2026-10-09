import { useEffect, useRef, useState } from 'react'
import { X, Loader2, Server, Info, Plus } from 'lucide-react'
import { fetchProviders, fetchModelCatalog, type ProviderInfo, type CatalogGroup } from '@/services/api'
import { ProviderCard } from '@/components/settings/ProviderCard'
import { AddProviderDialog } from '@/components/settings/AddProviderDialog'
import { Button } from '@/components/ui/button'

type SettingsModalProps = {
  open: boolean
  onClose: () => void
}

type Tab = 'providers' | 'about'

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'providers', label: 'Providers', icon: Server },
  { id: 'about', label: 'About', icon: Info },
]

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [tab, setTab] = useState<Tab>('providers')

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Reset to first tab when reopened
  useEffect(() => { if (open) setTab('providers') }, [open])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="bg-card rounded-2xl shadow-2xl border border-border/50 w-[min(960px,calc(100vw-48px))] h-[min(720px,calc(100vh-64px))] flex flex-col overflow-hidden">
        {/* Title bar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/40">
          <h2 className="text-sm font-semibold tracking-tight">Settings</h2>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.8} />
          </button>
        </div>

        {/* Body: sidebar + content */}
        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <nav className="w-[200px] shrink-0 border-r border-border/30 py-4 px-3 space-y-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tab === id
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {label}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="flex-1 p-8 overflow-y-auto">
            {tab === 'providers' && <ProvidersPage />}
            {tab === 'about' && <AboutPage />}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Providers Page ────────────────────────────────────────────────────────────

function ProvidersPage() {
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [catalog, setCatalog] = useState<CatalogGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  // Reloads keep the list mounted, so cards stay expanded and the scroll position stays put
  const load = async () => {
    // Independent requests: a problem with one never empties the other
    await Promise.all([
      fetchProviders().then(setProviders).catch(() => {}),
      fetchModelCatalog().then(setCatalog).catch(() => {}),
    ])
  }

  // Only the first load shows the spinner
  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <h3 className="text-sm font-semibold mb-1">Providers</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Add API keys, then turn on the models you want in the model picker. Keys are stored locally.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-2.5">
          {providers.map((p) => (
            <ProviderCard
              key={p.id}
              provider={p}
              catalog={catalog.find((g) => g.provider === p.id)}
              onUpdate={load}
            />
          ))}

          <Button variant="outline" className="w-full" onClick={() => setAdding(true)}>
            <Plus className="size-4" />
            Add provider
          </Button>
        </div>
      )}

      <AddProviderDialog open={adding} onOpenChange={setAdding} onAdded={load} />
    </div>
  )
}

// ── About Page ────────────────────────────────────────────────────────────────

function AboutPage() {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-1">About</h3>
      <div className="space-y-3 mt-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-foreground/[0.05] flex items-center justify-center">
            <span
              className="text-2xl font-bold leading-none"
              style={{
                background: 'linear-gradient(135deg, #007AFF 0%, #AF52DE 50%, #FF2D55 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              π
            </span>
          </div>
          <div>
            <p className="text-sm font-semibold">pi</p>
            <p className="text-sm text-muted-foreground">AI coding agent</p>
          </div>
        </div>
        <div className="text-sm text-muted-foreground space-y-1 pt-1">
          <p>Version 0.1.0</p>
        </div>
      </div>
    </div>
  )
}
