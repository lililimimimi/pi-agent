/**
 * Log output for pi-bridge. Every line starts with [bridge] so it can be told
 * apart from the backend's logs.
 */
const PREFIX = '[bridge]'

export const log = {
  info: (message: string): void => console.log(`${PREFIX} ${message}`),
  warn: (message: string): void => console.warn(`${PREFIX} ${message}`),
  error: (message: string, ...details: unknown[]): void => console.error(`${PREFIX} ${message}`, ...details),
}
