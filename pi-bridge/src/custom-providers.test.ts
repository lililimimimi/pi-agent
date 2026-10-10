import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readProviderFromConfig, syncCustomProviders } from './custom-providers.js'

function configFile(body: object): string {
  const dir = mkdtempSync(join(tmpdir(), 'cfg-'))
  const path = join(dir, 'config.json')
  writeFileSync(path, JSON.stringify(body))
  return path
}

describe('readProviderFromConfig', () => {
  it('reads the key and model ids, accepting both string and object entries', () => {
    const path = configFile({
      providers: { siliconflow: { api_key: 'sk-1', models: ['a/b', { id: 'c/d' }] } },
    })
    assert.deepEqual(readProviderFromConfig('siliconflow', path), {
      apiKey: 'sk-1',
      modelIds: ['a/b', 'c/d'],
    })
  })

  it('returns empty values when the file is missing or unreadable', () => {
    assert.deepEqual(readProviderFromConfig('siliconflow', '/no/such/file.json'), {
      apiKey: '',
      modelIds: [],
    })
  })
})

describe('syncCustomProviders', () => {
  it('registers an OpenAI-compatible provider when a key and models exist', () => {
    const path = configFile({ providers: { siliconflow: { api_key: 'sk-1', models: ['x/y'] } } })
    const calls: Array<[string, any]> = []
    const runtime = {
      registerProvider: (id: string, cfg: unknown) => calls.push([id, cfg]),
      unregisterProvider: () => {},
    }
    syncCustomProviders(runtime, path)

    const [id, cfg] = calls[0]
    assert.equal(id, 'siliconflow')
    assert.equal(cfg.api, 'openai-completions')
    assert.equal(cfg.baseUrl, 'https://api.siliconflow.cn/v1')
    assert.equal(cfg.apiKey, 'sk-1')
    assert.deepEqual(
      cfg.models.map((m: any) => m.id),
      ['x/y'],
    )
  })

  it('does nothing without a key', () => {
    const path = configFile({ providers: { siliconflow: { models: ['x/y'] } } })
    const calls: unknown[] = []
    syncCustomProviders({ registerProvider: () => calls.push(1), unregisterProvider: () => {} }, path)
    assert.equal(calls.length, 0)
  })
})
