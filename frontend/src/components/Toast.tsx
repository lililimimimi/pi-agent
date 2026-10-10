import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ToastContext } from '@/components/useToast'
import { Info, CheckCircle, AlertCircle, AlertTriangle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { APP_ERROR_EVENT, type AppErrorDetail } from '@/lib/appError'

// ─── Types ───────────────────────────────────────────────────────────────────

type ToastType = 'info' | 'success' | 'error' | 'warning'

interface ToastItem {
  id: string
  type: ToastType
  message: string
  detail?: string
  duration: number
  onRetry?: () => void
}

export interface ShowToastOptions {
  type: ToastType
  message: string
  /** Optional small line under the message, e.g. the raw error text */
  detail?: string
  duration?: number
  onRetry?: () => void
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_DURATION = 5000

const ICON_MAP: Record<ToastType, typeof Info> = {
  info: Info,
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
}

const COLOR_MAP: Record<ToastType, string> = {
  info: 'text-blue-500',
  success: 'text-green-500',
  error: 'text-red-500',
  warning: 'text-yellow-500',
}

const BG_MAP: Record<ToastType, string> = {
  info: 'bg-blue-50/80 border-blue-200/60',
  success: 'bg-green-50/80 border-green-200/60',
  error: 'bg-red-50/80 border-red-200/60',
  warning: 'bg-yellow-50/80 border-yellow-200/60',
}

// ─── Single Toast ────────────────────────────────────────────────────────────

interface ToastProps {
  toast: ToastItem
  onDismiss: (id: string) => void
}

function Toast({ toast, onDismiss }: ToastProps) {
  const [visible, setVisible] = useState(false)
  const [exiting, setExiting] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dismiss = useCallback(() => {
    setExiting(true)
    setTimeout(() => onDismiss(toast.id), 300)
  }, [onDismiss, toast.id])

  // Entrance animation
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  // Auto-dismiss (duration 0 = persistent)
  useEffect(() => {
    if (toast.duration > 0) {
      timerRef.current = setTimeout(dismiss, toast.duration)
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [dismiss, toast.duration])

  const Icon = ICON_MAP[toast.type]

  return (
    <div
      role="alert"
      onClick={dismiss}
      className={cn(
        'pointer-events-auto flex w-full max-w-[480px] cursor-pointer items-center gap-4 rounded-2xl border px-5 py-4 shadow-lg backdrop-blur-md transition-all duration-300 ease-out',
        BG_MAP[toast.type],
        visible && !exiting ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0',
      )}
    >
      <Icon className={cn('size-5 shrink-0', COLOR_MAP[toast.type])} />

      <div className="min-w-0 flex-1">
        <p className="text-base font-medium leading-snug text-gray-900">{toast.message}</p>
        {toast.detail && (
          <p className="mt-1 line-clamp-2 break-all text-xs text-gray-500" title={toast.detail}>
            {toast.detail}
          </p>
        )}
      </div>

      {toast.type === 'error' && toast.onRetry && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            toast.onRetry?.()
            dismiss()
          }}
          className="shrink-0 text-sm font-semibold text-red-600 transition-colors hover:text-red-800"
        >
          Retry
        </button>
      )}

      <button
        type="button"
        aria-label="Close"
        onClick={(e) => {
          e.stopPropagation()
          dismiss()
        }}
        className="shrink-0 rounded-full p-0.5 text-gray-400 transition-colors hover:bg-gray-200/60 hover:text-gray-600"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}

// ─── Toast Container ─────────────────────────────────────────────────────────

function ToastContainer({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 p-4">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

// ─── Provider ────────────────────────────────────────────────────────────────

let nextId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const showToast = useCallback((options: ShowToastOptions) => {
    const id = String(++nextId)
    const item: ToastItem = {
      id,
      type: options.type,
      message: options.message,
      detail: options.detail,
      duration: options.duration ?? DEFAULT_DURATION,
      onRetry: options.onRetry,
    }
    setToasts((prev) => [...prev, item])
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // Errors reported from stores and helpers (see lib/appError) show as toasts too
  useEffect(() => {
    const onAppError = (event: Event) => {
      const { message, detail } = (event as CustomEvent<AppErrorDetail>).detail
      showToast({ type: 'error', message, detail })
    }
    window.addEventListener(APP_ERROR_EVENT, onAppError)
    return () => window.removeEventListener(APP_ERROR_EVENT, onAppError)
  }, [showToast])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  )
}
