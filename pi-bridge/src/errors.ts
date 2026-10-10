import type { Response } from 'express'

/** The message of anything that was thrown, whatever its type */
export function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Sends an error in the same shape as the backend: { error: { code, message } } */
export function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } })
}
