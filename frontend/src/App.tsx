import { useEffect } from 'react'
import { ChatView } from '@/components/ChatView'
import { InputBar } from '@/components/InputBar'
import { TokenCounter } from '@/components/TokenCounter'
import { useChatStore } from '@/stores/chatStore'
import { Bot } from 'lucide-react'

export function App() {
  const initProvider = useChatStore((s) => s.initProvider)

  useEffect(() => {
    initProvider()
  }, [initProvider])

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Header */}
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">CodeAssistant</h1>
        </div>
        <TokenCounter />
      </header>

      {/* Messages */}
      <ChatView />

      {/* Input */}
      <InputBar />
    </div>
  )
}
