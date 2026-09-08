import { useEffect, useRef, useState } from 'react'
import { X, CheckCircle, XCircle, Loader2 } from 'lucide-react'

type SettingsModalProps = {
  open: boolean
  onClose: () => void
}

type Status = 'idle' | 'testing' | 'ok' | 'error'

const DEFAULT_BASE_URL = '/api'

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [baseUrl, setBaseUrl] = useState(() => localStorage.getItem('api_base_url') ?? DEFAULT_BASE_URL)
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const overlayRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Reset status when reopened
  useEffect(() => { if (open) setStatus('idle') }, [open])

  if (!open) return null

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
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
      onPointerDown={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="bg-card rounded-2xl shadow-2xl border border-border/50 w-[440px] flex flex-col overflow-hidden">
        {/* Title bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
          <h2 className="text-base font-semibold tracking-tight">Settings</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60 mb-3">
              API Connection
            </p>

            {/* Base URL */}
            <div className="space-y-1.5">
              <label className="text-sm text-foreground/70">Backend URL</label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => { setBaseUrl(e.target.value); setStatus('idle') }}
                onBlur={save}
                placeholder={DEFAULT_BASE_URL}
                className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-foreground/30 transition-colors placeholder:text-muted-foreground/40"
              />
            </div>
          </div>

          {/* Test button + status */}
          <div className="flex items-center gap-3">
            <button
              onClick={testConnection}
              disabled={status === 'testing'}
              className="flex items-center gap-2 rounded-xl bg-foreground text-background px-4 py-2 text-sm font-medium disabled:opacity-50 transition-opacity"
            >
              {status === 'testing' && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />}
              Test Connection
            </button>

            {status === 'ok' && (
              <span className="flex items-center gap-1.5 text-sm text-green-600">
                <CheckCircle className="h-4 w-4" strokeWidth={1.8} />
                Connected
              </span>
            )}
            {status === 'error' && (
              <span className="flex items-center gap-1.5 text-sm text-destructive">
                <XCircle className="h-4 w-4" strokeWidth={1.8} />
                {errorMsg || 'Failed'}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
