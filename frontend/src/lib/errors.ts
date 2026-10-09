/**
 * Turns a raw error from the backend or a provider into a short, plain message.
 * The raw text is kept as `detail` so it can still be read when needed.
 */
export type FriendlyError = { title: string; detail: string }

const RULES: Array<{ test: RegExp; title: string }> = [
  { test: /not supported when using codex|chatgpt account/i,
    title: 'This model is not available with your ChatGPT subscription. Choose another model.' },
  { test: /out of extra usage|usage limit|quota|insufficient|rate limit|429/i,
    title: 'This account is out of usage. Add usage or switch to another model.' },
  { test: /401|403|invalid.*key|unauthori[sz]ed|authentication|api key/i,
    title: 'The API key was rejected. Check it in Settings.' },
  { test: /404|model not found|does not exist|not found/i,
    title: 'This model is not available for your account.' },
  { test: /timed out|timeout/i,
    title: 'The request timed out. Try again.' },
  { test: /pi-bridge unreachable|502|econn|fetch failed|network|refused/i,
    title: 'Cannot reach the local service. Check that pi-bridge and the backend are running.' },
]

/** Pulls the human sentence out of a provider's JSON error, if there is one. */
function readableDetail(raw: string): string {
  const match = raw.match(/"message":"((?:[^"\\]|\\.)*)"/)
  if (match) {
    try {
      return JSON.parse(`"${match[1]}"`) as string
    } catch {
      // not valid JSON text; fall through to the raw message
    }
  }
  return raw
}

export function friendlyError(raw: string): FriendlyError {
  const rule = RULES.find((r) => r.test.test(raw))
  const detail = readableDetail(raw)
  return {
    title: rule?.title ?? 'Something went wrong.',
    detail: detail.length > 300 ? `${detail.slice(0, 300)}…` : detail,
  }
}
