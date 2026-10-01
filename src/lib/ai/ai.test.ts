import { afterEach, describe, expect, it, vi } from 'vitest'
import { demoSnapshot } from '../demo'
import { ask, proposeCategories } from './agent'
import { generateBrief, briefFingerprint } from './brief'
import { listModels, parseJson, rankModels } from './client'
import { runTool, type ToolContext } from './tools'

const demo = demoSnapshot()
const ctx: ToolContext = { transactions: demo.transactions, accounts: demo.accounts, budgets: demo.budgets, shareMerchants: true }
const cfg = { apiKey: 'sk-test', baseUrl: 'https://api.example.test/v1', model: 'test-model' }

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

afterEach(() => vi.unstubAllGlobals())

describe('local tools', () => {
  it('never returns raw bank descriptions', () => {
    const out = JSON.stringify(runTool('cerca_movimenti', JSON.stringify({ cerca: '', categoria: '', tipo: 'tutti', dal: '', al: '', limite: 50 }), ctx))
    expect(out).not.toMatch(/PAGAMENTO POS|ADDEBITO SDD|BONIFICO/)
    expect(out).toContain('Esselunga')
  })

  it('hides merchant names when asked to', () => {
    const out = JSON.stringify(runTool('spese_per_esercente', JSON.stringify({ dal: '2000-01-01', al: '2100-01-01', cerca: '', limite: 30 }), { ...ctx, shareMerchants: false }))
    expect(out).not.toContain('Esselunga')
    expect(out).toContain('Spesa')
  })

  it('category totals add up to the expenses of the same period', () => {
    const months = runTool('riepilogo_mensile', '{"mesi":12}', ctx) as { mese: string; uscite: number }[]
    const m = months[5]
    const [y, mo] = m.mese.split('-').map(Number)
    const last = new Date(Date.UTC(y, mo, 0)).getUTCDate()
    const cats = runTool('spese_per_categoria', JSON.stringify({ dal: `${m.mese}-01`, al: `${m.mese}-${last}` }), ctx) as { totale: number }[]
    expect(cats.reduce((a, c) => a + c.totale, 0)).toBeCloseTo(m.uscite, 1)
  })

  it('survives malformed arguments', () => {
    expect(runTool('cerca_movimenti', '{not json', ctx)).toEqual({ errore: 'Argomenti non validi' })
  })
})

describe('agent loop', () => {
  it('runs the requested tool locally, sends the result back and returns the answer', async () => {
    const bodies: { messages: { role: string; content: string | null }[] }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string)
        bodies.push(body)
        if (bodies.length === 1) {
          return reply({
            choices: [{ message: { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'ricorrenti', arguments: '{}' } }] } }],
          })
        }
        return reply({ choices: [{ message: { content: 'Hai **4 abbonamenti** digitali.' } }] })
      }),
    )
    const steps: string[] = []
    const turn = await ask(cfg, ctx, [], 'Quali abbonamenti ho?', (s) => steps.push(s))
    expect(turn.text).toBe('Hai **4 abbonamenti** digitali.')
    expect(steps).toEqual(['ricorrenti'])
    expect(turn.shared?.[0].tool).toBe('ricorrenti')
    const toolMsg = bodies[1].messages.find((m) => m.role === 'tool')!
    expect(toolMsg.content).toContain('Netflix')
    // the first request carries no figures at all: only instructions and the question
    expect(JSON.stringify(bodies[0].messages)).not.toMatch(/Netflix|Esselunga|2\.380/)
  })

  it('maps HTTP errors to readable messages', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply({ error: { message: 'Incorrect API key' } }, 401)))
    await expect(ask(cfg, ctx, [], 'ciao')).rejects.toThrow('La chiave API non è valida')
  })

  it('keeps only chat models when listing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply({ data: [{ id: 'text-embedding-3-small' }, { id: 'gpt-x-mini' }, { id: 'whisper-1' }, { id: 'gpt-x' }] })))
    expect(await listModels(cfg)).toEqual(['gpt-x', 'gpt-x-mini'])
  })

  it('category proposals ignore merchants that were not asked about', async () => {
    const txs = [{ ...demo.transactions[0], merchant: 'Ferramenta Rossi', category: 'altro' as const, amount: -12 }]
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: string, init: RequestInit) => {
        const sent = JSON.parse(init.body as string).messages[1].content
        expect(sent).toBe('[{"esercente":"Ferramenta Rossi","tipo":"uscita"}]')
        return reply({
          choices: [{ message: { content: JSON.stringify({ risultati: [{ esercente: 'Ferramenta Rossi', categoria: 'casa', sicurezza: 'alta' }, { esercente: 'Inventato', categoria: 'spesa', sicurezza: 'alta' }] }) } }],
        })
      }),
    )
    expect(await proposeCategories(cfg, txs)).toEqual([{ merchant: 'Ferramenta Rossi', category: 'casa', confidence: 'alta' }])
  })
})

