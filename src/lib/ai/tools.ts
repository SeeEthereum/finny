import { categoryTotals, currentMonth, detectSubscriptions, inMonth, isExpense, isIncome, monthlyStats } from '../analytics'
import { CATEGORIES, category } from '../categories'
import { normalize } from '../categorize'
import type { Account, Budgets, CategoryId, Transaction } from '../types'
import type { ToolDef } from './client'

/**
 * Functions the model can ask Finny to run. They execute in the browser on the local data
 * and return only aggregates or cleaned rows: never the raw bank description, IBANs or account names.
 */

export interface ToolContext {
  transactions: Transaction[]
  accounts: Account[]
  budgets: Budgets
  /** when false, merchant names are replaced by their category */
  shareMerchants: boolean
}

const r2 = (n: number) => Math.round(n * 100) / 100
const ISO = { type: 'string', description: 'Data ISO aaaa-mm-gg' }
const CAT_IDS = CATEGORIES.map((c) => c.id)

export const TOOL_LABELS: Record<string, string> = {
  riepilogo_mensile: 'Riepilogo mensile di entrate e uscite',
  spese_per_categoria: 'Spese per categoria',
  spese_per_esercente: 'Spese per esercente',
  cerca_movimenti: 'Movimenti filtrati',
  ricorrenti: 'Addebiti ricorrenti',
  budget: 'Budget del mese',
  saldo: 'Saldo totale',
}

