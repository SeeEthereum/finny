export type Cell = string | number | boolean | Date | null | undefined

export type DateOrder = 'dmy' | 'mdy' | 'ymd'

const MONTH_NAMES: Record<string, number> = {
  gen: 1, gennaio: 1, jan: 1, january: 1,
  feb: 2, febbraio: 2, february: 2,
  mar: 3, marzo: 3, march: 3,
  apr: 4, aprile: 4, april: 4,
  mag: 5, maggio: 5, may: 5,
  giu: 6, giugno: 6, jun: 6, june: 6,
  lug: 7, luglio: 7, jul: 7, july: 7,
  ago: 8, agosto: 8, aug: 8, august: 8,
  set: 9, settembre: 9, sep: 9, sept: 9, september: 9,
  ott: 10, ottobre: 10, oct: 10, october: 10,
  nov: 11, novembre: 11, november: 11,
  dic: 12, dicembre: 12, dec: 12, december: 12,
}

function iso(y: number, m: number, d: number) {
  if (y < 100) y += y > 70 ? 1900 : 2000
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1970 || y > 2100) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCMonth() !== m - 1) return null
  return dt.toISOString().slice(0, 10)
}

/** Excel stores dates as days since 1899-12-30 */
function fromExcelSerial(n: number) {
  const dt = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86_400_000)
  return dt.toISOString().slice(0, 10)
}

export function parseDate(raw: Cell, order: DateOrder = 'dmy'): string | null {
  if (raw == null || raw === '') return null
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null
    // nudge by 12h so a timezone-shifted midnight still lands on the right day
    return new Date(raw.getTime() + 12 * 3_600_000).toISOString().slice(0, 10)
  }
  if (typeof raw === 'number') {
    if (Number.isInteger(raw) && raw > 25_000 && raw < 80_000) return fromExcelSerial(raw)
    if (raw > 19_000_000 && raw < 21_000_000) raw = String(raw)
    else return null
  }
  const s = String(raw).trim().toLowerCase()

  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[t\s].*)?$/)
  if (m) return iso(+m[1], +m[2], +m[3])

  m = s.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (m) return iso(+m[1], +m[2], +m[3])

  m = s.match(/^(\d{1,2})[-/.\s](\d{1,2})[-/.\s](\d{2,4})(?:[\s,t].*)?$/)
  if (m) {
    const a = +m[1], b = +m[2], y = +m[3]
    return order === 'mdy' ? iso(y, a, b) : iso(y, b, a)
  }

  m = s.match(/^(\d{1,2})[-/.\s]+([a-zà-ü]{3,10})\.?[-/.\s]+(\d{2,4})/)
  if (m && MONTH_NAMES[m[2]]) return iso(+m[3], MONTH_NAMES[m[2]], +m[1])

  m = s.match(/^([a-z]{3,10})\.?\s+(\d{1,2}),?\s+(\d{4})/)
  if (m && MONTH_NAMES[m[1]]) return iso(+m[3], MONTH_NAMES[m[1]], +m[2])

  return null
}

/** Pick day-first or month-first by looking for values that only fit one reading. */
export function detectDateOrder(samples: Cell[]): DateOrder {
  let dayFirst = 0
  let monthFirst = 0
  for (const v of samples) {
    if (typeof v !== 'string') continue
    const m = v.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/)
    if (!m) continue
    if (+m[1] > 12) dayFirst++
    if (+m[2] > 12) monthFirst++
  }
  // Italian statements are day-first; only switch on clear evidence
  return monthFirst > 0 && dayFirst === 0 ? 'mdy' : 'dmy'
}

/**
 * Parses amounts as banks write them: "1.234,56", "-12,50", "12,50-",
 * "(3.00)", "€ 1 234,56", "1,234.56", "+50".
 */
export function parseAmount(raw: Cell): number | null {
  if (raw == null || raw === '') return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw !== 'string') return null
  let s = raw.trim()
  if (!s) return null
  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  if (/-\s*$/.test(s)) {
    negative = true
    s = s.replace(/-\s*$/, '')
  }
  if (/^[-−–]/.test(s.replace(/^[^\d-−–]+/, ''))) negative = true
  s = s.replace(/[^\d.,]/g, '')
  if (!/\d/.test(s)) return null

  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  let decimal: ',' | '.' | null = null
  if (lastComma >= 0 && lastDot >= 0) decimal = lastComma > lastDot ? ',' : '.'
  // a lone separator followed by exactly three digits is a thousands mark ("1.234", "12,500")
  else if (lastComma >= 0) decimal = /,\d{1,2}$/.test(s) ? ',' : null
  else if (lastDot >= 0) decimal = /\.\d{1,2}$/.test(s) ? '.' : null

  let normalized: string
  if (decimal === ',') normalized = s.replace(/\./g, '').replace(',', '.')
  else if (decimal === '.') normalized = s.replace(/,/g, '')
  else normalized = s.replace(/[.,]/g, '')

  const n = Number(normalized)
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}

export function cellText(c: Cell) {
  if (c == null) return ''
  if (c instanceof Date) return c.toISOString().slice(0, 10)
  return String(c).trim()
}
