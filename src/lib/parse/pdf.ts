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

export interface PdfSection {
  name: string
  count: number
  /** pending, reversed or savings-pot sections are left out unless the user opts in */
  includeByDefault: boolean
}

export interface PdfResult {
  drafts: DraftTx[]
  sections: PdfSection[]
  /** account holder as printed on the statement, used to spot transfers between your own accounts */
  holder?: string
  /** bank name found in the statement text */
  institution?: string
  /** closing balance of the main section, when the statement has a balance column */
  latestBalance?: { amount: number; date: string }
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
// headers are matched on their last words: "Dare", "Uscite", "Denaro in uscita", "Money out", "Paid out"…
const DEBIT_HDR = /(^|\s)(dare|addebit[io]|uscit[ae]|debit[io]?|debit|money out|paid out|withdrawals?)$/i
const CREDIT_HDR = /(^|\s)(avere|accredit[io]|entrat[ae]|credit[io]?|credit|money in|paid in|deposits?)$/i
const BALANCE_HDR = /^(saldo|balance)$/i
const STOP_RE = /^(saldo|totale|pagina|page|riporto|segue|estratto conto|codice iban|iban)/i
const INCOME_HINT = /(accredito|stipendio|emolumenti|a vostro favore|a tuo favore|ricevuto|rimborso|storno|versamento|incasso|entrata|refund|salary)/i
const HEADER_WORD = /^(data|data d'inizio|valuta|descrizione|causale|operazione|dare|avere|saldo|importo|entrate|uscite|addebiti|accrediti|divisa|denaro in uscita|denaro in entrata)$/i
/** a section title: "Transazioni del conto…", "In sospeso…", "Transazioni stornate…", "Movimenti…" */
const SECTION_RE = /^(transazioni|movimenti|operazioni|in sospeso|pending|transactions|reverted|completed)\b/i
const SKIP_SECTION_RE = /(sospeso|pending|stornat|revert|annullat|deposito|savings|vault|salvadanaio)/i
/** per-row lines that only carry ids, card numbers or exchange rates */
const NOISE_LINE = /^(id transazione|transaction id|carta:|card:|tasso revolut|revolut rate|tasso ecb|ecb rate)/i
const DETAIL_PREFIX = /^(a|da|to|from|riferimento|reference|beneficiario|ordinante):\s*/i

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
  // left edges too: many statements left-align amounts under left-aligned headers
  let debitLeft: number | null = null
  let creditLeft: number | null = null
  let balanceLeft: number | null = null
  for (const l of lines) {
    const ts = tokens(l)
    const d = ts.find((t) => DEBIT_HDR.test(t.str))
    const c = ts.find((t) => CREDIT_HDR.test(t.str) && t !== d)
    if (d && c) {
      debitX = d.x + d.w / 2
      creditX = c.x + c.w / 2
      debitLeft = d.x
      creditLeft = c.x
      const b = ts.find((t) => BALANCE_HDR.test(t.str))
      if (b) {
        balanceX = b.x + b.w / 2
        balanceLeft = b.x
      }
      break
    }
  }
  const ref = referenceDate(lines)
  const holder = findHolder(lines)

  // pass 1: every line that starts with a date and carries an amount is a movement
  interface Anchor { line: PdfLine; draft: DraftTx; before: string[]; after: string[] }
  const anchors: Anchor[] = []
  const loose: { line: PdfLine; text: string }[] = []
  let explicitSigns = 0
  let section = ''

  for (const l of lines) {
    const all = tokens(l)
    const text = all.map((t) => t.str).join(' ')
    if (SECTION_RE.test(text) && !all.some(isAmount) && text.length < 120) {
      // "Transazioni del conto dal giorno 1 gennaio…" → "Transazioni del conto"
      section = text.replace(/\s+(dal|da|from|tra)\s+(giorno\s+)?\d.*$/i, '').trim()
      continue
    }
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
      const toColumns = (t: Item) => Math.min(Math.abs(center(t) - debitX!), Math.abs(center(t) - creditX!), Math.abs(t.x - debitLeft!), Math.abs(t.x - creditLeft!))
      // the amount sits under Dare or Avere; numbers inside the description or under Saldo don't count
      const candidates = amounts.filter((t) => balanceX == null || Math.min(Math.abs(center(t) - balanceX), Math.abs(t.x - balanceLeft!)) > toColumns(t))
      chosen = (candidates.length ? candidates : amounts).reduce((a, b) => (toColumns(b) < toColumns(a) ? b : a))
      const toDebit = Math.min(Math.abs(center(chosen) - debitX), Math.abs(chosen.x - debitLeft!))
      const toCredit = Math.min(Math.abs(center(chosen) - creditX), Math.abs(chosen.x - creditLeft!))
      sign = toDebit < toCredit ? -1 : 1
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
        section: section || undefined,
        amount: Math.round(Math.abs(value) * sign * 100) / 100,
        currency: 'EUR',
        balance: balance !== value ? balance : undefined,
      },
    })
  }

  // pass 2: text-only lines. A line under a movement is its detail (counterpart, reference);
  // a line just above a date row with no description of its own is that row's description
  // (vertically centered table cells).
  const gaps: number[] = []
  for (let i = 1; i < anchors.length; i++) {
    if (anchors[i].line.page === anchors[i - 1].line.page) gaps.push(Math.abs(anchors[i - 1].line.y - anchors[i].line.y))
  }
  gaps.sort((a, b) => a - b)
  const rowGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 14
  for (const { line, text } of loose) {
    if (NOISE_LINE.test(text) || SECTION_RE.test(text)) continue
    let above: Anchor | null = null
    let below: Anchor | null = null
    for (const a of anchors) {
      if (a.line.page !== line.page) continue
      if (a.line.y > line.y && (!above || a.line.y < above.line.y)) above = a
      if (a.line.y < line.y && (!below || a.line.y > below.line.y)) below = a
    }
    const dAbove = above ? above.line.y - line.y : Infinity
    const dBelow = below ? line.y - below.line.y : Infinity
    if (below && !below.draft.description && dBelow < dAbove && dBelow <= rowGap) {
      if (below.before.length < 3) below.before.push(text)
    } else if (above && dAbove <= Math.max(rowGap * 1.2, 14)) {
      if (above.after.length < 4) above.after.push(text)
    }
  }

  const drafts: DraftTx[] = anchors.map((a) => {
    const own = a.draft.description
    // a row whose date line has no text takes its description from the lines around it
    const description = (own ? [...a.before, own] : [...a.before, ...a.after]).filter(Boolean).join(' ').trim() || 'Movimento'
    const detail = own ? a.after.map((t) => t.replace(DETAIL_PREFIX, '').trim()).filter(Boolean).join(' · ') : ''
    return { ...a.draft, description, detail: detail || undefined }
  })

  const names = [...new Set(drafts.map((d) => d.section ?? ''))]
  const sections: PdfSection[] = names.map((name) => ({
    name: name || 'Movimenti',
    count: drafts.filter((d) => (d.section ?? '') === name).length,
    includeByDefault: !SKIP_SECTION_RE.test(name),
  }))
  if (sections.length && !sections.some((x) => x.includeByDefault)) sections[0].includeByDefault = true

  // closing balance: the last row carrying a balance in the main section, in document order
  const mainName = names[sections.findIndex((x) => x.includeByDefault)] ?? ''
  const withBalance = drafts.filter((d) => d.balance != null && (d.section ?? '') === mainName)
  const last = withBalance[withBalance.length - 1]
  const latestBalance = last ? { amount: last.balance!, date: last.date } : undefined
  const signSource: PdfResult['signSource'] =
    debitX != null ? 'columns' : explicitSigns > drafts.length / 2 ? 'explicit' : 'guess'
  const text = lines.map((l) => l.items.map((i) => i.str).join('   '))
  return { drafts, sections, holder, institution: findInstitution(text), latestBalance, signSource, pages, text }
}

