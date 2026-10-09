import { useMemo, useState } from 'react'
import { Collapsible } from '@base-ui/react/collapsible'
import { Switch } from '@base-ui/react/switch'
import { ChevronRight, Image as ImageIcon, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { setEnabledModels, testModel, type CatalogGroup, type CatalogModel } from '@/services/api'
import { explainError } from '@/lib/modelStatus'

type Props = {
  group: CatalogGroup
  /** Whether this provider has its own key or login; models can't be enabled or tested without it */
  configured: boolean
  /** Shown above the list while the provider is not configured */
  unconfiguredHint: string
  /** Called after any change so the parent reloads the catalog */
  onChanged: () => void
}

// Models of one provider. Collapsed by default; enabled models are listed first.
export function ProviderModels({ group, configured, unconfiguredHint, onChanged }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)

  const enabledCount = group.models.filter((m) => m.enabled).length

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = group.models.filter(
      (m) => !q || m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q),
    )
    return [...matches].sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name))
  }, [group.models, query])

  const save = async (ids: string[]) => {
    setSaving(true)
    try {
      await setEnabledModels(group.provider, Array.from(new Set(ids)))
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  const setOn = (m: CatalogModel, on: boolean) => {
    const enabled = group.models.filter((x) => x.enabled).map((x) => x.id)
    save(on ? [...enabled, m.id] : enabled.filter((id) => id !== m.id))
  }

  const enableShown = () => {
    const enabled = group.models.filter((x) => x.enabled).map((x) => x.id)
    save([...enabled, ...visible.map((m) => m.id)])
  }

  const test = async (m: CatalogModel) => {
    setTesting(m.id)
    try {
      await testModel(group.provider, m.id)
      onChanged()
    } finally {
      setTesting(null)
    }
  }

  if (group.models.length === 0) {
    return <p className="text-base text-muted-foreground">No models found.</p>
  }

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} disabled={!configured}>
      {!configured && (
        <p className="mb-1.5 text-base text-muted-foreground">{unconfiguredHint}</p>
      )}
      <div className="flex items-center justify-between gap-2">
        <Collapsible.Trigger className={`flex items-center gap-1.5 rounded-md px-1 py-0.5 text-base text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${configured ? '' : 'pointer-events-none opacity-50'}`}>
          <ChevronRight className={`size-4 transition-transform ${open ? 'rotate-90' : ''}`} />
          {enabledCount} of {group.models.length} enabled
        </Collapsible.Trigger>

        {open && (
          <div className="flex items-center gap-1">
            {query.trim() && visible.length > 0 && (
              <Button variant="ghost" size="sm" onClick={enableShown} disabled={saving || !configured}>
                Enable shown
              </Button>
            )}
            {enabledCount > 0 && (
              <Button variant="ghost" size="sm" onClick={() => save([])} disabled={saving}>
                Disable all
              </Button>
            )}
          </div>
        )}
      </div>

      <Collapsible.Panel className="mt-3 space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search models"
            className="h-8 w-full rounded-lg bg-muted/60 pl-8 pr-3 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </div>

        <div className="max-h-80 overflow-y-auto">
          {visible.length === 0 && (
            <p className="py-3 text-base text-muted-foreground">No models match “{query}”.</p>
          )}
          {visible.map((m) => (
            <div key={m.id} className="flex items-center gap-3 py-2 pr-2">
              <Switch.Root
                checked={m.enabled}
                onCheckedChange={(on) => setOn(m, on)}
                disabled={saving || !configured}
                aria-label={`Enable ${m.name}`}
                className="relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full bg-input transition-colors data-[checked]:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
              >
                <Switch.Thumb className="block size-[14px] translate-x-0.5 rounded-full bg-background shadow-sm transition-transform data-[checked]:translate-x-[15px]" />
              </Switch.Root>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-base" title={m.id}>{m.name}</span>
                  {m.supports_images && (
                    <ImageIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label="Supports images" />
                  )}
                </div>
                {m.status && !m.status.ok && (
                  <p className="truncate text-base text-muted-foreground" title={m.status.error ?? ''}>
                    {explainError(m.status.error ?? 'Unknown error')}
                  </p>
                )}
              </div>

              {m.status && (
                <span
                  role="status"
                  aria-label={m.status.ok ? 'Works' : 'Failed'}
                  title={m.status.ok ? 'Works' : explainError(m.status.error ?? 'Unknown error')}
                  className={`size-2 shrink-0 rounded-full ${m.status.ok ? 'bg-green-500' : 'bg-red-500'}`}
                />
              )}

              <Button variant="ghost" size="sm" onClick={() => test(m)} disabled={testing !== null || !configured}>
                {testing === m.id ? 'Testing…' : 'Test'}
              </Button>
            </div>
          ))}
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}
