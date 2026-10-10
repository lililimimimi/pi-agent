import express from 'express'
import { ensureRuntime, PROVIDER_ALIAS } from '../runtime.js'
import { clearLoginSession, getLoginSession, startLogin } from '../login.js'

const router = express.Router()

// ── In-app login (OAuth providers such as the ChatGPT subscription) ──
router.post('/auth/login', async (req, res) => {
  const provider = typeof req.body?.provider === 'string' ? req.body.provider : ''
  if (!provider) {
    res.status(400).json({ error: 'provider is required' })
    return
  }
  try {
    const runtime = await ensureRuntime()
    const sdkId = PROVIDER_ALIAS[provider] ?? provider
    const session = startLogin(provider, (interaction) =>
      runtime.login(sdkId, 'oauth', { ...interaction, signal: new AbortController().signal }),
    )
    res.json({ status: session.status })
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? String(err) })
  }
})

router.post('/auth/logout', async (req, res) => {
  const provider = typeof req.body?.provider === 'string' ? req.body.provider : ''
  if (!provider) {
    res.status(400).json({ error: 'provider is required' })
    return
  }
  try {
    const runtime = await ensureRuntime()
    await runtime.logout(PROVIDER_ALIAS[provider] ?? provider)
    clearLoginSession(provider)
    res.json({ status: 'ok' })
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? String(err) })
  }
})

router.get('/auth/login/:provider', (req, res) => {
  const session = getLoginSession(req.params.provider)
  if (!session) {
    res.json({ status: 'idle', events: [] })
    return
  }
  res.json(session)
})

export default router
