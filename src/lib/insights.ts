import {
  bucketSplit, categoryTotals, currentMonth, detectSubscriptions, forecastMonth, inMonth, isExpense,
  monthlyStats, weekdayProfile, type Subscription,
} from './analytics'
import { category } from './categories'
import { money, monthLabel, percent, shiftMonth, WEEKDAY_SHORT } from './format'
import type { Transaction } from './types'

export type Tone = 'good' | 'warning' | 'critical' | 'info'
export type View = 'home' | 'movimenti' | 'analisi' | 'abbonamenti' | 'budget' | 'importa' | 'collega' | 'impostazioni'

export interface Insight {
  id: string
  tone: Tone
  title: string
  body: string
  /** the headline figure, shown big next to the tip */
  figure?: string
  source?: { label: string; url?: string }
  action?: { label: string; to: View }
  /** higher = shown first */
  weight: number
}

const SRC_503020 = {
  label: 'E. Warren, A. Warren Tyagi, "All Your Worth", 2005',
  url: 'https://en.wikipedia.org/wiki/All_Your_Worth',
}
const SRC_EMERGENCY = {
  label: "Banca d'Italia, Economia per tutti: risparmiare e pianificare",
  url: 'https://economiapertutti.bancaditalia.it/notizie-e-rubriche/notizie/risparmiare-e-pianificare-l-importanza-della-prevenzione-per-far-fronte-agli-eventi-inattesi-della-vita-e-agli-shock-finanziari/',
}
const SRC_FEES = {
  label: "Banca d'Italia, portale Economia per tutti",
  url: 'https://economiapertutti.bancaditalia.it/',
}

