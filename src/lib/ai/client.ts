/**
 * Minimal client for an OpenAI-compatible Chat Completions API, called straight from the browser.
 * Only Authorization and Content-Type headers are sent, so the CORS preflight stays simple.
 */

export const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
/** The Netlify Function that relays to OpenAI with the key kept server-side */
export const SERVER_BASE_URL = '/api/ai'

export interface AiConfig {
  /** empty when the key lives on the server */
  apiKey: string
  baseUrl: string
  model: string
  /** optional, checked by the Netlify Function when FINNY_PASSPHRASE is set */
  passphrase?: string
}

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export interface ToolDef {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export class AiError extends Error {
  kind: 'auth' | 'quota' | 'model' | 'network' | 'server' | 'format'
  constructor(kind: AiError['kind'], message: string) {
    super(message)
    this.kind = kind
  }
}

async function call<T>(cfg: Pick<AiConfig, 'apiKey' | 'baseUrl' | 'passphrase'>, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const url = `${cfg.baseUrl.replace(/\/+$/, '')}${path}`
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), 90_000)
  signal?.addEventListener('abort', () => timeout.abort())
  let res: Response
  try {
    res = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: {
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
        ...(cfg.passphrase ? { 'X-Finny-Pass': cfg.passphrase } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: timeout.signal,
    })
  } catch {
    clearTimeout(timer)
    throw new AiError(
      'network',
      timeout.signal.aborted
        ? 'La richiesta è stata interrotta o ha impiegato troppo tempo.'
        : "Non riesco a raggiungere il servizio. Controlla la connessione; se il problema resta, il browser potrebbe bloccare la chiamata (CORS) o l'indirizzo dell'API è sbagliato.",
    )
  }
  clearTimeout(timer)
  if (!res.ok) {
    let detail = ''
    const raw = await res.text().catch(() => '')
    try {
      detail = JSON.parse(raw)?.error?.message ?? ''
    } catch {
      detail = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)
    }
    if (res.status === 504 || (res.status === 502 && /time ?out|timed out/i.test(detail))) {
      throw new AiError(
        'server',
        `Il modello ci ha messo troppo e la richiesta è stata interrotta (${res.status}). Scegli un modello più veloce in Impostazioni → Assistente AI (per esempio una versione "mini").`,
      )
    }
    if (res.status === 401) throw new AiError('auth', 'La chiave API non è valida o è stata revocata.')
    if (res.status === 429) throw new AiError('quota', `Limite raggiunto: credito esaurito o troppe richieste. ${detail}`.trim())
    if (res.status === 404 && cfg.baseUrl === SERVER_BASE_URL && !detail) {
      throw new AiError('server', 'La funzione AI non è attiva su questo sito: funziona solo sul deploy di Netlify.')
    }
    if (res.status === 403) throw new AiError('auth', detail || 'Accesso rifiutato.')
    if (res.status === 404 || res.status === 400) throw new AiError('model', detail || `Richiesta rifiutata (${res.status}).`)
    throw new AiError('server', `Il servizio ha risposto con un errore (${res.status}). ${detail}`.trim())
  }
  return (await res.json()) as T
}

export interface ServerStatus {
  function: boolean
  keyFound: boolean
  keyVariable: string | null
  keyLooksValid: boolean | null
  relatedVariables: string[]
  deployContext: string | null
  passphraseRequired: boolean
}

/** What the Netlify Function can see: whether it runs, which variable holds the key (names only) */
export async function serverStatus(cfg: Pick<AiConfig, 'baseUrl' | 'passphrase'>): Promise<ServerStatus> {
  return call<ServerStatus>({ apiKey: '', ...cfg }, '/status')
}

/** Lists chat-capable models available to this key; also proves the key works. */
export async function listModels(cfg: Pick<AiConfig, 'apiKey' | 'baseUrl' | 'passphrase'>): Promise<string[]> {
  const data = await call<{ data?: { id: string }[] }>(cfg, '/models')
  return rankModels((data.data ?? []).map((m) => m.id))
}

// models that can't answer a Chat Completions request with tools, or are far too slow for it
const NOT_FOR_CHAT = /(embedding|whisper|tts|dall-e|image|audio|realtime|transcribe|moderation|search|davinci|babbage|sora|codex|computer-use|deep-research|instruct|-pro\b|oss)/i

function version(id: string) {
  const m = id.match(/^(?:gpt|chatgpt)-?(\d+(?:\.\d+)?)/i) ?? id.match(/^o(\d+)/i)
  return m ? Number(m[1]) : 0
}

/**
 * Best candidates first: the newest GPT family, its plain (shortest) id before dated snapshots,
 * then the rest. Unknown providers' models are kept, in their own order, after those.
 */
export function isChatModel(id: string) {
  return !NOT_FOR_CHAT.test(id)
}

export function rankModels(ids: string[]): string[] {
  const usable = ids.filter((id) => !NOT_FOR_CHAT.test(id))
  const list = usable.length ? usable : ids
  const gpt = list.filter((id) => /^(gpt|chatgpt)-/i.test(id))
  const rest = list.filter((id) => !gpt.includes(id))
  gpt.sort((a, b) => version(b) - version(a) || a.length - b.length || a.localeCompare(b))
  return [...gpt, ...rest]
}

interface Completion {
  choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] }; finish_reason?: string }[]
}

export async function chat(
  cfg: AiConfig,
  messages: ChatMessage[],
  opts: { tools?: ToolDef[]; schema?: { name: string; schema: Record<string, unknown> }; signal?: AbortSignal } = {},
) {
  const body: Record<string, unknown> = { model: cfg.model, messages }
  if (opts.tools?.length) body.tools = opts.tools
  if (opts.schema) body.response_format = { type: 'json_schema', json_schema: { name: opts.schema.name, schema: opts.schema.schema, strict: true } }
  let data: Completion
  try {
    data = await call<Completion>(cfg, '/chat/completions', body, opts.signal)
  } catch (e) {
    // some models don't support structured output: ask for the same JSON in plain text instead
    if (!(opts.schema && e instanceof AiError && e.kind === 'model' && /response_format|json_schema|schema|structured/i.test(e.message))) throw e
    delete body.response_format
    body.messages = [
      ...messages,
      { role: 'system', content: `Rispondi solo con un oggetto JSON valido, senza testo prima o dopo, conforme a questo JSON Schema: ${JSON.stringify(opts.schema.schema)}` },
    ]
    data = await call<Completion>(cfg, '/chat/completions', body, opts.signal)
  }
  const msg = data.choices?.[0]?.message
  if (!msg) throw new AiError('format', 'Risposta del modello vuota o in un formato inatteso.')
  return { content: msg.content ?? null, toolCalls: msg.tool_calls ?? [] }
}

/** Parses a JSON answer, tolerating a ```json fence or text around the object */
export function parseJson<T>(content: string | null): T {
  const text = (content ?? '').trim()
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  try {
    return JSON.parse(candidate) as T
  } catch {
    throw new AiError('format', 'Il modello ha risposto in un formato che non riesco a leggere. Riprova o scegli un altro modello.')
  }
}
