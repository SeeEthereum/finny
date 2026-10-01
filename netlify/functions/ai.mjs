/**
 * Server-side relay to OpenAI (or any OpenAI-compatible API).
 * The API key lives in Netlify's environment and never reaches the browser.
 *
 * Guards, cheapest first:
 * - only GET /status, GET /models and POST /chat/completions are served
 * - requests must come from this site (Origin / Sec-Fetch-Site), which stops other websites from using it
 * - request bodies are capped
 * - optional: if FINNY_PASSPHRASE is set, requests must carry it in X-Finny-Pass
 */

const MAX_BODY = 256 * 1024
const ROUTES = { 'GET models': 'models', 'POST chat/completions': 'chat/completions' }
// the name the README asks for first, then the ones people commonly type instead
const KEY_NAMES = ['OPENAI_API_KEY', 'OPENAI_KEY', 'OPENAI_APIKEY', 'OPEN_AI_API_KEY', 'OPEN_AI_KEY', 'OPENAI_TOKEN', 'CHATGPT_API_KEY', 'CHATGPT_KEY', 'VITE_OPENAI_API_KEY', 'VITE_OPENAI_KEY']
const LOOKS_RELATED = /OPENAI|OPEN_AI|CHATGPT|GPT|API_?KEY|FINNY/i

const env = (name) => globalThis.Netlify?.env?.get(name) ?? process.env[name]

function envNames() {
  let names = []
  try {
    names = Object.keys(globalThis.Netlify?.env?.toObject?.() ?? {})
  } catch {
    /* older runtime */
  }
  return [...new Set([...names, ...Object.keys(process.env)])]
}

/** Strips what often sneaks in when pasting: spaces, newlines, quotes, a "Bearer " prefix */
function clean(value) {
  return (value ?? '').trim().replace(/^["']|["']$/g, '').replace(/^Bearer\s+/i, '').trim()
}

function findKey() {
  for (const name of KEY_NAMES) {
    const v = clean(env(name))
    if (v) return { key: v, name }
  }
  // last resort: any related-looking variable holding an OpenAI-style key
  for (const name of envNames()) {
    if (!LOOKS_RELATED.test(name)) continue
    const v = clean(env(name))
    if (v.startsWith('sk-')) return { key: v, name }
  }
  return { key: '', name: null }
}

function json(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
}
const fail = (status, message) => json(status, { error: { message } })

function sameText(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export default async (req, context) => {
  const url = new URL(req.url)
  const origin = req.headers.get('origin')
  const fetchSite = req.headers.get('sec-fetch-site')
  if (origin ? origin !== url.origin : fetchSite !== 'same-origin') {
    return fail(403, 'Richiesta rifiutata: arriva da fuori dal sito.')
  }

  const pass = clean(env('FINNY_PASSPHRASE'))
  if (pass && !sameText(req.headers.get('x-finny-pass') ?? '', pass)) {
    return fail(403, 'Passphrase mancante o sbagliata.')
  }

  const sub = url.pathname.replace(/^\/api\/ai\/?/, '')
  const { key, name } = findKey()

  // diagnostics: what this function can see. Variable names only, never values.
  if (req.method === 'GET' && sub === 'status') {
    return json(200, {
      function: true,
      keyFound: !!key,
      keyVariable: name,
      keyLooksValid: key ? key.startsWith('sk-') : null,
      relatedVariables: envNames().filter((n) => LOOKS_RELATED.test(n)).sort(),
      deployContext: context?.deploy?.context ?? env('CONTEXT') ?? null,
      passphraseRequired: !!pass,
    })
  }

  if (!key) {
    const related = envNames().filter((n) => LOOKS_RELATED.test(n))
    return fail(
      500,
      related.length
        ? `Su Netlify non trovo una chiave OpenAI valida. Variabili simili visibili: ${related.join(', ')}. Chiamala OPENAI_API_KEY e controlla che il valore inizi con sk-.`
        : 'La funzione non vede nessuna variabile OPENAI_API_KEY. Su Netlify controlla che lo scope includa "Functions" e che valga per il contesto di questo deploy, poi rifai il deploy.',
    )
  }

  const target = ROUTES[`${req.method} ${sub}`]
  if (!target) return fail(404, 'Percorso non disponibile.')

  let body
  if (req.method === 'POST') {
    body = await req.text()
    if (body.length > MAX_BODY) return fail(413, 'Richiesta troppo grande.')
  }

  const base = (clean(env('OPENAI_BASE_URL')) || 'https://api.openai.com/v1').replace(/\/+$/, '')
  let upstream
  try {
    upstream = await fetch(`${base}/${target}`, {
      method: req.method,
      headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body,
    })
  } catch {
    return fail(502, 'Il server di Netlify non riesce a raggiungere il servizio AI.')
  }
  const text = await upstream.text()
  // a 401 from upstream is about the server key, not the visitor: say so
  if (upstream.status === 401) return fail(502, `OpenAI rifiuta la chiave salvata su Netlify (${name}): non è valida o è stata revocata.`)
  return new Response(text, { status: upstream.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
}

export const config = { path: '/api/ai/*' }
