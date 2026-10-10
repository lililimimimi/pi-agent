import { createContext, useContext } from 'react'
import type { ShowToastOptions } from '@/components/Toast'

export interface ToastContextValue {
  showToast: (options: ShowToastOptions) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within a <ToastProvider>')
  }
  return ctx
}
