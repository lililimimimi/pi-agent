/**
 * Errors from places with no React context (stores, helpers) reach the user through this event.
 * ToastProvider listens for it and shows the message as an error toast.
 */
export const APP_ERROR_EVENT = 'app-error'

export type AppErrorDetail = { message: string; detail?: string }

/** `message` is a sentence for the user; the raw error text, when there is one, goes in `detail`. */
export function reportError(message: string, error?: unknown): void {
  const detail = error instanceof Error ? error.message : error === undefined ? undefined : String(error)
  const payload: AppErrorDetail = { message, detail }
  window.dispatchEvent(new CustomEvent<AppErrorDetail>(APP_ERROR_EVENT, { detail: payload }))
}
