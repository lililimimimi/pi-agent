import { useEffect, useMemo, useState } from 'react'
import { ChatView } from '@/components/chat/ChatView'
import { InputBar } from '@/components/chat/InputBar'
import { ModelSelector } from '@/components/model/ModelSelector'
import { TokenCounter } from '@/components/chat/TokenCounter'
import { ContextBar } from '@/components/chat/ContextBar'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { FilePreview } from '@/components/files/FilePreview'
import { SettingsModal } from '@/components/settings/SettingsModal'
import { ApprovalModal } from '@/components/chat/ApprovalModal'
import { useToast } from '@/components/Toast'
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

function ActiveApprovalModal() {
  const permissionRequests = useChatStore((s) => s.permissionRequests)
  // Find the first pending request
  let activeRequest = undefined
  for (const req of permissionRequests.values()) {
    if (req.status === 'pending') { activeRequest = req; break }
  }
  if (!activeRequest) return null
  return <ApprovalModal request={activeRequest} />
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

  const isEmpty = messages.length === 0

  // ── Toast + Network status ──
  const { showToast } = useToast()
  const networkCallbacks = useMemo(() => ({
    onOffline: () => showToast({ type: 'error', message: 'Network connection lost. Check your network.', duration: 0 }),
    onOnline: () => showToast({ type: 'success', message: 'Network connection restored.' }),
  }), [showToast])
  useNetworkStatus(networkCallbacks)

  // ── Keyboard shortcuts ──
  const shortcutHandlers = useMemo(() => ({
    onNewChat: newSession,
    onOpenSettings: () => setSettingsOpen(true),
    onFocusInput: () => {
      const textarea = document.querySelector<HTMLTextAreaElement>('textarea[placeholder="Message pi…"]')
      textarea?.focus()
    },
  }), [newSession])
  useKeyboardShortcuts(shortcutHandlers)

  useEffect(() => {
    // 先加载 projects（包含 path），再加载 sessions（需要 path 匹配），最后回到上次打开的位置
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
          <WorkingDirectory />
          <ContextBar />
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
              <p className="text-sm text-muted-foreground mt-2 font-normal">
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
            <ActiveApprovalModal />
          </>
        )}
      </div>

      <FilePreview />
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
