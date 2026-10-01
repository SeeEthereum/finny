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
    expect(await (await handler(req('/api/ai/models'))).json()).toEqual({ error: { message: 'Su Netlify manca la variabile OPENAI_API_KEY.' } })
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
})
