import { statSync } from 'node:fs'
import { log } from './logger.js'

/**
 * Chooses the working directory for an agent session.
 * Uses the selected project folder when it exists; otherwise falls back to the
 * bridge's own directory, so a bad path can never break the chat.
 */
export function resolveSessionCwd(requested: unknown, fallback: string): string {
  if (typeof requested !== 'string' || requested.trim() === '') return fallback
  try {
    if (statSync(requested).isDirectory()) return requested
  } catch {
    // fall through to the fallback
  }
  log.warn(`project path is not a directory, using ${fallback}: ${requested}`)
  return fallback
}
