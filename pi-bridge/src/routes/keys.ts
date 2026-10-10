import express from 'express'
import { ensureRuntime, PROVIDER_KEY_ENV } from '../runtime.js'
import { sendError, messageOf } from '../errors.js'

const router = express.Router()

// ── API Key Management ─────────────────────────────────────────────

router.post('/api-keys', async (req, res) => {
  try {
    const { provider, apiKey } = req.body as { provider: string; apiKey: string }
    const runtime = await ensureRuntime()
    await runtime.setRuntimeApiKey(provider, apiKey)
    res.json({ status: 'ok' })
  } catch (err: unknown) {
    sendError(res, 400, 'BRIDGE_ERROR', messageOf(err))
  }
})

router.get('/api-keys/status', async (_req, res) => {
  try {
    const runtime = await ensureRuntime()
    const result = Object.keys(PROVIDER_KEY_ENV).map((provider) => ({
      provider,
      configured: runtime.hasConfiguredAuth(provider),
    }))
    res.json(result)
  } catch (err: unknown) {
    sendError(res, 400, 'BRIDGE_ERROR', messageOf(err))
  }
})

router.delete('/api-keys/:provider', async (req, res) => {
  try {
    const runtime = await ensureRuntime()
    await runtime.removeRuntimeApiKey(req.params.provider)
    res.json({ status: 'ok' })
  } catch (err: unknown) {
    sendError(res, 400, 'BRIDGE_ERROR', messageOf(err))
  }
})

export default router
