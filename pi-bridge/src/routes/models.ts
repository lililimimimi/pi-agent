import express from 'express'
import { homedir } from 'node:os'
import { createAgentSession, SessionManager } from '@earendil-works/pi-coding-agent'
import type { AgentSession } from '@earendil-works/pi-coding-agent'
import { ensureRuntime, MODEL_ALIASES, PROVIDER_ALIAS } from '../runtime.js'
import { log } from '../logger.js'

const HOME_DIR = homedir()

const router = express.Router()

router.get('/models', async (_req, res) => {
  try {
    const runtime = await ensureRuntime()
    const available = await runtime.getAvailable()
    const models = available.map((m) => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
      supports_tools: true,
      supports_images: Array.isArray(m.input) && m.input.includes('image'),
    }))
    res.json(models)
  } catch (err) {
    log.error('/models error:', err)
    res.json([])
  }
})

const MODEL_TEST_TIMEOUT_MS = 60_000

/**
 * Checks that one model actually answers: a single short prompt, no tools,
 * in-memory session (nothing is written to the session files).
 */
router.post('/models/test', async (req, res) => {
  const rawProvider = req.body?.provider
  const rawModel = req.body?.model
  if (typeof rawProvider !== 'string' || typeof rawModel !== 'string') {
    res.status(400).json({ ok: false, error: 'provider and model are required' })
    return
  }
  const provider = PROVIDER_ALIAS[rawProvider] ?? rawProvider
  const modelId = MODEL_ALIASES[rawModel] ?? rawModel
  const started = Date.now()
  let session: AgentSession | undefined
  try {
    const runtime = await ensureRuntime()
    const model = runtime.getModel(provider, modelId)
    if (!model) {
      res.json({ ok: false, error: 'Model not found' })
      return
    }
    const result = await createAgentSession({
      cwd: HOME_DIR,
      sessionManager: SessionManager.inMemory(),
      modelRuntime: runtime,
      tools: [],
      model,
    })
    session = result.session
    await Promise.race([
      session.prompt('Reply with the single word: ok'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out')), MODEL_TEST_TIMEOUT_MS)),
    ])
    res.json({ ok: true, ms: Date.now() - started })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.json({ ok: false, error: message, ms: Date.now() - started })
  } finally {
    session?.dispose()
  }
})

router.get('/models/default', async (_req, res) => {
  try {
    const runtime = await ensureRuntime()
    const available = await runtime.getAvailable()
    // Prefer non-mock provider
    const preferred = available.find((m) => m.provider !== 'mock') ?? available[0]
    if (preferred) {
      res.json({ provider: preferred.provider, model: preferred.id })
    } else {
      res.json({ provider: 'mock', model: 'mock-1' })
    }
  } catch {
    res.json({ provider: 'mock', model: 'mock-1' })
  }
})

export default router
