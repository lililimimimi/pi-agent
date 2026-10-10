import express from 'express'
import { homedir } from 'node:os'
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRuntime,
  SessionManager,
} from '@earendil-works/pi-coding-agent'
import type { AgentSession, AgentSessionEvent, ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { buildPreview, needsPreview } from '../preview.js'
import { toPromptInput } from '../content.js'
import { resolveSessionCwd } from '../cwd.js'
import { pickModelForImages, supportsImages } from '../vision.js'
import { getModelRuntime, MODEL_ALIASES, PROVIDER_ALIAS, PROVIDER_DEFAULT_MODEL } from '../runtime.js'
import { previewRegistry, sessions } from '../state.js'
import { log } from '../logger.js'

const HOME_DIR = homedir()

const router = express.Router()

type PreviewController = {
  enabled: boolean
  /** When on, file edits and new files inside `cwd` run without asking */
  autoEdits: boolean
  cwd: string
  cancelled: boolean
  assistantText: string
  send: (event: string, data: Record<string, unknown>) => void
}

/**
 * Inline extension that pauses the agent before its first write tool call and
 * waits for the user to confirm or cancel the execution preview. Read-only
 * tools bypass the gate entirely.
 */
function makePreviewExtension(ctrl: PreviewController) {
  return (pi: ExtensionAPI) => {
    pi.on('tool_call', async (event) => {
      const args = event.input as Record<string, unknown>
      // Every write asks, including the second and third in the same turn
      if (!needsPreview(ctrl, event.toolName, args)) return

      const previewId = crypto.randomUUID()
      const steps = buildPreview({
        assistantText: ctrl.assistantText,
        toolName: event.toolName,
        args,
      })
      ctrl.send('execution_preview', { preview_id: previewId, steps, has_write_ops: true })

      const decision = await previewRegistry.wait(previewId)
      if (decision === 'confirm') return

      ctrl.cancelled = true
      ctrl.send('text', { content: '\n\n> ⏹ Execution cancelled.\n' })
      return { block: true, reason: 'Execution cancelled at preview', terminate: true }
    })
  }
}

export const app = express()
// Images are sent inline as base64, so a single message can be several MB
router.use(express.json({ limit: '20mb' }))

router.post('/chat', async (req, res) => {
  // Correlation ID from the backend, so bridge logs join the same chain
  const cid: string = typeof req.body?.cid === 'string' ? req.body.cid : '-'
  log.info(`cid=${cid} POST /chat model=${req.body?.model} provider=${req.body?.provider}`)
  const {
    messages,
    model: rawModel,
    rules,
  } = req.body as { messages: unknown; model: string; rules?: string; cwd?: string }
  // The selected project folder: tools and rules are scoped to it
  const sessionCwd = resolveSessionCwd(req.body.cwd, HOME_DIR)
  // Resolve provider alias (e.g. "pi" → "anthropic")
  const rawProvider: string = req.body.provider ?? 'anthropic'
  const provider = PROVIDER_ALIAS[rawProvider] ?? rawProvider

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  function send(event: string, data: Record<string, unknown>) {
    res.write(`data: ${JSON.stringify({ event, data })}\n\n`)
  }

  const previewCtrl: PreviewController = {
    enabled: req.body.execution_preview !== false,
    autoEdits: req.body.auto_edits === true,
    cwd: sessionCwd,
    cancelled: false,
    assistantText: '',
    send,
  }

  let runtime: ModelRuntime
  try {
    log.info(`getModelRuntime provider=${provider}`)
    runtime = await getModelRuntime(provider)
    log.info(`runtime ready`)
  } catch (err: unknown) {
    send('error', { message: err instanceof Error ? err.message : 'Failed to init runtime' })
    send('done', {})
    res.end()
    return
  }

  // Resolve model: alias first, then look up in runtime, then fallback to provider default
  const modelId = MODEL_ALIASES[rawModel] ?? rawModel
  let model = runtime.getModel(provider, modelId)
  if (!model) {
    // Try to find any working model for this provider
    const fallbackId = PROVIDER_DEFAULT_MODEL[provider] ?? PROVIDER_DEFAULT_MODEL[rawProvider]
    if (fallbackId) {
      model = runtime.getModel(provider, fallbackId)
      log.info(`model ${modelId} not found, fallback to ${fallbackId} found=${!!model}`)
    }
  } else {
    log.info(`model resolved: ${provider}/${modelId} found=${!!model}`)
  }

  // Images are only sent to models that accept them. For other models, switch to
  // a vision model from the same provider if one exists, otherwise drop the images.
  let imagesDropped = false
  const lastUser = (messages as Array<{ role: string; content: unknown }>)
    .filter((m) => m.role === 'user')
    .at(-1)
  const wantsImages = toPromptInput(lastUser?.content).images.length > 0
  if (model && wantsImages && !supportsImages(model)) {
    const choice = pickModelForImages(model, await runtime.getAvailable())
    if (choice.kind === 'switch') {
      send('text', {
        content: `> The current model cannot read images. Switched to ${choice.model.name} for this message.\n\n`,
      })
      model = choice.model
    } else {
      imagesDropped = true
      send('text', {
        content:
          '> The current model cannot read images, so they were ignored. Pick a model that supports images.\n\n',
      })
    }
  }

  let session: AgentSession
  try {
    log.info(`createAgentSession...`)
    let resourceLoader: DefaultResourceLoader | undefined
    // The loader carries the execution-preview extension and the project rules
    if (previewCtrl.enabled || rules) {
      resourceLoader = new DefaultResourceLoader({
        cwd: sessionCwd,
        agentDir: getAgentDir(),
        extensionFactories: previewCtrl.enabled ? [makePreviewExtension(previewCtrl)] : [],
        // Project and global rules, injected into the system prompt
        appendSystemPrompt: rules ? [rules] : undefined,
      })
      await resourceLoader.reload()
    }
    const result = await createAgentSession({
      cwd: sessionCwd,
      sessionManager: SessionManager.inMemory(),
      modelRuntime: runtime,
      // Image questions are answered directly; tools would only add a detour and an approval wait
      tools: wantsImages ? [] : ['read', 'bash', 'edit', 'write'],
      ...(model ? { model } : {}),
      ...(resourceLoader ? { resourceLoader } : {}),
    })
    session = result.session
  } catch (err: unknown) {
    send('error', { message: err instanceof Error ? err.message : 'Failed to create session' })
    send('done', {})
    res.end()
    return
  }

  const sessionId = crypto.randomUUID()
  sessions.set(sessionId, session)
  let ended = false

  function cleanup() {
    if (!ended) {
      ended = true
      unsubscribe()
      sessions.delete(sessionId)
    }
  }

  const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
    switch (event.type) {
      case 'turn_start':
        // Reset the plan buffer so each turn's steps are independent.
        previewCtrl.assistantText = ''
        break
      case 'message_update': {
        const ame = event.assistantMessageEvent
        if (ame.type === 'text_delta') {
          previewCtrl.assistantText += ame.delta
          send('text', { content: ame.delta })
        }
        break
      }
      case 'tool_execution_start':
        send('tool_call', {
          tool_call_id: event.toolCallId,
          tool_name: event.toolName,
          arguments: event.args as Record<string, unknown>,
        })
        break
      case 'tool_execution_end':
        send('tool_result', {
          tool_call_id: event.toolCallId,
          output: typeof event.result === 'string' ? event.result : JSON.stringify(event.result),
          is_error: event.isError,
        })
        break
      case 'agent_end': {
        for (const msg of event.messages ?? []) {
          if ('role' in msg && msg.role === 'assistant') {
            const m = msg as {
              stopReason?: string
              errorMessage?: string
              usage?: { input: number; output: number }
            }
            if (m.stopReason === 'error' && m.errorMessage) {
              send('error', { message: m.errorMessage })
            }
            if (m.usage) {
              send('usage', { input_tokens: m.usage.input || 0, output_tokens: m.usage.output || 0 })
            }
          }
        }
        send('done', {})
        cleanup()
        res.end()
        break
      }
    }
  })

  const userMessages = (messages as Array<{ role: string; content: unknown }>).filter(
    (m) => m.role === 'user',
  )
  const lastUserMsg = userMessages[userMessages.length - 1]
  if (!lastUserMsg) {
    send('error', { message: 'No user message found' })
    send('done', {})
    cleanup()
    res.end()
    return
  }

  try {
    const { text, images } = toPromptInput(lastUserMsg.content)
    const sendImages = imagesDropped ? [] : images
    await session.prompt(text, sendImages.length > 0 ? { images: sendImages } : undefined)
  } catch (err: unknown) {
    if (!ended) {
      send('error', { message: err instanceof Error ? err.message : 'Unknown error' })
      send('done', {})
      cleanup()
      res.end()
    }
  }

  req.on('close', cleanup)
})

export default router
