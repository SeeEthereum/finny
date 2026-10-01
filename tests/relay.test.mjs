import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../netlify/functions/ai.mjs'

const SITE = 'https://finny.example.netlify.app'
let vars

beforeEach(() => {
  vars = { OPENAI_API_KEY: 'sk-server' }
  globalThis.Netlify = { env: { get: (k) => vars[k] } }
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete globalThis.Netlify
})

const req = (path, { method = 'GET', origin = SITE, site = 'same-origin', body, headers = {} } = {}) =>
  new Request(`${SITE}${path}`, {
    method,
    body,
    headers: { ...(origin ? { origin } : {}), ...(site ? { 'sec-fetch-site': site } : {}), ...headers },
  })

describe('Netlify AI relay', () => {
  it('forwards allowed calls with the server key, which the caller never sees', async () => {
    const upstream = vi.fn(async () => new Response('{"data":[{"id":"gpt-x"}]}', { status: 200 }))
    vi.stubGlobal('fetch', upstream)
    const res = await handler(req('/api/ai/models'))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('{"data":[{"id":"gpt-x"}]}')
    const [url, init] = upstream.mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/models')
    expect(init.headers.Authorization).toBe('Bearer sk-server')
  })

  it('relays chat completions bodies untouched', async () => {
    const upstream = vi.fn(async () => new Response('{"choices":[]}', { status: 200 }))
    vi.stubGlobal('fetch', upstream)
    const body = JSON.stringify({ model: 'gpt-x', messages: [] })
    await handler(req('/api/ai/chat/completions', { method: 'POST', body }))
    expect(upstream.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions')
    expect(upstream.mock.calls[0][1].body).toBe(body)
  })

  it('refuses requests coming from other websites or from outside a browser page', async () => {
    vi.stubGlobal('fetch', vi.fn())
    expect((await handler(req('/api/ai/models', { origin: 'https://evil.example' }))).status).toBe(403)
    expect((await handler(req('/api/ai/models', { origin: null, site: 'cross-site' }))).status).toBe(403)
    expect((await handler(req('/api/ai/models', { origin: null, site: null }))).status).toBe(403)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('only relays the two endpoints Finny uses', async () => {
    vi.stubGlobal('fetch', vi.fn())
    expect((await handler(req('/api/ai/files'))).status).toBe(404)
    expect((await handler(req('/api/ai/models', { method: 'POST', body: '{}' }))).status).toBe(404)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('checks the passphrase only when one is configured', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
    vars.FINNY_PASSPHRASE = 'segreto'
    expect((await handler(req('/api/ai/models'))).status).toBe(403)
    expect((await handler(req('/api/ai/models', { headers: { 'x-finny-pass': 'sbagliato' } }))).status).toBe(403)
    expect((await handler(req('/api/ai/models', { headers: { 'x-finny-pass': 'segreto' } }))).status).toBe(200)
  })

  it('explains a missing or rejected server key', async () => {
    delete vars.OPENAI_API_KEY
    const missing = await handler(req('/api/ai/models'))
    expect(missing.status).toBe(500)
    expect((await missing.json()).error.message).toMatch(/OPENAI_API_KEY/)
    vars.OPENAI_API_KEY = 'sk-revoked'
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{"message":"Incorrect API key"}}', { status: 401 })))
    const res = await handler(req('/api/ai/models'))
    expect(res.status).toBe(502)
    expect((await res.json()).error.message).toMatch(/OPENAI_API_KEY/)
  })

  it('caps the request size', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const res = await handler(req('/api/ai/chat/completions', { method: 'POST', body: 'x'.repeat(300 * 1024) }))
    expect(res.status).toBe(413)
  })

  it('finds the key under common alternative names and cleans pasted values', async () => {
    const upstream = vi.fn(async () => new Response('{"data":[]}', { status: 200 }))
    vi.stubGlobal('fetch', upstream)
    delete vars.OPENAI_API_KEY
    vars.OPENAI_KEY = '  "Bearer sk-pasted"\n'
    await handler(req('/api/ai/models'))
    expect(upstream.mock.calls[0][1].headers.Authorization).toBe('Bearer sk-pasted')
  })

  it('reports what it can see without ever returning the key', async () => {
    vars.OPENAI_API_KEY = 'sk-very-secret'
    vars.NETLIFY_NOTHING = 'x'
    globalThis.Netlify.env.toObject = () => ({ ...vars })
    const res = await handler(req('/api/ai/status'), { deploy: { context: 'branch-deploy' } })
    const body = await res.json()
    expect(body).toMatchObject({ function: true, keyFound: true, keyVariable: 'OPENAI_API_KEY', keyLooksValid: true, deployContext: 'branch-deploy' })
    expect(body.relatedVariables).toContain('OPENAI_API_KEY')
    expect(JSON.stringify(body)).not.toContain('sk-very-secret')
  })

  it('status works even when no key is set, so the problem can be diagnosed', async () => {
    delete vars.OPENAI_API_KEY
    vars.OPENAI_APY_KEY = 'sk-typo'
    globalThis.Netlify.env.toObject = () => ({ ...vars })
    const body = await (await handler(req('/api/ai/status'))).json()
    expect(body.keyFound).toBe(true) // found by the last-resort scan: related name, sk- value
    expect(body.keyVariable).toBe('OPENAI_APY_KEY')
  })

  it('stops a slow upstream call with a clear message and logs only metadata', async () => {
    vars.FINNY_AI_TIMEOUT_MS = '20'
    vi.stubGlobal('fetch', vi.fn((_u, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))))))
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const res = await handler(req('/api/ai/chat/completions', { method: 'POST', body: JSON.stringify({ model: 'gpt-slow', messages: [{ role: 'user', content: 'segreto' }] }) }))
    expect(res.status).toBe(504)
    expect((await res.json()).error.message).toMatch(/gpt-slow/)
    expect(log.mock.calls[0][0]).toMatch(/chat\/completions model=gpt-slow TIMEOUT/)
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/segreto|sk-server/)
    log.mockRestore()
  })
})