describe('dashboard brief', () => {
  const answer = {
    titolo: 'Settembre sotto controllo',
    sintesi: 'Hai speso meno del solito.',
    punti: [
      { tono: 'warning', titolo: 'Delivery in crescita', testo: 'Ad agosto 181 €.', risparmio_mensile: 60, azione: 'movimenti' },
      { tono: 'strano', titolo: 'Tono sconosciuto', testo: 'x', risparmio_mensile: -5, azione: 'inventata' },
    ],
    domanda: 'Come riduco il delivery?',
  }

  it('sends computed figures only and maps the answer', async () => {
    let sent = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: string, init: RequestInit) => {
        sent = init.body as string
        return reply({ choices: [{ message: { content: JSON.stringify(answer) } }] })
      }),
    )
    const { brief, shared } = await generateBrief(cfg, ctx)
    expect(JSON.parse(sent).response_format.type).toBe('json_schema')
    expect(sent).not.toMatch(/PAGAMENTO POS|ADDEBITO SDD/)
    expect(shared.map((x) => x.tool)).toContain('segnali')
    expect(brief.title).toBe('Settembre sotto controllo')
    expect(brief.points[0]).toEqual({ tone: 'warning', title: 'Delivery in crescita', text: 'Ad agosto 181 €.', monthlySaving: 60, action: 'movimenti' })
    // unknown values are neutralised instead of breaking the card
    expect(brief.points[1]).toMatchObject({ tone: 'info', monthlySaving: null, action: null })
  })

  it('falls back to plain JSON when the model has no structured output', async () => {
    const bodies: Record<string, unknown>[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string)
        bodies.push(body)
        if (body.response_format) return reply({ error: { message: "Invalid parameter: 'response_format' of type 'json_schema' is not supported with this model." } }, 400)
        return reply({ choices: [{ message: { content: 'Ecco:\n```json\n' + JSON.stringify(answer) + '\n```' } }] })
      }),
    )
    const { brief } = await generateBrief(cfg, ctx)
    expect(bodies).toHaveLength(2)
    expect(bodies[1].response_format).toBeUndefined()
    expect(brief.question).toBe('Come riduco il delivery?')
  })

  it('fingerprint changes when the data changes, not otherwise', () => {
    const a = briefFingerprint(demo.transactions, 'x')
    expect(briefFingerprint(demo.transactions, 'x')).toBe(a)
    expect(briefFingerprint(demo.transactions.slice(1), 'x')).not.toBe(a)
  })

  it('parses JSON wrapped in prose', () => {
    expect(parseJson<{ a: number }>('Risposta: {"a": 1} fine')).toEqual({ a: 1 })
    expect(() => parseJson('niente json')).toThrow('formato')
  })
})

describe('category proposals sanity', () => {
  it('drops proposals that contradict the direction of the money', async () => {
    const base = demo.transactions[0]
    const txs = [
      { ...base, id: 'a', merchant: 'Mario Verdi', category: 'entrate' as const, amount: 35 },
      { ...base, id: 'b', merchant: 'Bottega Rossi', category: 'altro' as const, amount: -12 },
      { ...base, id: 'c', merchant: 'Ditta Neri', category: 'altro' as const, amount: -40 },
    ]
    vi.stubGlobal('fetch', vi.fn(async () => reply({ choices: [{ message: { content: JSON.stringify({ risultati: [
      { esercente: 'Mario Verdi', categoria: 'shopping', sicurezza: 'alta' },
      { esercente: 'Bottega Rossi', categoria: 'spesa', sicurezza: 'alta' },
      { esercente: 'Ditta Neri', categoria: 'stipendio', sicurezza: 'alta' },
    ] }) } }] })))
    expect(await proposeCategories(cfg, txs)).toEqual([{ merchant: 'Bottega Rossi', category: 'spesa', confidence: 'alta' }])
  })
})

describe('model choice and errors', () => {
  it('puts the newest plain GPT chat model first and drops models that cannot chat', () => {
    const ids = ['whisper-1', 'sora-2-pro', 'o4-mini-deep-research', 'gpt-5-pro', 'gpt-4o-mini', 'gpt-6.1-sol-2026-09-29', 'gpt-6.1-sol', 'gpt-6-luna', 'computer-use-preview', 'gpt-4.1', 'text-embedding-3-large']
    expect(rankModels(ids)).toEqual(['gpt-6.1-sol', 'gpt-6.1-sol-2026-09-29', 'gpt-6-luna', 'gpt-4.1', 'gpt-4o-mini'])
  })

  it('explains gateway timeouts instead of a bare server error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Task timed out after 10.01 seconds</html>', { status: 502 })))
    await expect(ask(cfg, ctx, [], 'ciao')).rejects.toThrow(/troppo.*mini/)
  })

  it('keeps the status and a text body in other server errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('upstream exploded', { status: 500 })))
    await expect(ask(cfg, ctx, [], 'ciao')).rejects.toThrow('(500). upstream exploded')
  })
})
