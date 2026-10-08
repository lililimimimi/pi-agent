import { useRef } from 'react'
import { FileText, X } from 'lucide-react'
import { useFileBrowserStore, clampPreviewWidth } from '@/stores/fileBrowserStore'

// Right-hand pane showing the file clicked in the sidebar tree
export function FilePreview() {
  const preview = useFileBrowserStore((s) => s.preview)
  const closePreview = useFileBrowserStore((s) => s.closePreview)
  const width = useFileBrowserStore((s) => s.previewWidth)
  const setPreviewWidth = useFileBrowserStore((s) => s.setPreviewWidth)
  const startWidth = useRef(width)

  if (!preview) return null

  const lines = preview.content.split('\n')

  // Drag the left edge to resize; the pane grows as the pointer moves left
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    const startX = e.clientX
    startWidth.current = width
    const onMove = (ev: PointerEvent) => {
      setPreviewWidth(clampPreviewWidth(startWidth.current + (startX - ev.clientX), window.innerWidth))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <aside
      style={{ width }}
      className="relative shrink-0 flex flex-col border-l border-border/50 bg-card"
    >
      <div
        onPointerDown={handlePointerDown}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize preview"
        className="absolute left-0 top-0 bottom-0 z-10 w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-foreground/10 transition-colors"
      />
      <div className="flex items-center gap-2 px-4 h-[61px] border-b border-border/50">
        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" strokeWidth={1.8} />
        <span className="truncate flex-1 text-sm font-medium" title={preview.path}>
          {preview.path}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground/60">{lines.length} lines</span>
        <button
          onClick={closePreview}
          aria-label="Close preview"
          className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto py-2 font-mono text-xs leading-5">
        {lines.map((line, i) => (
          <div key={i} className="flex">
            <span className="w-12 shrink-0 select-none pr-3 text-right text-muted-foreground/40">{i + 1}</span>
            <span className="whitespace-pre pr-4">{line}</span>
          </div>
        ))}
      </div>
    </aside>
  )
}
