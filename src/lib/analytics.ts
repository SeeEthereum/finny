import { category, isIncomeCategory, isNeutral, type Bucket } from './categories'
import { daysBetween, daysInMonth, monthKey, shiftDays, shiftMonth, todayISO, weekday } from './format'
import type { CategoryId, Transaction } from './types'

export interface MonthStat {
  key: string
  income: number
  expenses: number
  net: number
  savingsRate: number
}

/** Money that really came in or went out (giroconti between your own accounts don't count). */
export function isIncome(t: Transaction) {
  return t.amount > 0 && !isNeutral(t.category) && t.category !== 'investimenti'
}
export function isExpense(t: Transaction) {
  return t.amount < 0 && !isNeutral(t.category) && !isIncomeCategory(t.category) && !isSaving(t)
}
/** Money moved into savings or investments: it leaves the account but it isn't spent. */
export function isSaving(t: Transaction) {
  return t.amount < 0 && category(t.category).bucket === 'savings'
}

export function sum(list: Transaction[]) {
  return list.reduce((a, t) => a + t.amount, 0)
}

export function lastDate(txs: Transaction[]) {
  return txs.reduce((a, t) => (t.date > a ? t.date : a), '')
}

/** The month the data is "about": the latest month with data, never in the future. */
export function currentMonth(txs: Transaction[]) {
  const last = lastDate(txs)
  const today = todayISO()
  return monthKey(last && last < today ? last : today)
}

export function monthlyStats(txs: Transaction[], months = 12, endKey = currentMonth(txs)): MonthStat[] {
  const keys = Array.from({ length: months }, (_, i) => shiftMonth(endKey, i - months + 1))
  const map = new Map(keys.map((k) => [k, { key: k, income: 0, expenses: 0, net: 0, savingsRate: 0 }]))
  for (const t of txs) {
    const m = map.get(monthKey(t.date))
    if (!m) continue
    if (isIncome(t)) m.income += t.amount
    else if (isExpense(t)) m.expenses += -t.amount
  }
  for (const m of map.values()) {
    m.net = m.income - m.expenses
    m.savingsRate = m.income > 0 ? m.net / m.income : 0
  }
  return keys.map((k) => map.get(k)!)
}

export function inRange(txs: Transaction[], from: string, to: string) {
  return txs.filter((t) => t.date >= from && t.date <= to)
}

export function inMonth(txs: Transaction[], key: string) {
  return txs.filter((t) => monthKey(t.date) === key)
}

export interface CategoryTotal {
  id: CategoryId
  total: number
  count: number
  share: number
}

export function categoryTotals(txs: Transaction[]): CategoryTotal[] {
  const map = new Map<CategoryId, { total: number; count: number }>()
  let all = 0
  for (const t of txs) {
    if (!isExpense(t)) continue
    const e = map.get(t.category) ?? { total: 0, count: 0 }
    e.total += -t.amount
    e.count++
    all += -t.amount
    map.set(t.category, e)
  }
  return [...map.entries()]
    .map(([id, e]) => ({ id, ...e, share: all ? e.total / all : 0 }))
    .sort((a, b) => b.total - a.total)
}

export function bucketSplit(txs: Transaction[]) {
  const out: Record<'needs' | 'wants' | 'savings', number> = { needs: 0, wants: 0, savings: 0 }
  let income = 0
  for (const t of txs) {
    if (isIncome(t)) income += t.amount
    const b: Bucket = category(t.category).bucket
    if (t.amount < 0 && (b === 'needs' || b === 'wants' || b === 'savings')) out[b] += -t.amount
  }
  const spent = out.needs + out.wants
  // whatever you didn't spend is also saved, even if it never left the account
  const saved = Math.max(0, income - spent)
  return { ...out, savings: Math.max(out.savings, saved), income }
}

export interface MerchantTotal {
  merchant: string
  total: number
  count: number
  category: CategoryId
}

export function topMerchants(txs: Transaction[], limit = 6): MerchantTotal[] {
  const map = new Map<string, MerchantTotal>()
  for (const t of txs) {
    if (!isExpense(t)) continue
    const e = map.get(t.merchant) ?? { merchant: t.merchant, total: 0, count: 0, category: t.category }
    e.total += -t.amount
    e.count++
    map.set(t.merchant, e)
  }
  return [...map.values()].sort((a, b) => b.total - a.total).slice(0, limit)
}

/** Average spend by weekday (0 = Sunday) over the given period */
export function weekdayProfile(txs: Transaction[]) {
  const totals = Array(7).fill(0)
  const days = new Set<string>()
  for (const t of txs) {
    days.add(t.date)
    if (isExpense(t) && !['casa', 'bollette', 'telefonia', 'abbonamenti', 'tasse', 'commissioni'].includes(t.category)) {
      totals[weekday(t.date)] += -t.amount
    }
  }
  if (!txs.length) return totals
  const dates = [...days].sort()
  const span = Math.max(7, daysBetween(dates[0], dates[dates.length - 1]) + 1)
  const weeks = span / 7
  return totals.map((v) => v / weeks)
}

