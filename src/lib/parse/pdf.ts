import type { DraftTx } from './table'
import { parseAmount, parseDate } from './values'

interface Item {
  x: number
  w: number
  str: string
}

export interface PdfLine {
  page: number
  y: number
  items: Item[]
}

export interface PdfResult {
  drafts: DraftTx[]
  /** how the money direction was worked out, shown to the user as a warning level */
  signSource: 'columns' | 'explicit' | 'guess'
  pages: number
  /** the text Finny extracted, line by line, for the diagnostic view when nothing is found */
  text: string[]
}

/** Thrown when the PDF is encrypted; `incorrect` means a password was given but was wrong */
export class PdfPasswordError extends Error {
  incorrect: boolean
  constructor(incorrect: boolean) {
    super(incorrect ? 'Password errata' : 'Il PDF è protetto da password')
    this.incorrect = incorrect
  }
}

const MONTHS = 'gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic|jan|may|jun|jul|aug|sep|sept|oct|dec|gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|january|february|march|april|june|july|august|september|october|november|december'
// one date as statements print it: 02/09/2026 · 02.09.26 · 02/09 · 2 set 2026 · 02 SET · Sep 2, 2026
const DATE_SRC = `(?:\\d{1,2}[/.-]\\d{1,2}(?:[/.-]\\d{2,4})?(?![\\d.,])|\\d{1,2}\\s+(?:${MONTHS})\\.?(?:\\s+\\d{2,4})?(?![\\d])|(?:${MONTHS})\\.?\\s+\\d{1,2},?\\s+\\d{4})`
const LEADING_DATES = new RegExp(`^\\s*(${DATE_SRC})(?:\\s+(${DATE_SRC}))?(?=\\s|$)`, 'i')
const FULL_DATE_ANYWHERE = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/g
const MONEY = String.raw`(?:€|eur)?\s?[-+−]?\(?\d{1,3}(?:[.'\s ]\d{3})*[.,]\d{2}\)?-?\s?(?:€|eur)?|[-+−]?\d+[.,]\d{2}-?\s?(?:€|eur)?`
const AMOUNT_RE = new RegExp(`^(?:[-+−]\\s?)?(?:${MONEY})$`, 'i')
const TRAILING_AMOUNT = new RegExp(`(?<!\\b(?:ore|h))\\s+(?=(?:[-+−]\\s?)?(?:€\\s?)?\\d{1,3}(?:[.' ]\\d{3})*[.,]\\d{2}(?:\\s?(?:€|eur))?-?(?:\\s|$))`, 'i')
const DEBIT_HDR = /^(dare|addebiti|addebito|uscite|uscita|debit[oi]?|importo dare|money out|in uscita)$/i
const CREDIT_HDR = /^(avere|accrediti|accredito|entrate|entrata|credit[oi]?|importo avere|money in|in entrata)$/i
const BALANCE_HDR = /^(saldo|balance)$/i
const STOP_RE = /^(saldo|totale|pagina|page|riporto|segue|estratto conto|codice iban|iban)/i
const INCOME_HINT = /(accredito|stipendio|emolumenti|a vostro favore|a tuo favore|ricevuto|rimborso|storno|versamento|incasso|entrata|refund|salary)/i
const HEADER_WORD = /^(data|valuta|descrizione|causale|operazione|dare|avere|saldo|importo|entrate|uscite|addebiti|accrediti|divisa)$/i

export async function extractLines(file: File, password?: string): Promise<{ lines: PdfLine[]; pages: number }> {
  // the legacy build also runs on browsers that lack the newest JavaScript features (older Safari/iOS)
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const worker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  let doc
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), password }).promise
  } catch (e) {
    if (e && typeof e === 'object' && 'name' in e && e.name === 'PasswordException') {
      throw new PdfPasswordError((e as { code?: number }).code === pdfjs.PasswordResponses.INCORRECT_PASSWORD)
    }
    throw e
  }
  const lines: PdfLine[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const pageLines: PdfLine[] = []
    for (const raw of content.items) {
      if (!('str' in raw) || !raw.str.trim()) continue
      const x = raw.transform[4]
      const y = raw.transform[5]
      let line = pageLines.find((l) => Math.abs(l.y - y) < 3)
      if (!line) {
        line = { page: p, y, items: [] }
        pageLines.push(line)
      }
      line.items.push({ x, w: raw.width, str: raw.str.trim() })
    }
    pageLines.sort((a, b) => b.y - a.y)
    for (const l of pageLines) l.items.sort((a, b) => a.x - b.x)
    lines.push(...pageLines)
  }
  return { lines, pages: doc.numPages }
}

