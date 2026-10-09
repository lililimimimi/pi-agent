import { useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createCustomProvider } from '@/services/api'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded: () => void
}

const FIELD =
  'h-8 w-full rounded-lg bg-muted/60 px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50'

// Adds any OpenAI-compatible provider (name, base URL, key).
export function AddProviderDialog({ open, onOpenChange, onAdded }: Props) {
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setName('')
    setBaseUrl('')
    setApiKey('')
    setError(null)
  }

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await createCustomProvider({ name, base_url: baseUrl, api_key: apiKey })
      if (res.error) {
        setError(`Saved, but the models could not be loaded: ${res.error}`)
      }
      onAdded()
      if (!res.error) {
        reset()
        onOpenChange(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add provider')
    } finally {
      setSaving(false)
    }
  }

  const canSubmit = name.trim() && baseUrl.trim() && apiKey.trim() && !saving

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next) }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[60] bg-black/20 backdrop-blur-sm" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-[70] w-[min(420px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border/50 bg-card p-6 shadow-2xl">
          <div className="flex items-start justify-between">
            <Dialog.Title className="text-base font-semibold">Add provider</Dialog.Title>
            <Dialog.Close className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
              <X className="size-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            Any service with an OpenAI-compatible API.
          </Dialog.Description>

          <form
            className="mt-5 space-y-4"
            onSubmit={(e) => { e.preventDefault(); if (canSubmit) void submit() }}
          >
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Name</span>
              <input className={FIELD} value={name} onChange={(e) => setName(e.target.value)} placeholder="My provider" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Base URL</span>
              <input className={FIELD} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">API key</span>
              <input className={FIELD} type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" />
            </label>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close render={<Button variant="ghost">Cancel</Button>} />
              <Button type="submit" disabled={!canSubmit}>
                {saving ? 'Adding…' : 'Add provider'}
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