/** Daily spending for a month, cumulative, used for the month-pace chart */
export function monthPace(txs: Transaction[], key: string) {
  const n = daysInMonth(key)
  const daily = Array(n).fill(0)
  for (const t of inMonth(txs, key)) {
    if (isExpense(t)) daily[Number(t.date.slice(8, 10)) - 1] += -t.amount
  }
  let acc = 0
  return daily.map((v) => (acc += v))
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

export type Cadence = 'settimanale' | 'mensile' | 'bimestrale' | 'trimestrale' | 'annuale'

export interface Subscription {
  merchant: string
  category: CategoryId
  amount: number
  cadence: Cadence
  yearly: number
  last: string
  next: string
  count: number
  history: { date: string; amount: number }[]
  priceChange?: { from: number; to: number }
}

const CADENCES: { name: Cadence; min: number; max: number; perYear: number }[] = [
  { name: 'settimanale', min: 6, max: 8, perYear: 52 },
  { name: 'mensile', min: 26, max: 35, perYear: 12 },
  { name: 'bimestrale', min: 55, max: 66, perYear: 6 },
  { name: 'trimestrale', min: 85, max: 97, perYear: 4 },
  { name: 'annuale', min: 350, max: 380, perYear: 1 },
]

function nextAfter(from: string, gap: number, today: string) {
  let next = shiftDays(from, gap)
  while (next <= today) next = shiftDays(next, gap)
  return next
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * A charge is recurring when the same merchant bills a similar amount
 * (±20% of the median) at a steady interval. Rent, bills and gym count too.
 */
export function detectSubscriptions(txs: Transaction[]): Subscription[] {
  const groups = new Map<string, Transaction[]>()
  for (const t of txs) {
    if (!(isExpense(t) || isSaving(t)) || ['spesa', 'ristoranti', 'delivery', 'contanti', 'auto', 'shopping'].includes(t.category)) continue
    const key = t.merchant.toLowerCase()
    groups.set(key, [...(groups.get(key) ?? []), t])
  }
  const today = todayISO()
  const out: Subscription[] = []
  for (const list of groups.values()) {
    if (list.length < 2) continue
    list.sort((a, b) => a.date.localeCompare(b.date))
    const amounts = list.map((t) => -t.amount)
    const med = median(amounts)
    // utility bills swing with consumption, everything else should bill the same amount
    const tolerance = list[0].category === 'bollette' ? 0.5 : 0.2
    const steady = list.filter((t) => Math.abs(-t.amount - med) <= med * tolerance)
    if (steady.length < 2) continue
    const gaps = steady.slice(1).map((t, i) => daysBetween(steady[i].date, t.date))
    const gap = median(gaps)
    const cadence = CADENCES.find((c) => gap >= c.min && gap <= c.max)
    if (!cadence) continue
    const regular = gaps.filter((g) => g >= cadence.min && g <= cadence.max).length / gaps.length
    // two hits are enough for yearly plans and known subscription services, otherwise three
    const minCount = cadence.name === 'annuale' || list[0].category === 'abbonamenti' ? 2 : 3
    if (regular < 0.7 || steady.length < minCount) continue
    const last = list[list.length - 1]
    // stale: nothing billed for 2+ cycles means it was probably cancelled
    if (daysBetween(last.date, today) > gap * 2.2 + 5) continue
    // most recent charge that differs from today's price, if it's from the last 6 months
    const lastPrice = -last.amount
    const before = [...steady].reverse().find((t) => Math.abs(-t.amount - lastPrice) >= 0.5)
    const changedAfter = before ? steady[steady.indexOf(before) + 1] : undefined
    const prev = before && changedAfter && daysBetween(changedAfter.date, today) <= 185 ? -before.amount : lastPrice
    out.push({
      merchant: last.merchant,
      category: last.category,
      amount: -last.amount,
      cadence: cadence.name,
      yearly: -last.amount * cadence.perYear,
      last: last.date,
      next: nextAfter(last.date, Math.round(gap), today),
      count: steady.length,
      history: steady.map((t) => ({ date: t.date, amount: -t.amount })),
      priceChange: Math.abs(prev - -last.amount) >= 0.5 ? { from: prev, to: -last.amount } : undefined,
    })
  }
  return out.sort((a, b) => b.yearly - a.yearly)
}

// ─── Forecast ─────────────────────────────────────────────────────────────────

/** Projects month-end spending from the pace so far plus recurring charges still due. */
export function forecastMonth(txs: Transaction[], subs: Subscription[], key = currentMonth(txs)) {
  const pace = monthPace(txs, key)
  const today = todayISO()
  const n = pace.length
  const isCurrent = monthKey(today) === key
  const dayIdx = isCurrent ? Number(today.slice(8, 10)) : n
  const spent = pace[Math.max(0, dayIdx - 1)] ?? 0
  const monthEnd = `${key}-${String(n).padStart(2, '0')}`
  const due = subs.filter((s) => s.next > today && s.next <= monthEnd).reduce((a, s) => a + s.amount, 0)
  // variable spending: what's left after fixed charges, spread over the days so far
  const fixedSoFar = inMonth(txs, key)
    .filter((t) => isExpense(t) && subs.some((s) => s.merchant === t.merchant))
    .reduce((a, t) => a - t.amount, 0)
  const variablePerDay = dayIdx > 0 ? (spent - fixedSoFar) / dayIdx : 0
  const projected = isCurrent ? spent + variablePerDay * (n - dayIdx) + due : spent
  return { spent, projected, due, dayIdx, days: n, isCurrent }
}
