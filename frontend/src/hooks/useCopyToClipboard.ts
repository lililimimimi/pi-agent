import { useCallback, useEffect, useRef, useState } from 'react'
import { reportError } from '@/lib/appError'

/** Copies text and reports `copied` for a moment, so the button can show it. */
export function useCopyToClipboard(resetAfterMs = 1500) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  const copy = useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text).then(
        () => {
          setCopied(true)
          if (timerRef.current) clearTimeout(timerRef.current)
          timerRef.current = setTimeout(() => setCopied(false), resetAfterMs)
        },
        (e: unknown) => reportError('Could not copy to the clipboard', e),
      )
    },
    [resetAfterMs],
  )

  return { copied, copy }
}