/**
 * Splits runs that pdf.js returns as one string: "12/03/2026 PAGAMENTO POS",
 * "2.380,00 4.298,31", "ESSELUNGA MILANO 45,20".
 */
function tokens(line: PdfLine): Item[] {
  const out: Item[] = []
  for (const it of line.items) {
    const parts = it.str
      .split(/\s{2,}|(?<=\d[.,]\d{2}-?(?:\s?€)?)\s+(?=[-+−(€]?\s?\d)/)
      .flatMap((p) => (/[a-z]{2}/i.test(p) ? p.split(TRAILING_AMOUNT) : [p]))
      .filter((p) => p.trim())
    if (parts.length === 1) {
      out.push({ ...it, str: it.str.trim() })
      continue
    }
    const charW = it.w / Math.max(1, it.str.length)
    let offset = 0
    for (const part of parts) {
      const at = it.str.indexOf(part, offset)
      out.push({ x: it.x + at * charW, w: part.length * charW, str: part.trim() })
      offset = at + part.length
    }
  }
  return out.filter((t) => t.str)
}

const isAmount = (t: Item) => AMOUNT_RE.test(t.str.trim()) && /[.,]\d{2}/.test(t.str)

/** Removes the leading date(s) from the tokens and returns the first one */
function takeLeadingDates(ts: Item[]): { raw: string; rest: Item[] } | null {
  const text = ts.map((t) => t.str).join(' ')
  const m = text.match(LEADING_DATES)
  if (!m) return null
  const toEat = m[0].trim().length
  const rest: Item[] = []
  let eaten = 0
  for (const t of ts) {
    if (eaten >= toEat) {
      rest.push(t)
      continue
    }
    const remaining = toEat - eaten
    if (t.str.length <= remaining) {
      eaten += t.str.length + 1 // the joining space
    } else {
      const tail = t.str.slice(remaining).trim()
      if (tail) rest.push({ ...t, str: tail })
      eaten = toEat
    }
  }
  return { raw: m[1], rest }
}

/** Latest complete date printed anywhere: the reference year for dates written as "02/09" */
function referenceDate(lines: PdfLine[]) {
  let best = ''
  for (const l of lines) {
    for (const it of l.items) {
      for (const m of it.str.matchAll(FULL_DATE_ANYWHERE)) {
        const iso = parseDate(m[0])
        if (iso && iso > best) best = iso
      }
    }
  }
  return best || new Date().toISOString().slice(0, 10)
}

function resolveDate(raw: string, ref: string): string | null {
  const full = parseDate(raw)
  if (full) return full
  // no year: take the statement's year, or the one before if that would land after the statement
  const year = Number(ref.slice(0, 4))
  const withYear = (y: number) => {
    const named = raw.match(/^(\d{1,2})\s+([a-zà-ü]+)\.?$/i)
    return named ? parseDate(`${named[1]} ${named[2]} ${y}`) : parseDate(`${raw.replace(/[.-]/g, '/')}/${y}`)
  }
  const guess = withYear(year)
  if (!guess) return null
  const limit = new Date(`${ref}T00:00:00Z`)
  limit.setUTCDate(limit.getUTCDate() + 45)
  return guess > limit.toISOString().slice(0, 10) ? withYear(year - 1) : guess
}

export function parsePdfLines(lines: PdfLine[], pages = 1): PdfResult {
  let debitX: number | null = null
  let creditX: number | null = null
  let balanceX: number | null = null
  for (const l of lines) {
    const ts = tokens(l)
    const d = ts.find((t) => DEBIT_HDR.test(t.str))
    const c = ts.find((t) => CREDIT_HDR.test(t.str))
    if (d && c) {
      debitX = d.x + d.w / 2
      creditX = c.x + c.w / 2
      const b = ts.find((t) => BALANCE_HDR.test(t.str))
      if (b) balanceX = b.x + b.w / 2
      break
    }
  }
  const ref = referenceDate(lines)

  // pass 1: every line that starts with a date and carries an amount is a movement
  interface Anchor { line: PdfLine; draft: DraftTx; before: string[]; after: string[] }
  const anchors: Anchor[] = []
  const loose: { line: PdfLine; text: string }[] = []
  let explicitSigns = 0

  for (const l of lines) {
    const all = tokens(l)
    const text = all.map((t) => t.str).join(' ')
    const lead = takeLeadingDates(all)
    const ts = lead ? lead.rest : all
    const amounts = ts.filter(isAmount)
    if (!lead || !amounts.length) {
      const headerish = all.length > 1 && all.every((t) => HEADER_WORD.test(t.str))
      if (!all.some(isAmount) && !STOP_RE.test(text) && !headerish) loose.push({ line: l, text })
      continue
    }
    const date = resolveDate(lead.raw, ref)
    if (!date) continue
    let chosen = amounts[0]
    let sign: 1 | -1 | 0 = 0
    if (debitX != null && creditX != null) {
      const center = (t: Item) => t.x + t.w / 2
      const toColumns = (t: Item) => Math.min(Math.abs(center(t) - debitX!), Math.abs(center(t) - creditX!))
      // the amount sits under Dare or Avere; numbers inside the description or under Saldo don't count
      const candidates = amounts.filter((t) => balanceX == null || Math.abs(center(t) - balanceX) > toColumns(t))
      chosen = (candidates.length ? candidates : amounts).reduce((a, b) => (toColumns(b) < toColumns(a) ? b : a))
      sign = Math.abs(center(chosen) - debitX) < Math.abs(center(chosen) - creditX) ? -1 : 1
    }
    const value = parseAmount(chosen.str)
    if (value == null || value === 0) continue
    const raw = chosen.str.trim()
    if (sign === 0 && (/^(€\s?)?[-−(]|-(\s?€)?$/.test(raw) || raw.startsWith('+'))) {
      sign = value < 0 ? -1 : 1
      explicitSigns++
    }
    const description = ts
      .filter((t) => !amounts.includes(t))
      .map((t) => t.str)
      .join(' ')
      .trim()
    if (sign === 0) sign = INCOME_HINT.test(description) ? 1 : -1
    const balance = amounts.length > 1 ? parseAmount(amounts[amounts.length - 1].str) ?? undefined : undefined
    anchors.push({
      line: l,
      before: [],
      after: [],
      draft: {
        key: `${anchors.length}`,
        date,
        description,
        amount: Math.round(Math.abs(value) * sign * 100) / 100,
        currency: 'EUR',
        balance: balance !== value ? balance : undefined,
      },
    })
  }

  // pass 2: text-only lines belong to the closest movement on the same page, above or below,
  // which covers both top-aligned and vertically centered multi-line descriptions
  const gaps: number[] = []
  for (let i = 1; i < anchors.length; i++) {
    if (anchors[i].line.page === anchors[i - 1].line.page) gaps.push(Math.abs(anchors[i - 1].line.y - anchors[i].line.y))
  }
  gaps.sort((a, b) => a - b)
  const rowGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 14
  for (const { line, text } of loose) {
    let best: Anchor | null = null
    let dist = Infinity
    for (const a of anchors) {
      if (a.line.page !== line.page) continue
      const d = Math.abs(a.line.y - line.y)
      if (d < dist) {
        dist = d
        best = a
      }
    }
    if (!best || dist > rowGap * 0.75 || best.before.length + best.after.length >= 3) continue
    if (line.y > best.line.y) best.before.push(text)
    else best.after.push(text)
  }

  const drafts = anchors.map((a) => ({
    ...a.draft,
    description: [...a.before, a.draft.description, ...a.after].filter(Boolean).join(' ').trim() || 'Movimento',
  }))
  const signSource: PdfResult['signSource'] =
    debitX != null ? 'columns' : explicitSigns > drafts.length / 2 ? 'explicit' : 'guess'
  const text = lines.map((l) => l.items.map((i) => i.str).join('   '))
  return { drafts, signSource, pages, text }
}

export async function readPdf(file: File, password?: string): Promise<PdfResult> {
  const { lines, pages } = await extractLines(file, password)
  return parsePdfLines(lines, pages)
}
