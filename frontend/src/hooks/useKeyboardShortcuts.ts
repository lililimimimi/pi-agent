import { useEffect } from 'react'

type ShortcutHandlers = {
  onSend?: () => void
  onNewChat?: () => void
  onOpenSettings?: () => void
  onFocusInput?: () => void
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return

      switch (e.key) {
        case 'Enter': {
          if (document.activeElement?.tagName === 'TEXTAREA' && handlers.onSend) {
            e.preventDefault()
            handlers.onSend()
          }
          break
        }
        case 'k': {
          e.preventDefault()
          handlers.onNewChat?.()
          break
        }
        case ',': {
          e.preventDefault()
          handlers.onOpenSettings?.()
          break
        }
        case '/': {
          e.preventDefault()
          if (handlers.onFocusInput) {
            handlers.onFocusInput()
          } else {
            const textarea = document.querySelector<HTMLTextAreaElement>(
              'textarea[placeholder="Message pi…"]',
            )
            textarea?.focus()
          }
          break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handlers])
}
