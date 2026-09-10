/**
 * ProviderCard — displays one provider row in the Settings > Providers tab.
 *
 * Shows:
 *   • Provider label
 *   • Connection status indicator  ● Connected / ○ Not configured / ✕ Failed
 *   • API key / Base URL input field (masked)
 *   • [Test Connection] button
 *   • Discovered model list (after successful test)
 */
import { useEffect, useRef, useState } from 'react'
import { CheckCircle, XCircle, Loader2, Eye, EyeOff, Zap } from 'lucide-react'
import { updateProvider, testProvider, type ProviderInfo, type TestResult } from '@/services/api'

type Props = {
  provider: ProviderInfo
  onUpdate: () => void
}

type Status = 'idle' | 'testing' | 'ok' | 'error'

export function ProviderCard({ provider, onUpdate }: Props) {
  const [keyValue, setKeyValue] = useState('')
  const [visible, setVisible] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [testStatus, setTestStatus] = useState<Status>('idle')
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  // ── Save key / base URL ──────────────────────────────────────────────────
  const handleSave = async () => {
    if (!keyValue.trim()) return
    setSaving(true)
    setSaveError('')
    try {
      const data =
        provider.key_field === 'api_key'
          ? { api_key: keyValue.trim() }
          : { base_url: keyValue.trim() }
      await updateProvider(provider.id, data)
      setKeyValue('')
      setEditing(false)
      onUpdate()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // ── Test connection ──────────────────────────────────────────────────────
  const handleTest = async () => {
    setTestStatus('testing')
    setTestResult(null)
    try {
      const result = await testProvider(provider.id)
      setTestResult(result)
      setTestStatus(result.ok ? 'ok' : 'error')
      if (result.ok) onUpdate() // refresh parent so model list updates
    } catch (e) {
      setTestResult({
        ok: false,
        latency_ms: 0,
        models: [],
        error: e instanceof Error ? e.message : 'Test failed',
      })
      setTestStatus('error')
    }
  }

  // ── Connection status badge ──────────────────────────────────────────────
  const statusBadge = () => {
    if (testStatus === 'testing')
      return <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Testing…</span>
    if (testStatus === 'ok' || provider.connected)
      return <span className="flex items-center gap-1 text-[11px] text-emerald-600"><CheckCircle className="h-3 w-3" /> Connected</span>
    if (testStatus === 'error')
      return <span className="flex items-center gap-1 text-[11px] text-destructive"><XCircle className="h-3 w-3" /> Failed</span>
    if (!provider.configured)
      return <span className="flex items-center gap-1 text-[11px] text-muted-foreground/50"><XCircle className="h-3 w-3" /> Not configured</span>
    return <span className="flex items-center gap-1 text-[11px] text-muted-foreground/50">○ Untested</span>
  }

  const fieldLabel = provider.key_field === 'api_key' ? 'API Key' : provider.key_field === 'base_url' ? 'Base URL' : ''
  const currentValue =
    provider.key_field === 'api_key' ? provider.api_key
    : provider.key_field === 'base_url' ? provider.base_url
    : ''

  const models: string[] =
    testResult?.models?.length
      ? testResult.models
      : provider.models ?? []

  return (
    <div className="rounded-xl border border-border/30 bg-foreground/[0.015] px-3.5 py-3 space-y-2.5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold">{provider.label}</span>
          {statusBadge()}
        </div>

        {/* Test button */}
        <button
          onClick={handleTest}
          disabled={testStatus === 'testing' || !provider.configured}
          title={provider.configured ? 'Test connection' : 'Configure key first'}
          className="flex items-center gap-1 text-[11px] text-foreground/50 hover:text-foreground px-2 py-1 rounded-lg hover:bg-accent transition-colors disabled:opacity-30"
        >
          <Zap className="h-3 w-3" />
          Test
        </button>
      </div>

      {/* Readonly (pi OAuth) — just show a note */}
      {provider.readonly && (
        <p className="text-[11px] text-muted-foreground/60">
          {provider.note || 'Auto-detected from Pi CLI login.'}
        </p>
      )}

      {/* Key / URL row — only for manually-configured providers */}
      {!provider.readonly && <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground/60 w-14 shrink-0">{fieldLabel}</span>
          {editing ? (
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type={visible ? 'text' : 'password'}
                value={keyValue}
                onChange={(e) => { setKeyValue(e.target.value); setSaveError('') }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave()
                  if (e.key === 'Escape') { setEditing(false); setKeyValue(''); setSaveError('') }
                }}
                placeholder={provider.placeholder}
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 pr-7 text-xs font-mono focus:outline-none focus:border-foreground/30 transition-colors placeholder:text-muted-foreground/30"
              />
              <button
                type="button"
                onClick={() => setVisible(!visible)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground"
              >
                {visible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </button>
            </div>
          ) : (
            <span className="flex-1 text-xs font-mono text-muted-foreground/60 truncate">
              {currentValue || <span className="text-muted-foreground/30 italic">not set</span>}
            </span>
          )}

          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-[11px] text-foreground/50 hover:text-foreground px-2 py-0.5 rounded hover:bg-accent transition-colors shrink-0"
            >
              {provider.configured ? 'Update' : 'Set'}
            </button>
          )}
        </div>

        {editing && (
          <div className="flex items-center gap-2 pl-16">
            <button
              onClick={handleSave}
              disabled={saving || !keyValue.trim()}
              className="text-[11px] bg-foreground text-background rounded-md px-2.5 py-1 font-medium disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => { setEditing(false); setKeyValue(''); setSaveError('') }}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            {saveError && <span className="text-[11px] text-destructive">{saveError}</span>}
          </div>
        )}
      </div>}

      {/* Test error */}
      {testStatus === 'error' && testResult?.error && (
        <p className="text-[11px] text-destructive/80 pl-0">{testResult.error}</p>
      )}

      {/* Latency */}
      {testStatus === 'ok' && testResult && (
        <p className="text-[11px] text-muted-foreground/50">
          {testResult.latency_ms} ms
        </p>
      )}

      {/* Models */}
      {models.length > 0 && (
        <div className="pt-0.5">
          <p className="text-[11px] text-muted-foreground/50 mb-1">Available models</p>
          <div className="flex flex-wrap gap-1">
            {models.slice(0, 8).map((m) => (
              <span
                key={m}
                className="text-[10px] bg-accent/60 rounded-md px-1.5 py-0.5 font-mono text-foreground/70"
              >
                {m}
              </span>
            ))}
            {models.length > 8 && (
              <span className="text-[10px] text-muted-foreground/40">+{models.length - 8} more</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
