/**
 * Turns a raw provider or bridge error into a short, actionable message.
 * Test results themselves are stored by the backend in config.json.
 */
export function explainError(raw: string): string {
  const msg = raw.toLowerCase()
  if (/out of extra usage|quota|usage limit|rate limit|429|insufficient/.test(msg)) {
    return 'Out of quota or usage limit. Check your provider dashboard.'
  }
  if (/401|403|invalid.*key|unauthori[sz]ed|authentication|api key/.test(msg)) {
    return 'Key is invalid or lacks permission. Check it in Settings.'
  }
  if (/404|model not found|does not exist|not found/.test(msg)) {
    return 'Model does not exist, or your account cannot use it.'
  }
  if (/timed out|timeout/.test(msg)) {
    return 'Request timed out. Try again later.'
  }
  if (/econn|fetch failed|unreachable|network|refused/.test(msg)) {
    return 'Cannot reach the service. Check your network or that pi-bridge is running.'
  }
  const short = raw.length > 120 ? `${raw.slice(0, 120)}…` : raw
  return `Test failed: ${short}`
}
