import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import type { ReactNode } from "react"
import { Info, CheckCircle, AlertCircle, AlertTriangle, X } from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Types ───────────────────────────────────────────────────────────────────

type ToastType = "info" | "success" | "error" | "warning"

interface ToastItem {
  id: string
  type: ToastType
  message: string
  duration: number
  onRetry?: () => void
}

interface ShowToastOptions {
  type: ToastType
  message: string
  duration?: number
  onRetry?: () => void
}

interface ToastContextValue {
  showToast: (options: ShowToastOptions) => void
}

// ─── Context ─────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error("useToast must be used within a <ToastProvider>")
  }
  return ctx
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
  info: "text-blue-500",
  success: "text-green-500",
  error: "text-red-500",
  warning: "text-yellow-500",
}

const BG_MAP: Record<ToastType, string> = {
  info: "bg-blue-50/80 border-blue-200/60",
  success: "bg-green-50/80 border-green-200/60",
  error: "bg-red-50/80 border-red-200/60",
  warning: "bg-yellow-50/80 border-yellow-200/60",
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
        "pointer-events-auto flex w-full max-w-[400px] cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 shadow-lg backdrop-blur-md transition-all duration-300 ease-out",
        BG_MAP[toast.type],
        visible && !exiting
          ? "translate-y-0 opacity-100"
          : "-translate-y-4 opacity-0",
      )}
    >
      <Icon className={cn("size-5 shrink-0", COLOR_MAP[toast.type])} />

      <p className="min-w-0 flex-1 text-sm font-medium text-gray-800">
        {toast.message}
      </p>

      {toast.type === "error" && toast.onRetry && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            toast.onRetry?.()
            dismiss()
          }}
          className="shrink-0 text-sm font-semibold text-red-600 transition-colors hover:text-red-800"
        >
          重试
        </button>
      )}

      <button
        type="button"
        aria-label="关闭"
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

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[]
  onDismiss: (id: string) => void
}) {
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
      duration: options.duration ?? DEFAULT_DURATION,
      onRetry: options.onRetry,
    }
    setToasts((prev) => [...prev, item])
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  )
}
