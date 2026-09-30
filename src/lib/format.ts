const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
const eurRound = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})
const compact = new Intl.NumberFormat('it-IT', {
  notation: 'compact',
  maximumFractionDigits: 1,
})
const pct = new Intl.NumberFormat('it-IT', { style: 'percent', maximumFractionDigits: 0 })

export function money(n: number, opts: { round?: boolean; sign?: boolean } = {}) {
  const f = opts.round ? eurRound : eur
  const s = f.format(Math.abs(n) < 0.005 ? 0 : n)
  return opts.sign && n > 0 ? `+${s}` : s
}

export function moneyCompact(n: number) {
  return `${compact.format(n)} €`
}

export function percent(n: number) {
  return pct.format(n)
}

const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
const MONTHS_LONG = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
]
const WEEKDAYS = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']

/** "2026-03" → "mar" / "marzo 2026" */
export function monthLabel(key: string, long = false) {
  const [y, m] = key.split('-').map(Number)
  return long ? `${MONTHS_LONG[m - 1]} ${y}` : MONTHS[m - 1]
}

export function dayLabel(iso: string) {
  const d = parseISO(iso)
  const today = todayISO()
  if (iso === today) return 'Oggi'
  if (iso === shiftDays(today, -1)) return 'Ieri'
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export function shortDate(iso: string) {
  const d = parseISO(iso)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

export function parseISO(iso: string) {
  return new Date(`${iso}T00:00:00Z`)
}

export function toISO(d: Date) {
  return d.toISOString().slice(0, 10)
}

export function todayISO() {
  const d = new Date()
  return toISO(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())))
}

export function shiftDays(iso: string, days: number) {
  const d = parseISO(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return toISO(d)
}

export function daysBetween(a: string, b: string) {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000)
}

export function monthKey(iso: string) {
  return iso.slice(0, 7)
}

export function daysInMonth(key: string) {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return toISO(d).slice(0, 7)
}

export function weekday(iso: string) {
  return parseISO(iso).getUTCDay()
}

export const WEEKDAY_SHORT = WEEKDAYS