export function buildInsights(txs: Transaction[], subs: Subscription[] = detectSubscriptions(txs)): Insight[] {
  if (!txs.length) return []
  const out: Insight[] = []
  const cur = currentMonth(txs)
  const stats = monthlyStats(txs, 12, cur)
  const complete = stats.slice(0, -1).filter((m) => m.income > 0 || m.expenses > 0)
  const last3 = complete.slice(-3)
  const avgIncome = last3.reduce((a, m) => a + m.income, 0) / Math.max(1, last3.length)
  const avgExpenses = last3.reduce((a, m) => a + m.expenses, 0) / Math.max(1, last3.length)

  // 1. Savings rate against the 20% of the 50/30/20 rule
  if (last3.length && avgIncome > 0) {
    const rate = (avgIncome - avgExpenses) / avgIncome
    const gap = avgIncome * 0.2 - (avgIncome - avgExpenses)
    out.push(
      rate >= 0.2
        ? {
            id: 'savings-rate', tone: 'good', weight: 70, figure: percent(rate),
            title: 'Stai risparmiando più del 20%',
            body: `Negli ultimi ${last3.length} mesi hai messo da parte in media ${money(avgIncome - avgExpenses, { round: true })} al mese. La regola 50/30/20 indica il 20% come soglia minima: sei sopra.`,
            source: SRC_503020, action: { label: 'Vedi la ripartizione', to: 'analisi' },
          }
        : {
            id: 'savings-rate', tone: rate < 0 ? 'critical' : 'warning', weight: 95, figure: percent(rate),
            title: rate < 0 ? 'Stai spendendo più di quanto guadagni' : 'Il risparmio è sotto il 20%',
            body: rate < 0
              ? `Negli ultimi ${last3.length} mesi le uscite hanno superato le entrate di ${money(-(avgIncome - avgExpenses), { round: true })} al mese. Parti dalle categorie in crescita qui sotto.`
              : `Per arrivare al 20% suggerito dalla regola 50/30/20 ti mancano circa ${money(gap, { round: true })} al mese.`,
            source: SRC_503020, action: { label: 'Imposta un budget', to: 'budget' },
          },
    )
  }

  // 2. Emergency fund: months of expenses covered by the known balance
  const essentials = last3.length
    ? inMonthRange(txs, shiftMonth(cur, -3), shiftMonth(cur, -1))
        .filter((t) => isExpense(t) && category(t.category).bucket === 'needs')
        .reduce((a, t) => a - t.amount, 0) / last3.length
    : 0
  if (essentials > 0) {
    out.push({
      id: 'emergency', tone: 'info', weight: 40, figure: money(essentials * 3, { round: true }),
      title: 'Il tuo fondo emergenza ideale',
      body: `Le tue spese essenziali valgono circa ${money(essentials, { round: true })} al mese. Un cuscinetto da 3 a 6 mesi significa tenere da parte tra ${money(essentials * 3, { round: true })} e ${money(essentials * 6, { round: true })}, su un conto separato e sempre disponibile.`,
      source: SRC_EMERGENCY,
    })
  }

  // 3. Subscriptions cost
  const subsOnly = subs.filter((s) => s.category === 'abbonamenti')
  if (subsOnly.length) {
    const yearly = subsOnly.reduce((a, s) => a + s.yearly, 0)
    out.push({
      id: 'subs', tone: subsOnly.length >= 4 ? 'warning' : 'info', weight: 80, figure: `${money(yearly, { round: true })}/anno`,
      title: `${subsOnly.length} abbonamenti digitali attivi`,
      body: `Tra ${subsOnly.slice(0, 3).map((s) => s.merchant).join(', ')}${subsOnly.length > 3 ? ' e altri' : ''} spendi ${money(yearly / 12, { round: true })} al mese. Controlla quali hai usato nelle ultime quattro settimane: gli altri si possono sospendere.`,
      action: { label: 'Rivedi gli abbonamenti', to: 'abbonamenti' },
    })
  }
  const raised = subs.filter((s) => s.priceChange && s.priceChange.to > s.priceChange.from)
  for (const s of raised.slice(0, 2)) {
    out.push({
      id: `price-${s.merchant}`, tone: 'warning', weight: 85,
      figure: `+${money(s.priceChange!.to - s.priceChange!.from)}`,
      title: `${s.merchant} ha aumentato il prezzo`,
      body: `L'ultimo addebito è stato ${money(s.priceChange!.to)} invece di ${money(s.priceChange!.from)}: fanno ${money((s.priceChange!.to - s.priceChange!.from) * (s.yearly / s.amount), { round: true })} in più all'anno.`,
      action: { label: 'Apri abbonamenti', to: 'abbonamenti' },
    })
  }

  // 4. Categories growing compared with their own 3-month average
  if (last3.length >= 2) {
    const thisMonth = categoryTotals(inMonth(txs, shiftMonth(cur, -1)))
    const before = categoryTotals(inMonthRange(txs, shiftMonth(cur, -4), shiftMonth(cur, -2)))
    const spikes = thisMonth
      .map((c) => {
        const prev = (before.find((b) => b.id === c.id)?.total ?? 0) / 3
        return { ...c, prev, delta: c.total - prev }
      })
      .filter((c) => c.prev > 20 && c.total > c.prev * 1.3 && c.delta > 40)
      .sort((a, b) => b.delta - a.delta)
    for (const s of spikes.slice(0, 2)) {
      out.push({
        id: `spike-${s.id}`, tone: 'warning', weight: 75, figure: `+${percent(s.total / s.prev - 1)}`,
        title: `${category(s.id).label}: più del solito`,
        body: `${inMonthPrefix(shiftMonth(cur, -1))} hai speso ${money(s.total, { round: true })}, contro una media di ${money(s.prev, { round: true })} nei tre mesi precedenti.`,
        action: { label: 'Vedi i movimenti', to: 'movimenti' },
      })
    }
    const drops = thisMonth
      .map((c) => ({ ...c, prev: (before.find((b) => b.id === c.id)?.total ?? 0) / 3 }))
      .filter((c) => c.prev > 50 && c.total < c.prev * 0.75)
      .sort((a, b) => b.prev - b.total - (a.prev - a.total))
    if (drops[0]) {
      out.push({
        id: `drop-${drops[0].id}`, tone: 'good', weight: 50, figure: `−${money(drops[0].prev - drops[0].total, { round: true })}`,
        title: `Ottimo lavoro su ${category(drops[0].id).label.toLowerCase()}`,
        body: `Il mese scorso hai speso ${money(drops[0].total, { round: true })} contro una media di ${money(drops[0].prev, { round: true })}. Se tieni questo ritmo sono ${money((drops[0].prev - drops[0].total) * 12, { round: true })} in un anno.`,
      })
    }
  }

  // 5. Delivery vs groceries
  const last90 = inMonthRange(txs, shiftMonth(cur, -3), shiftMonth(cur, -1))
  const totals = categoryTotals(last90)
  const delivery = totals.find((c) => c.id === 'delivery')
  if (delivery && delivery.total > 60) {
    out.push({
      id: 'delivery', tone: 'info', weight: 55, figure: money(delivery.total / 3, { round: true }),
      title: 'Il food delivery pesa',
      body: `In media ${money(delivery.total / 3, { round: true })} al mese in ${Math.round(delivery.count / 3)} ordini. Dimezzarli vale circa ${money((delivery.total / 3 / 2) * 12, { round: true })} l'anno. Controlla nello scontrino quanto pesano consegna e costi di servizio.`,
    })
  }

  // 6. Bank fees
  const fees = totals.find((c) => c.id === 'commissioni')
  if (fees && fees.total > 5) {
    out.push({
      id: 'fees', tone: (fees.total / 3) * 12 > 60 ? 'warning' : 'info', weight: (fees.total / 3) * 12 > 60 ? 60 : 20, figure: `${money((fees.total / 3) * 12, { round: true })}/anno`,
      title: 'Stai pagando commissioni bancarie',
      body: `Canoni e commissioni ti costano circa ${money(fees.total / 3)} al mese. Confronta l'ISC (Indicatore sintetico di costo) del tuo conto con quello di altri conti a canone zero.`,
      source: SRC_FEES,
    })
  }

  // 7. Cash withdrawals hide where money goes
  const cash = totals.find((c) => c.id === 'contanti')
  const spent90 = totals.reduce((a, c) => a + c.total, 0)
  if (cash && spent90 > 0 && cash.total / spent90 > 0.08) {
    out.push({
      id: 'cash', tone: 'info', weight: 35, figure: percent(cash.total / spent90),
      title: 'Una parte delle spese è invisibile',
      body: `Il ${percent(cash.total / spent90)} delle uscite sono prelievi in contanti: Finny non può sapere in cosa li hai spesi. Pagare con carta rende le categorie più precise.`,
    })
  }

  // 8. Weekend profile
  const profile = weekdayProfile(last90)
  const weekend = profile[0] + profile[6] + profile[5]
  const weekTotal = profile.reduce((a, v) => a + v, 0)
  if (weekTotal > 0 && weekend / weekTotal > 0.55) {
    const top = profile.indexOf(Math.max(...profile))
    out.push({
      id: 'weekend', tone: 'info', weight: 30, figure: percent(weekend / weekTotal),
      title: 'Il weekend è il momento più caro',
      body: `Da venerdì a domenica fai il ${percent(weekend / weekTotal)} delle spese variabili, con il picco di ${WEEKDAY_SHORT[top]}. Decidere un tetto per il weekend è il modo più rapido per contenerle.`,
    })
  }

  // 9. Month-end forecast
  const fc = forecastMonth(txs, subs, cur)
  if (fc.isCurrent && fc.dayIdx >= 5 && avgExpenses > 0) {
    const over = fc.projected - avgExpenses
    out.push({
      id: 'forecast', tone: over > avgExpenses * 0.1 ? 'warning' : 'good', weight: over > 0 ? 88 : 45,
      figure: money(fc.projected, { round: true }),
      title: over > avgExpenses * 0.1 ? 'Questo mese chiuderai sopra la media' : 'Il mese è sotto controllo',
      body: `Al ritmo attuale arriverai a fine mese con circa ${money(fc.projected, { round: true })} di uscite (media: ${money(avgExpenses, { round: true })}).${fc.due > 0 ? ` Mancano ancora ${money(fc.due, { round: true })} di addebiti ricorrenti.` : ''}`,
      action: { label: 'Vedi il budget', to: 'budget' },
    })
  }

  // 10. 50/30/20 split
  const split = bucketSplit(last90)
  if (split.income > 0) {
    const wantsShare = split.wants / split.income
    if (wantsShare > 0.35) {
      out.push({
        id: 'wants', tone: 'warning', weight: 65, figure: percent(wantsShare),
        title: 'I desideri superano il 30%',
        body: `Ristoranti, shopping, svago e simili valgono il ${percent(wantsShare)} delle entrate. La regola 50/30/20 suggerisce di restare intorno al 30%.`,
        source: SRC_503020, action: { label: 'Apri analisi', to: 'analisi' },
      })
    }
  }

  // 11. Biggest single expense of last month
  const lastMonthTx = inMonth(txs, shiftMonth(cur, -1)).filter(isExpense)
  const biggest = lastMonthTx.sort((a, b) => a.amount - b.amount)[0]
  if (biggest && -biggest.amount > avgExpenses * 0.25) {
    out.push({
      id: 'biggest', tone: 'info', weight: 25, figure: money(-biggest.amount, { round: true }),
      title: 'La spesa più grande del mese scorso',
      body: `${biggest.merchant}, il ${Number(biggest.date.slice(8))} ${monthLabel(biggest.date.slice(0, 7), true)}. Da sola vale il ${percent(-biggest.amount / avgExpenses)} delle uscite medie mensili.`,
    })
  }

  return out.sort((a, b) => b.weight - a.weight)
}

/** "A settembre", "Ad agosto" */
function inMonthPrefix(key: string) {
  const label = monthLabel(key, true).split(' ')[0]
  return `${/^[aeiou]/.test(label) ? 'Ad' : 'A'} ${label}`
}

function inMonthRange(txs: Transaction[], fromKey: string, toKey: string) {
  return txs.filter((t) => {
    const k = t.date.slice(0, 7)
    return k >= fromKey && k <= toKey
  })
}
