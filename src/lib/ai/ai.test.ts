import { afterEach, describe, expect, it, vi } from 'vitest'
import { demoSnapshot } from '../demo'
import { ask, proposeCategories } from './agent'
import { listModels } from './client'
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
    expect(await listModels(cfg)).toEqual(['gpt-x-mini', 'gpt-x'])
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