export const TOOLS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'riepilogo_mensile',
      description: 'Entrate, uscite, risparmio e tasso di risparmio per ciascuno degli ultimi N mesi (il mese più recente può essere in corso).',
      parameters: { type: 'object', properties: { mesi: { type: 'integer', minimum: 1, maximum: 24 } }, required: ['mesi'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'spese_per_categoria',
      description: 'Totale delle uscite per categoria in un intervallo di date, dalla più alta alla più bassa. Esclude giroconti e risparmio.',
      parameters: { type: 'object', properties: { dal: ISO, al: ISO }, required: ['dal', 'al'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'spese_per_esercente',
      description: 'Totale delle uscite per esercente in un intervallo di date. "cerca" filtra per nome (vuoto = tutti).',
      parameters: {
        type: 'object',
        properties: { dal: ISO, al: ISO, cerca: { type: 'string' }, limite: { type: 'integer', minimum: 1, maximum: 30 } },
        required: ['dal', 'al', 'cerca', 'limite'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cerca_movimenti',
      description: 'Elenco di singoli movimenti filtrati (max 50), con il totale e il numero di risultati. Usare stringa vuota per i filtri non necessari.',
      parameters: {
        type: 'object',
        properties: {
          cerca: { type: 'string', description: 'testo da cercare in esercente o categoria' },
          categoria: { type: 'string', enum: ['', ...CAT_IDS] },
          tipo: { type: 'string', enum: ['tutti', 'entrate', 'uscite'] },
          dal: { type: 'string', description: 'Data ISO o stringa vuota' },
          al: { type: 'string', description: 'Data ISO o stringa vuota' },
          limite: { type: 'integer', minimum: 1, maximum: 50 },
        },
        required: ['cerca', 'categoria', 'tipo', 'dal', 'al', 'limite'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ricorrenti',
      description: 'Abbonamenti e spese ricorrenti rilevati: importo, cadenza, costo annuo, prossimo addebito, eventuali rincari.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'budget',
      description: 'Budget mensili impostati dall’utente e quanto è già stato speso nel mese corrente per ciascuno.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'saldo',
      description: 'Saldo totale dei conti, se l’estratto conto lo riportava, con la data a cui si riferisce.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
]

function inRange(t: Transaction, dal?: string, al?: string) {
  return (!dal || t.date >= dal) && (!al || t.date <= al)
}

export function runTool(name: string, rawArgs: string, ctx: ToolContext): unknown {
  let args: Record<string, unknown> = {}
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {}
  } catch {
    return { errore: 'Argomenti non validi' }
  }
  const txs = ctx.transactions
  const who = (t: Transaction) => (ctx.shareMerchants ? t.merchant : category(t.category).label)
  const str = (k: string) => (typeof args[k] === 'string' ? (args[k] as string) : '')
  const num = (k: string, d: number, max: number) => Math.min(max, Math.max(1, Number(args[k]) || d))

  switch (name) {
    case 'riepilogo_mensile':
      return monthlyStats(txs, num('mesi', 6, 24)).map((m) => ({
        mese: m.key,
        entrate: r2(m.income),
        uscite: r2(m.expenses),
        risparmio: r2(m.net),
        tasso_risparmio: m.income ? r2(m.savingsRate) : null,
      }))
    case 'spese_per_categoria':
      return categoryTotals(txs.filter((t) => inRange(t, str('dal'), str('al')))).map((c) => ({
        categoria: category(c.id).label,
        id: c.id,
        totale: r2(c.total),
        movimenti: c.count,
      }))
    case 'spese_per_esercente': {
      const q = normalize(str('cerca'))
      const map = new Map<string, { esercente: string; categoria: string; totale: number; movimenti: number }>()
      for (const t of txs) {
        if (!isExpense(t) || !inRange(t, str('dal'), str('al'))) continue
        const name = who(t)
        if (q && !normalize(name).includes(q)) continue
        const e = map.get(name) ?? { esercente: name, categoria: category(t.category).label, totale: 0, movimenti: 0 }
        e.totale += -t.amount
        e.movimenti++
        map.set(name, e)
      }
      return [...map.values()].sort((a, b) => b.totale - a.totale).slice(0, num('limite', 10, 30)).map((e) => ({ ...e, totale: r2(e.totale) }))
    }
    case 'cerca_movimenti': {
      const q = normalize(str('cerca'))
      const cat = str('categoria') as CategoryId | ''
      const tipo = str('tipo') || 'tutti'
      const found = txs.filter((t) => {
        if (!inRange(t, str('dal'), str('al'))) return false
        if (cat && t.category !== cat) return false
        if (tipo === 'entrate' && !isIncome(t)) return false
        if (tipo === 'uscite' && !isExpense(t)) return false
        if (q && !normalize(`${who(t)} ${category(t.category).label}`).includes(q)) return false
        return true
      })
      return {
        trovati: found.length,
        totale: r2(found.reduce((a, t) => a + t.amount, 0)),
        movimenti: found.slice(0, num('limite', 20, 50)).map((t) => ({ data: t.date, esercente: who(t), categoria: category(t.category).label, importo: t.amount })),
      }
    }
    case 'ricorrenti':
      return detectSubscriptions(txs).map((s) => ({
        esercente: ctx.shareMerchants ? s.merchant : category(s.category).label,
        categoria: category(s.category).label,
        importo: r2(s.amount),
        cadenza: s.cadence,
        costo_annuo: r2(s.yearly),
        prossimo: s.next,
        rincaro: s.priceChange ? { da: s.priceChange.from, a: s.priceChange.to } : null,
      }))
    case 'budget': {
      const cur = currentMonth(txs)
      const spent = Object.fromEntries(categoryTotals(inMonth(txs, cur)).map((c) => [c.id, c.total]))
      return {
        mese: cur,
        budget: (Object.entries(ctx.budgets) as [CategoryId, number][]).map(([c, v]) => ({ categoria: category(c).label, budget: v, speso: r2(spent[c] ?? 0) })),
      }
    }
    case 'saldo': {
      const known = ctx.accounts.filter((a) => a.balance)
      if (!known.length) return { saldo: null, nota: 'Gli estratti conto importati non riportavano il saldo.' }
      return {
        saldo: r2(known.reduce((a, acc) => a + acc.balance!.amount, 0)),
        conti: known.length,
        aggiornato_al: known.map((a) => a.balance!.date).sort().pop(),
      }
    }
    default:
      return { errore: `Strumento sconosciuto: ${name}` }
  }
}

/** What the model knows up front: dates and vocabulary, no figures */
export function contextPrimer(txs: Transaction[]) {
  const dates = txs.map((t) => t.date).sort()
  return {
    oggi: new Date().toISOString().slice(0, 10),
    dati_dal: dates[0] ?? null,
    dati_al: dates[dates.length - 1] ?? null,
    movimenti: txs.length,
    categorie: CATEGORIES.map((c) => `${c.id} (${c.label})`).join(', '),
  }
}