const BANKS: [RegExp, string][] = [
  [/\brevolut\b/i, 'Revolut'], [/intesa\s*sanpaolo/i, 'Intesa Sanpaolo'], [/\bunicredit\b/i, 'UniCredit'], [/\bfineco/i, 'Fineco'],
  [/\bn26\b/i, 'N26'], [/\bbbva\b/i, 'BBVA'], [/\bhype\b/i, 'Hype'], [/bancoposta|poste\s*italiane/i, 'BancoPosta'],
  [/mediolanum/i, 'Mediolanum'], [/\bwidiba\b/i, 'Widiba'], [/\bcredem\b/i, 'Credem'], [/banco\s*bpm/i, 'Banco BPM'],
  [/\bbper\b/i, 'BPER'], [/\bbnl\b/i, 'BNL'], [/\bing\s+(bank|italia)\b/i, 'ING'], [/\billimity\b/i, 'illimity'],
  [/\bwise\b/i, 'Wise'], [/monte\s*dei\s*paschi|\bmps\b/i, 'MPS'], [/\bbuddybank\b/i, 'Buddybank'], [/\bisybank\b/i, 'Isybank'],
]

function findInstitution(text: string[]) {
  const head = text.slice(0, 40).join(' ')
  return BANKS.find(([re]) => re.test(head))?.[1]
}

/** The holder's name: an all-caps line of 2-4 words near the top of the first page */
function findHolder(lines: PdfLine[]): string | undefined {
  for (const l of lines.filter((x) => x.page === 1).slice(0, 25)) {
    const text = l.items[0]?.str.trim() ?? ''
    const words = text.split(/\s+/)
    if (/^[A-ZÀ-Ý' ]{5,60}$/.test(text) && words.length >= 2 && words.length <= 4 && !/ESTRATTO|CONTO|STATEMENT|BANCA|BANK/.test(text)) {
      return text
    }
  }
  return undefined
}

export async function readPdf(file: File, password?: string): Promise<PdfResult> {
  const { lines, pages } = await extractLines(file, password)
  return parsePdfLines(lines, pages)
}
