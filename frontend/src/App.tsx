import { useEffect, useState } from 'react'
import { ChatView } from '@/components/ChatView'
import { InputBar } from '@/components/InputBar'
import { ModelSelector } from '@/components/ModelSelector'
import { TokenCounter } from '@/components/TokenCounter'
import { Sidebar } from '@/components/Sidebar'
import { SettingsModal } from '@/components/SettingsModal'
import { useChatStore } from '@/stores/chatStore'
import { PanelLeft } from 'lucide-react'

const PI_GRADIENT = {
  background: 'linear-gradient(135deg, #007AFF 0%, #AF52DE 50%, #FF2D55 100%)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
} as const

export function App() {
  const initProvider = useChatStore((s) => s.initProvider)
  const messages = useChatStore((s) => s.messages)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const isEmpty = messages.length === 0

  useEffect(() => { initProvider() }, [initProvider])

  // ⌘B — toggle sidebar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault()
        setSidebarOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {sidebarOpen && <Sidebar onSettingsClick={() => setSettingsOpen(true)} />}

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        <header className="flex items-center gap-3 px-4 h-[61px] bg-background/80 backdrop-blur-xl border-b border-border/50 sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? 'Hide Sidebar (⌘B)' : 'Show Sidebar (⌘B)'}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <PanelLeft className="h-4 w-4" strokeWidth={1.8} />
          </button>
          <div className="flex-1" />
          <TokenCounter />
          <ModelSelector />
        </header>

        {/* ── Empty state: greeting + input centered ── */}
        {isEmpty ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 pb-16">
            {/* Greeting */}
            <div className="text-center select-none mb-8">
              <div className="flex items-center justify-center w-20 h-20 rounded-3xl bg-foreground/[0.05] mx-auto mb-6">
                <span className="text-5xl font-bold leading-none" style={PI_GRADIENT}>π</span>
              </div>
              <p className="text-2xl font-semibold tracking-tight text-foreground/75">pi</p>
              <p className="text-sm text-muted-foreground/60 mt-2 font-normal">
                How can I help you today?
              </p>
            </div>

            {/* Input — same style, but centered here */}
            <div className="w-full max-w-2xl">
              <InputBar bare />
            </div>
          </div>
        ) : (
          /* ── Normal state: messages + input pinned bottom ── */
          <>
            <ChatView />
            <InputBar />
          </>
        )}
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
