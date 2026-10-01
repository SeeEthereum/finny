import { currentMonth, detectSubscriptions } from '../analytics'
import { daysInMonth, shiftMonth } from '../format'
import { buildInsights, type Tone, type View } from '../insights'
import type { Transaction } from '../types'
import { chat, parseJson, type AiConfig } from './client'
import type { SharedData } from './agent'
import { runTool, type ToolContext } from './tools'

/**
 * The AI "brief" on the dashboard. Figures are computed here, locally; the model only reads
 * them and writes the interpretation. It never sees single movements or bank descriptions.
 */

export interface BriefPoint {
  tone: Tone
  title: string
  text: string
  /** monthly saving the model estimates for following the advice, from the numbers it was given */
  monthlySaving: number | null
  action: View | null
}

export interface Brief {
  title: string
  summary: string
  points: BriefPoint[]
  question: string
}

export interface StoredBrief {
  fingerprint: string
  model: string
  createdAt: string
  brief: Brief
  shared: SharedData[]
}

const ACTIONS = ['movimenti', 'analisi', 'abbonamenti', 'budget', 'nessuna'] as const

const SCHEMA = {
  type: 'object',
  properties: {
    titolo: { type: 'string', description: 'Al massimo 60 caratteri' },
    sintesi: { type: 'string', description: '2-3 frasi sullo stato del mese' },
    punti: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tono: { type: 'string', enum: ['good', 'warning', 'critical', 'info'] },
          titolo: { type: 'string' },
          testo: { type: 'string' },
          risparmio_mensile: { type: ['number', 'null'] },
          azione: { type: 'string', enum: [...ACTIONS] },
        },
        required: ['tono', 'titolo', 'testo', 'risparmio_mensile', 'azione'],
        additionalProperties: false,
      },
    },
    domanda: { type: 'string', description: 'Una domanda che l’utente potrebbe farti per approfondire' },
  },
  required: ['titolo', 'sintesi', 'punti', 'domanda'],
  additionalProperties: false,
}

function monthRange(key: string) {
  return { dal: `${key}-01`, al: `${key}-${String(daysInMonth(key)).padStart(2, '0')}` }
}

/** The figures sent to the model, each labelled like a tool call so the user can inspect them */
export function briefData(ctx: ToolContext): SharedData[] {
  const cur = currentMonth(ctx.transactions)
  const last = shiftMonth(cur, -1)
  const call = (tool: string, args: Record<string, unknown>) => ({ tool, args, result: JSON.stringify(runTool(tool, JSON.stringify(args), ctx)) })
  const before = { dal: monthRange(shiftMonth(cur, -4)).dal, al: monthRange(shiftMonth(cur, -2)).al }
  const subs = detectSubscriptions(ctx.transactions)
  const signals = buildInsights(ctx.transactions, subs).map((i) => `${i.title}${i.figure ? ` (${i.figure})` : ''}`)
  return [
    call('riepilogo_mensile', { mesi: 6 }),
    call('spese_per_categoria', monthRange(cur)),
    call('spese_per_categoria', monthRange(last)),
    call('spese_per_categoria', before),
    call('spese_per_esercente', { ...monthRange(last), cerca: '', limite: 10 }),
    call('ricorrenti', {}),
    call('budget', {}),
    call('saldo', {}),
    { tool: 'segnali', args: {}, result: JSON.stringify(signals) },
  ]
}

/** Changes whenever the data the brief is based on changes */
export function briefFingerprint(txs: Transaction[], extra: string) {
  let sum = 0
  let lastDate = ''
  for (const t of txs) {
    sum += t.amount
    if (t.date > lastDate) lastDate = t.date
  }
  return `${txs.length}|${lastDate}|${sum.toFixed(2)}|${txs.filter((t) => t.manualCategory).length}|${extra}`
}

export async function generateBrief(cfg: AiConfig, ctx: ToolContext, signal?: AbortSignal): Promise<{ brief: Brief; shared: SharedData[] }> {
  const shared = briefData(ctx)
  const cur = currentMonth(ctx.transactions)
  const res = await chat(
    cfg,
    [
      {
        role: 'system',
        content: [
          'Sei la "vocina" di Finny e prepari il punto della situazione finanziaria per la dashboard. Scrivi in italiano, diretto e concreto, dando del tu.',
          'Usa SOLO le cifre presenti nei dati: non inventare numeri, non fare stime che i dati non permettono. Se citi una cifra, deve comparire nei dati o essere una semplice differenza tra due di esse.',
          `Il mese corrente (${cur}) può essere ancora in corso: confrontalo con cautela.`,
          'Scrivi da 3 a 5 punti, il più importante per primo. Ogni punto: un fatto preciso e cosa fare. "risparmio_mensile" solo se puoi stimarlo dai dati, altrimenti null.',
          '"Pagamenti a persone" sono bonifici a privati: non trattarli come spese superflue, potrebbero essere rimborsi o spese condivise. "Giroconti" sono spostamenti tra i conti dell’utente.',
          'Tono: good = va bene, warning = da tenere d’occhio, critical = problema serio, info = consiglio. Non sei un consulente finanziario.',
          'Scrivi gli importi all’italiana e arrotondati all’euro: 1.511 €, non 1511.37 €.',
        ].join('\n'),
      },
      { role: 'user', content: JSON.stringify(Object.fromEntries(shared.map((s, i) => [`${i + 1}_${s.tool}`, { parametri: s.args, dati: JSON.parse(s.result) }]))) },
    ],
    { schema: { name: 'punto_del_mese', schema: SCHEMA }, signal },
  )
  const raw = parseJson<{ titolo?: string; sintesi?: string; punti?: Record<string, unknown>[]; domanda?: string }>(res.content)
  const brief: Brief = {
    title: String(raw.titolo ?? 'Il punto del mese').slice(0, 90),
    summary: String(raw.sintesi ?? ''),
    question: String(raw.domanda ?? ''),
    points: (raw.punti ?? []).slice(0, 5).map((p) => ({
      tone: (['good', 'warning', 'critical', 'info'].includes(String(p.tono)) ? p.tono : 'info') as Tone,
      title: String(p.titolo ?? ''),
      text: String(p.testo ?? ''),
      monthlySaving: typeof p.risparmio_mensile === 'number' && p.risparmio_mensile > 0 ? p.risparmio_mensile : null,
      action: (ACTIONS as readonly string[]).includes(String(p.azione)) && p.azione !== 'nessuna' ? (p.azione as View) : null,
    })),
  }
  return { brief, shared }
}
