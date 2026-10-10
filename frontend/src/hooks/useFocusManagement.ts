import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select, [tabindex]:not([tabindex="-1"])'

/**
 * While a dialog is open: focus moves into it, Tab stays inside it,
 * and when it closes focus goes back to the element that opened it.
 */
export function useDialogFocus(dialogRef: RefObject<HTMLElement | null>, active = true): void {
  useEffect(() => {
    if (!active) return
    const opener = document.activeElement as HTMLElement | null
    dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()

    const onKey = (e: KeyboardEvent) => {
      const root = dialogRef.current
      if (e.key !== 'Tab' || !root) return
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [active, dialogRef])
}

/**
 * While a menu is open: focus moves to its first item, Up/Down move between items,
 * and Escape closes it and returns focus to the button that opened it.
 */
export function useMenuKeyboard(
  menuRef: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
  triggerRef: RefObject<HTMLElement | null>,
): void {
  // Keep the latest close handler without re-running the focus logic on every render
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const items = () =>
      Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]') ?? [],
      )
    items()[0]?.focus()

    const onKey = (e: KeyboardEvent) => {
      const list = items()
      if (list.length === 0) return
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const i = list.indexOf(document.activeElement as HTMLElement)
        const step = e.key === 'ArrowDown' ? 1 : -1
        list[(i + step + list.length) % list.length].focus()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        closeRef.current()
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, menuRef, triggerRef])
}
