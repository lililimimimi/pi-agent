import { useEffect, useRef, useState } from 'react'
import { X, Loader2, Server, Wifi, Info, CheckCircle, XCircle } from 'lucide-react'
import { fetchProviders, type ProviderInfo } from '@/services/api'
import { ProviderCard } from '@/components/ProviderCard'

type SettingsModalProps = {
  open: boolean
  onClose: () => void
}

type Tab = 'providers' | 'connection' | 'about'

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'providers', label: 'Providers', icon: Server },
  { id: 'connection', label: 'Connection', icon: Wifi },
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
      <div className="bg-card rounded-2xl shadow-2xl border border-border/50 w-[580px] max-h-[520px] flex flex-col overflow-hidden">
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
          <nav className="w-[150px] shrink-0 border-r border-border/30 py-2 px-2 space-y-0.5">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
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
          <div className="flex-1 p-5 overflow-y-auto">
            {tab === 'providers' && <ProvidersPage />}
            {tab === 'connection' && <ConnectionPage />}
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
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      setLoading(true)
      setProviders(await fetchProviders())
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div>
      <h3 className="text-sm font-semibold mb-1">Providers</h3>
      <p className="text-xs text-muted-foreground/50 mb-4">
        Configure API keys and test connections. Keys are stored locally and never committed to git.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-2.5">
          {providers.map((p) => (
            <ProviderCard key={p.id} provider={p} onUpdate={load} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Connection Page ───────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = '/api'

function ConnectionPage() {
  const [baseUrl, setBaseUrl] = useState(() => localStorage.getItem('api_base_url') ?? DEFAULT_BASE_URL)
  const [status, setStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const save = () => {
    const url = baseUrl.trim() || DEFAULT_BASE_URL
    localStorage.setItem('api_base_url', url)
    setBaseUrl(url)
  }

  const testConnection = async () => {
    setStatus('testing')
    setErrorMsg('')
    try {
      const url = (baseUrl.trim() || DEFAULT_BASE_URL).replace(/\/$/, '')
      const res = await fetch(`${url}/models`, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await res.json()
      setStatus('ok')
    } catch (e) {
      setStatus('error')
      setErrorMsg(e instanceof Error ? e.message : 'Connection failed')
    }
  }

  return (
    <div>
      <h3 className="text-sm font-semibold mb-1">Connection</h3>
      <p className="text-xs text-muted-foreground/50 mb-4">Backend server address.</p>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs text-foreground/60">Backend URL</label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => { setBaseUrl(e.target.value); setStatus('idle') }}
            onBlur={save}
            placeholder={DEFAULT_BASE_URL}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono focus:outline-none focus:border-foreground/30 transition-colors placeholder:text-muted-foreground/40"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={testConnection}
            disabled={status === 'testing'}
            className="flex items-center gap-1.5 rounded-lg bg-foreground text-background px-3 py-1.5 text-xs font-medium disabled:opacity-50 transition-opacity"
          >
            {status === 'testing' && <Loader2 className="h-3 w-3 animate-spin" />}
            Test
          </button>

          {status === 'ok' && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <CheckCircle className="h-3.5 w-3.5" /> Connected
            </span>
          )}
          {status === 'error' && (
            <span className="flex items-center gap-1 text-xs text-destructive">
              <XCircle className="h-3.5 w-3.5" /> {errorMsg || 'Failed'}
            </span>
          )}
        </div>
      </div>
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
            <p className="text-[11px] text-muted-foreground/50">AI coding agent</p>
          </div>
        </div>
        <div className="text-xs text-muted-foreground/40 space-y-1 pt-1">
          <p>Version 0.1.0</p>
        </div>
      </div>
    </div>
  )
}
