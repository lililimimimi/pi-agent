/** Base path of the backend API. Every request in services/api goes through it. */
export const API_BASE = '/api'

/**
 * The error for a failed response: the backend's own message when it sent one,
 * otherwise `fallback` with the status code.
 */
export async function requestError(res: Response, fallback: string): Promise<Error> {
  const data = await res.json().catch(() => null)
  return new Error(data?.error?.message || `${fallback}: ${res.status}`)
}
