import express from 'express'
import { previewRegistry } from '../state.js'

const router = express.Router()

router.post('/approve', (_req, res) => {
  res.json({ status: 'ok' })
})

router.post('/preview/:id/confirm', (req, res) => {
  const ok = previewRegistry.resolve(req.params.id, 'confirm')
  if (!ok) return res.status(404).json({ error: 'Preview not found' })
  res.json({ status: 'ok' })
})

router.post('/preview/:id/cancel', (req, res) => {
  const ok = previewRegistry.resolve(req.params.id, 'cancel')
  if (!ok) return res.status(404).json({ error: 'Preview not found' })
  res.json({ status: 'ok' })
})

export default router
