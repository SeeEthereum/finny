import { CATEGORIES } from '../categories'
import type { CategoryId, Transaction } from '../types'
import { AiError, chat, type AiConfig, type ChatMessage } from './client'
import { contextPrimer, runTool, TOOLS, type ToolContext } from './tools'

/** One entry per piece of data that left the device during an answer */
export interface SharedData {
  tool: string
  args: Record<string, unknown>
  result: string
}

export interface Turn {
  role: 'user' | 'assistant'
  text: string
  shared?: SharedData[]
}

const MAX_ROUNDS = 6

function instructions(ctx: ToolContext) {
  const p = contextPrimer(ctx.transactions)
  return [
    'Sei la "vocina" di Finny, l’assistente di finanza personale dell’utente. Rispondi sempre in italiano, con tono diretto e concreto.',
    'Per qualsiasi numero usa gli strumenti: non inventare cifre e non stimare ciò che puoi chiedere. Fai i conti solo sui dati restituiti e dichiara il periodo a cui si riferiscono.',
    'Gli importi sono in euro. Nelle uscite gli strumenti restituiscono valori positivi; nei singoli movimenti il segno meno indica un’uscita.',
    'Se un dato non c’è (per esempio un mese non importato), dillo invece di supporre.',
    'Dai consigli pratici e quantificati. Non sei un consulente finanziario: per investimenti, tasse o debiti importanti suggerisci di sentire un professionista.',
    'Formato: frasi brevi, elenchi puntati con "- " quando servono, cifre importanti in **grassetto**. Niente tabelle, niente titoli.',
    `Oggi è ${p.oggi}. I dati vanno dal ${p.dati_dal} al ${p.dati_al} (${p.movimenti} movimenti).`,
    `Categorie (id e nome): ${p.categorie}.`,
  ].join('\n')
}

export async function ask(
  cfg: AiConfig,
  ctx: ToolContext,
  history: Turn[],
  question: string,
  onStep?: (tool: string) => void,
  signal?: AbortSignal,
): Promise<Turn> {
  const messages: ChatMessage[] = [
    { role: 'system', content: instructions(ctx) },
    ...history.slice(-10).map((t) => ({ role: t.role, content: t.text }) as ChatMessage),
    { role: 'user', content: question },
  ]
  const shared: SharedData[] = []
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await chat(cfg, messages, { tools: TOOLS, signal })
    if (!res.toolCalls.length) {
      return { role: 'assistant', text: res.content?.trim() || 'Non ho una risposta per questa domanda.', shared }
    }
    messages.push({ role: 'assistant', content: res.content, tool_calls: res.toolCalls })
    for (const call of res.toolCalls) {
      onStep?.(call.function.name)
      const output = JSON.stringify(runTool(call.function.name, call.function.arguments, ctx))
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(call.function.arguments || '{}')
      } catch {
        /* shown as empty */
      }
      shared.push({ tool: call.function.name, args, result: output })
      messages.push({ role: 'tool', tool_call_id: call.id, content: output })
    }
  }
  throw new AiError('format', 'Il modello ha chiesto troppi dati senza arrivare a una risposta. Prova a fare una domanda più precisa.')
}

export interface CategoryProposal {
  merchant: string
  category: CategoryId
  confidence: 'alta' | 'media' | 'bassa'
}

/**
 * Suggests a category for merchants Finny filed under "Altro".
 * Only the cleaned merchant names and whether money came in or out are sent.
 */
export async function proposeCategories(cfg: AiConfig, txs: Transaction[], signal?: AbortSignal): Promise<CategoryProposal[]> {
  const seen = new Map<string, 'entrata' | 'uscita'>()
  for (const t of txs) if (t.category === 'altro' || t.category === 'entrate') seen.set(t.merchant, t.amount > 0 ? 'entrata' : 'uscita')
  const items = [...seen.entries()].slice(0, 80).map(([esercente, tipo]) => ({ esercente, tipo }))
  if (!items.length) return []
  const ids = CATEGORIES.map((c) => c.id)
  const res = await chat(
    cfg,
    [
      {
        role: 'system',
        content: `Classifichi esercenti italiani da estratti conto. Per ciascuno scegli la categoria più probabile tra: ${CATEGORIES.map((c) => `${c.id} (${c.label})`).join(', ')}. Le entrate vanno in stipendio, entrate, rimborsi o trasferimenti. Se non sei ragionevolmente sicuro usa "altro" con sicurezza "bassa". Riporta il nome dell'esercente esattamente come ricevuto.`,
      },
      { role: 'user', content: JSON.stringify(items) },
    ],
    {
      signal,
      schema: {
        name: 'categorie',
        schema: {
          type: 'object',
          properties: {
            risultati: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  esercente: { type: 'string' },
                  categoria: { type: 'string', enum: ids },
                  sicurezza: { type: 'string', enum: ['alta', 'media', 'bassa'] },
                },
                required: ['esercente', 'categoria', 'sicurezza'],
                additionalProperties: false,
              },
            },
          },
          required: ['risultati'],
          additionalProperties: false,
        },
      },
    },
  )
  let parsed: { risultati?: { esercente: string; categoria: string; sicurezza: string }[] }
  try {
    parsed = JSON.parse(res.content ?? '{}')
  } catch {
    throw new AiError('format', 'Il modello non ha restituito un elenco leggibile.')
  }
  return (parsed.risultati ?? [])
    .filter((r) => seen.has(r.esercente) && ids.includes(r.categoria as CategoryId) && r.categoria !== 'altro')
    .map((r) => ({ merchant: r.esercente, category: r.categoria as CategoryId, confidence: (r.sicurezza as CategoryProposal['confidence']) ?? 'media' }))
}
