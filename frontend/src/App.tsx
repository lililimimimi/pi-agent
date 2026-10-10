import { useEffect, useMemo, useRef, useState } from 'react'
import { ChatView } from '@/components/chat/ChatView'
import { InputBar } from '@/components/chat/InputBar'
import { ModelSelector } from '@/components/model/ModelSelector'
import { TokenCounter } from '@/components/chat/TokenCounter'
import { ContextBar } from '@/components/chat/ContextBar'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { FilePreview } from '@/components/files/FilePreview'
import { SettingsModal } from '@/components/settings/SettingsModal'
import { ShortcutsDialog } from '@/components/ShortcutsDialog'
import { useToast } from '@/components/useToast'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { useChatStore } from '@/stores/chatStore'
import { PanelLeft } from 'lucide-react'

// Folder the agent works in, so it is always clear which project a chat uses
function WorkingDirectory() {
  const path = useChatStore((s) => s.projects.find((p) => p.id === s.activeProjectId)?.path)
  // General has no folder of its own: chats there use the home folder
  return (
    <span className="max-w-[260px] truncate text-sm text-muted-foreground" title={path ?? 'Home folder'}>
      {path ?? '~ (home)'}
    </span>
  )
}

// Shown in the header while the agent waits for the user: a tool approval or an execution preview.
// Nothing times out, so this is how the user can tell the agent is waiting on them.
function AwaitingApproval() {
  const waiting = useChatStore((s) => s.executionPreview !== null)
  if (!waiting) return null
  return (
    <span role="status" className="text-sm font-medium text-amber-600 whitespace-nowrap">
      Awaiting approval
    </span>
  )
}

// Draws a red dot on the page's tab icon, or puts the original icon back
function setFaviconDot(on: boolean) {
  const link = document.querySelector<HTMLLinkElement>("link[rel~='icon']")
  if (!link) return
  if (!link.dataset.original) link.dataset.original = link.href
  const original = link.dataset.original
  if (!on) {
    link.href = original
    return
  }
  const img = new Image()
  img.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = 32
    canvas.height = 32
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(img, 0, 0, 32, 32)
    ctx.beginPath()
    ctx.arc(24, 8, 7, 0, Math.PI * 2)
    ctx.fillStyle = '#ef4444'
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.stroke()
    link.href = canvas.toDataURL('image/png')
  }
  img.src = original
}

// True when a reply finished while the page was not in front; cleared when the user comes back
function useReplyDoneDot(): boolean {
  const isStreaming = useChatStore((s) => s.isStreaming)
  const [done, setDone] = useState(false)
  const wasStreaming = useRef(false)

  useEffect(() => {
    if (wasStreaming.current && !isStreaming && (document.hidden || !document.hasFocus())) {
      setDone(true)
    }
    wasStreaming.current = isStreaming
  }, [isStreaming])

  useEffect(() => {
    const clear = () => {
      if (!document.hidden && document.hasFocus()) setDone(false)
    }
    document.addEventListener('visibilitychange', clear)
    window.addEventListener('focus', clear)
    return () => {
      document.removeEventListener('visibilitychange', clear)
      window.removeEventListener('focus', clear)
    }
  }, [])

  useEffect(() => {
    setFaviconDot(done)
  }, [done])

  return done
}

const PI_GRADIENT = {
  background: 'linear-gradient(135deg, #007AFF 0%, #AF52DE 50%, #FF2D55 100%)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
} as const

export function App() {
  const initProvider = useChatStore((s) => s.initProvider)
  const loadPersistedSessions = useChatStore((s) => s.loadPersistedSessions)
  const loadPersistedProjects = useChatStore((s) => s.loadPersistedProjects)
  const restoreLastView = useChatStore((s) => s.restoreLastView)
  const messages = useChatStore((s) => s.messages)
  const newSession = useChatStore((s) => s.newSession)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  useReplyDoneDot()

  const isEmpty = messages.length === 0

  const chatLoading = useChatStore((st) => st.chatLoading)

  // ── Toast + Network status ──
  const { showToast } = useToast()
  const networkCallbacks = useMemo(
    () => ({
      onOffline: () =>
        showToast({ type: 'error', message: 'Network connection lost. Check your network.', duration: 0 }),
      onOnline: () => showToast({ type: 'success', message: 'Network connection restored.' }),
    }),
    [showToast],
  )
  useNetworkStatus(networkCallbacks)

  // ── Keyboard shortcuts ──
  const shortcutHandlers = useMemo(
    () => ({
      onNewChat: newSession,
      onOpenSettings: () => setSettingsOpen(true),
      onShowShortcuts: () => setShortcutsOpen(true),
      onFocusInput: () => {
        const textarea = document.querySelector<HTMLTextAreaElement>('textarea[placeholder="Message pi…"]')
        textarea?.focus()
      },
    }),
    [newSession],
  )
  useKeyboardShortcuts(shortcutHandlers)

  useEffect(() => {
    // Load projects first (they hold the path), then sessions (matched by path), then return to the last open view
    const init = async () => {
      await Promise.all([initProvider(), loadPersistedProjects()])
      await loadPersistedSessions()
      await restoreLastView()
    }
    init()
  }, [initProvider, loadPersistedSessions, loadPersistedProjects, restoreLastView])

  // Opened from the model picker's empty state
  useEffect(() => {
    const open = () => setSettingsOpen(true)
    window.addEventListener('open-settings', open)
    return () => window.removeEventListener('open-settings', open)
  }, [])

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

      <div className="flex flex-1 min-w-0 overflow-hidden">
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
            <AwaitingApproval />
            <WorkingDirectory />
            <ContextBar />
            <TokenCounter />
            <ModelSelector />
          </header>

          {/* ── Empty state: greeting + input centered ── */}
          {chatLoading ? (
            <div
              className="flex-1 flex items-center justify-center text-sm text-muted-foreground"
              role="status"
            >
              Loading chat…
            </div>
          ) : isEmpty ? (
            <div className="flex-1 flex flex-col items-center justify-center px-6 pb-16">
              {/* Greeting */}
              <div className="text-center select-none mb-8">
                <div className="flex items-center justify-center w-20 h-20 rounded-3xl bg-foreground/[0.05] mx-auto mb-6">
                  <span className="text-5xl font-bold leading-none" style={PI_GRADIENT}>
                    π
                  </span>
                </div>
                <p className="text-2xl font-semibold tracking-tight text-foreground/75">pi</p>
                <p className="text-sm text-muted-foreground mt-2 font-normal">How can I help you today?</p>
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

        <FilePreview />
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
    </div>
  )
}
