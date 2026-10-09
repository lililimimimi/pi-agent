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
import { updateProvider, testProvider, type ProviderInfo, type TestResult, type CatalogGroup } from '@/services/api'
import { ProviderModels } from '@/components/settings/ProviderModels'
import { deleteCustomProvider, logoutProvider } from '@/services/api'
import { OAuthLogin } from '@/components/settings/OAuthLogin'
import { Button } from '@/components/ui/button'
const LOGIN_LABELS: Record<string, string> = {
  pi: 'Log in with Claude.ai',
  'openai-codex': 'Log in with ChatGPT',
}

type Props = {
  provider: ProviderInfo
  /** This provider's models from the catalog (undefined when none are known yet) */
  catalog?: CatalogGroup
  onUpdate: () => void
}

type Status = 'idle' | 'testing' | 'ok' | 'error'

export function ProviderCard({ provider, catalog, onUpdate }: Props) {
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
      return <span className="flex items-center gap-1 text-base text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Testing…</span>
    if (testStatus === 'ok' || provider.connected)
      return <span className="flex items-center gap-1 text-base text-emerald-600"><CheckCircle className="h-3 w-3" /> Connected</span>
    if (testStatus === 'error')
      return <span className="flex items-center gap-1 text-base text-destructive"><XCircle className="h-3 w-3" /> Failed</span>
    if (!provider.configured)
      return <span className="flex items-center gap-1 text-base text-muted-foreground"><XCircle className="h-3 w-3" /> Not configured</span>
    return <span className="flex items-center gap-1 text-base text-muted-foreground">○ Untested</span>
  }

  const fieldLabel = provider.key_field === 'api_key' ? 'API Key' : provider.key_field === 'base_url' ? 'Base URL' : ''
  const currentValue =
    provider.key_field === 'api_key' ? provider.api_key
    : provider.key_field === 'base_url' ? provider.base_url
    : ''

  return (
    <div className="rounded-xl border border-border/50 bg-muted px-4 py-3.5 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold">{provider.label}</span>
          {statusBadge()}
        </div>

        <div className="flex items-center gap-1">
          {/* Test button */}
          <button
            onClick={handleTest}
            disabled={testStatus === 'testing' || !provider.configured}
            title={provider.configured ? 'Test connection' : 'Configure key first'}
            className={`flex items-center gap-1 text-base font-medium px-2 py-1 rounded-lg hover:bg-accent transition-colors disabled:opacity-30 ${testStatus === 'ok' || provider.connected ? 'text-emerald-600' : 'text-foreground/70 hover:text-foreground'}`}
          >
            <Zap className={`h-3 w-3 ${testStatus === 'ok' || provider.connected ? 'fill-current text-emerald-600' : ''}`} />
            Test
          </button>

          {provider.custom && (
            <button
              onClick={() => { void deleteCustomProvider(provider.id).then(onUpdate) }}
              className="text-base font-medium text-foreground/70 hover:text-destructive px-2 py-1 rounded-lg hover:bg-accent transition-colors"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {/* Subscriptions: log in / log out from here */}
      {LOGIN_LABELS[provider.id] && !provider.configured && (
        <OAuthLogin providerId={provider.id} label={LOGIN_LABELS[provider.id]} onDone={onUpdate} />
      )}
      {LOGIN_LABELS[provider.id] && provider.configured && (
        <Button variant="outline" size="sm" className="font-medium" onClick={() => { void logoutProvider(provider.id).then(onUpdate) }}>
          Log out
        </Button>
      )}

      {/* Readonly (pi OAuth) — just show a note */}
      {provider.readonly && (
        <p className="text-base text-muted-foreground">
          {provider.note || 'Auto-detected from Pi CLI login.'}
        </p>
      )}

      {/* Key / URL row — only for manually-configured providers */}
      {!provider.readonly && <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-base text-muted-foreground w-14 shrink-0">{fieldLabel}</span>
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
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 pr-7 text-base font-mono focus:outline-none focus:border-foreground/30 transition-colors placeholder:text-muted-foreground"
              />
              <button
                type="button"
                onClick={() => setVisible(!visible)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {visible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </button>
            </div>
          ) : (
            <span className="flex-1 text-base font-mono text-muted-foreground truncate">
              {currentValue || <span className="text-muted-foreground italic">not set</span>}
            </span>
          )}

          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-base font-medium text-foreground/70 hover:text-foreground px-2 py-0.5 rounded hover:bg-accent transition-colors shrink-0"
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
              className="text-base bg-foreground text-background rounded-md px-2.5 py-1 font-medium disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => { setEditing(false); setKeyValue(''); setSaveError('') }}
              className="text-base font-medium text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            {saveError && <span className="text-base text-destructive">{saveError}</span>}
          </div>
        )}
      </div>}

      {/* Test error */}
      {testStatus === 'error' && testResult?.error && (
        <p className="text-base text-destructive/80 pl-0">{testResult.error}</p>
      )}

      {/* Latency */}
      {testStatus === 'ok' && testResult && (
        <p className="text-base text-muted-foreground">
          {testResult.latency_ms} ms
        </p>
      )}

      {/* Configured, but the provider returned no models */}
      {provider.configured && !catalog && !LOGIN_LABELS[provider.id] && (
        <p className="text-base text-muted-foreground">
          This provider did not return a model list. Check its documentation for model names.
        </p>
      )}

      {/* Models: enable the ones you want, then test them */}
      {catalog && (
        <div className="pt-1">
          <ProviderModels
            group={catalog}
            configured={provider.configured}
            unconfiguredHint={LOGIN_LABELS[provider.id] ? 'Log in to enable these models.' : 'Set an API key to enable these models.'}
            onChanged={onUpdate}
          />
        </div>
      )}
    </div>
  )
}
