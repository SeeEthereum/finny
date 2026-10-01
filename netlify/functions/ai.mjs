/**
 * Server-side relay to OpenAI (or any OpenAI-compatible API).
 * The API key lives in Netlify's environment (OPENAI_API_KEY) and never reaches the browser.
 *
 * Guards, cheapest first:
 * - only GET /models and POST /chat/completions are relayed
 * - requests must come from this site (Origin / Sec-Fetch-Site), which stops other websites from using it
 * - request bodies are capped
 * - optional: if FINNY_PASSPHRASE is set, requests must carry it in X-Finny-Pass
 */

const MAX_BODY = 256 * 1024
const ROUTES = { 'GET models': 'models', 'POST chat/completions': 'chat/completions' }

const env = (name) => globalThis.Netlify?.env?.get(name) ?? process.env[name]

function json(status, message) {
  return new Response(JSON.stringify({ error: { message } }), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
}

function sameText(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export default async (req) => {
  const key = env('OPENAI_API_KEY')
  if (!key) return json(500, 'Su Netlify manca la variabile OPENAI_API_KEY.')

  const url = new URL(req.url)
  const origin = req.headers.get('origin')
  const fetchSite = req.headers.get('sec-fetch-site')
  if (origin ? origin !== url.origin : fetchSite !== 'same-origin') {
    return json(403, 'Richiesta rifiutata: arriva da fuori dal sito.')
  }

  const pass = env('FINNY_PASSPHRASE')
  if (pass && !sameText(req.headers.get('x-finny-pass') ?? '', pass)) {
    return json(403, 'Passphrase mancante o sbagliata.')
  }

  const sub = url.pathname.replace(/^\/api\/ai\/?/, '')
  const target = ROUTES[`${req.method} ${sub}`]
  if (!target) return json(404, 'Percorso non disponibile.')

  let body
  if (req.method === 'POST') {
    body = await req.text()
    if (body.length > MAX_BODY) return json(413, 'Richiesta troppo grande.')
  }

  const base = (env('OPENAI_BASE_URL') || 'https://api.openai.com/v1').replace(/\/+$/, '')
  let upstream
  try {
    upstream = await fetch(`${base}/${target}`, {
      method: req.method,
      headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body,
    })
  } catch {
    return json(502, 'Il server di Netlify non riesce a raggiungere il servizio AI.')
  }
  const text = await upstream.text()
  // a 401 from upstream is about the server key, not the visitor: say so
  if (upstream.status === 401) return json(502, 'La chiave salvata su Netlify (OPENAI_API_KEY) non è valida o è stata revocata.')
  return new Response(text, { status: upstream.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
}

export const config = { path: '/api/ai/*' }
