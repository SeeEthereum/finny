import type { DraftTx } from './table'
import { parseAmount, parseDate } from './values'

export interface Item {
  x: number
  w: number
  str: string
  /** font height, when known */
  h?: number
}

/** One printed line. `y` grows towards the top of the page, like PDF coordinates. */
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

/** Whether the movements add up, checked against figures the statement itself prints */
export interface BalanceCheck {
  /** 'saldi': opening balance + movements = closing balance; 'colonna': each running balance follows from the previous one */
  how: 'saldi' | 'colonna'
  ok: boolean
  opening?: number
  closing?: number
  /** closing balance minus (opening + movements) */
  diff?: number
  /** running balances that follow from the one before, out of those that could be checked */
  matched?: number
  total?: number
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
  /** how the money direction was worked out, shown to the user as a confidence level */
  signSource: 'columns' | 'balance' | 'explicit' | 'guess'
  /** 'rows': every movement carries its date; 'grouped': movements under a heading with the day; 'labeled': "Data … Importo …" pairs */
  layout: 'rows' | 'grouped' | 'labeled'
  check?: BalanceCheck
  pages: number
  /** the text Finny extracted, line by line, for the diagnostic view when nothing is found */
  text: string[]
  /** what the reader saw, for the diagnostic view */
  stats: { lines: number; dated: number; withAmount: number; readable: number }
}

/** Thrown when the PDF is encrypted; `incorrect` means a password was given but was wrong */
export class PdfPasswordError extends Error {
  incorrect: boolean
  constructor(incorrect: boolean) {
    super(incorrect ? 'Password errata' : 'Il PDF è protetto da password')
    this.incorrect = incorrect
  }
}

/* ------------------------------------------------------------------ extraction */

type Matrix = number[]

/** Same as pdf.js Util.transform: m1 × m2 */
function mul(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ]
}

export interface RawTextItem {
  str: string
  transform: number[]
  width: number
  height?: number
}

/**
 * Turns pdf.js text items into printed lines and cells, as the page is displayed:
 * rotated pages are turned upright, sideways text (margin codes, watermarks) is dropped,
 * text placed piece by piece or letter by letter is joined back into words, and items
 * whose baselines differ by a fraction of the font height share a line.
 */
export function pageLines(raw: RawTextItem[], viewport: { transform: number[]; height: number }, page: number): PdfLine[] {
  interface Placed { x: number; top: number; w: number; h: number; str: string }
  const items = raw.filter((it) => it.str && it.str.trim()).map((it) => ({ it, m: mul(viewport.transform, it.transform) }))
  // the direction most of the text runs in, in quarter turns: some statements draw a landscape
  // table sideways on a portrait page without marking the page as rotated
  const quarters = [0, 0, 0, 0]
  for (const { it, m } of items) quarters[Math.round(Math.atan2(m[1], m[0]) / (Math.PI / 2)) & 3] += it.str.length
  const q = quarters.indexOf(Math.max(...quarters))
  const phi = (-q * Math.PI) / 2
  const turn = [Math.cos(phi), Math.sin(phi), -Math.sin(phi), Math.cos(phi), 0, 0]
  const placed: Placed[] = []
  for (const { it, m: m0 } of items) {
    const m = q ? mul(turn, m0) : m0
    // text along the main direction only (drops margin codes and watermarks)
    if (m[0] <= 0 || Math.abs(m[1]) > Math.abs(m[0]) * 0.2) continue
    const h = Math.hypot(m[2], m[3]) || it.height || 10
    const len = it.str.length
    const w = it.width > 0 ? it.width : len * h * 0.5
    const charW = w / len
    const lead = len - it.str.trimStart().length
    const trail = len - it.str.trimEnd().length
    placed.push({ x: m[4] + lead * charW, top: m[5], w: w - (lead + trail) * charW, h, str: it.str.trim() })
  }
  placed.sort((a, b) => a.top - b.top || a.x - b.x)

  const rows: { top: number; h: number; items: Placed[] }[] = []
  for (const p of placed) {
    const row = rows.slice(-4).find((r) => Math.abs(r.top - p.top) <= Math.max(1.5, 0.4 * Math.min(r.h, p.h)))
    if (row) row.items.push(p)
    else rows.push({ top: p.top, h: p.h, items: [p] })
  }

  return rows.map((r) => {
    const cells: Item[] = []
    let last: Placed | null = null
    for (const p of r.items.sort((a, b) => a.x - b.x)) {
      // the same text printed twice a hair apart is a fake bold, not two words
      if (last && last.str === p.str && Math.abs(last.x - p.x) < Math.max(1, p.h * 0.2)) continue
      const prev = cells[cells.length - 1]
      const em = Math.min(prev?.h ?? p.h, p.h)
      const gap = prev ? p.x - (prev.x + prev.w) : Infinity
      if (prev && gap < 0.6 * em && gap > -em) {
        prev.str += gap > 0.15 * em ? ` ${p.str}` : p.str
        prev.w = Math.max(prev.w, p.x + p.w - prev.x)
      } else cells.push({ x: p.x, w: p.w, h: p.h, str: p.str })
      last = p
    }
    return { page, y: viewport.height - r.top, items: cells }
  })
}

interface PdfDocLike {
  numPages: number
  getPage(n: number): Promise<{
    getTextContent(): Promise<{ items: unknown[] }>
    getViewport(o: { scale: number }): { transform: number[]; height: number }
  }>
}

/** Every page's lines, top to bottom. Shared by the browser and the tests. */
export async function linesFromDocument(doc: PdfDocLike): Promise<PdfLine[]> {
  const lines: PdfLine[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const items = content.items.filter((i): i is RawTextItem => !!i && typeof i === 'object' && 'str' in i && 'transform' in i)
    lines.push(...pageLines(items, page.getViewport({ scale: 1 }), p))
  }
  return lines
}

export async function extractLines(file: File, password?: string): Promise<{ lines: PdfLine[]; pages: number }> {
  // the legacy build also runs on browsers that lack the newest JavaScript features (older Safari/iOS)
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const worker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), password })
  let doc
  try {
    doc = await task.promise
  } catch (e) {
    void task.destroy()
    if (e && typeof e === 'object' && 'name' in e && e.name === 'PasswordException') {
      throw new PdfPasswordError((e as { code?: number }).code === pdfjs.PasswordResponses.INCORRECT_PASSWORD)
    }
    throw e
  }
  try {
    return { lines: await linesFromDocument(doc), pages: doc.numPages }
  } finally {
    void task.destroy()
  }
}

/* ------------------------------------------------------------------ tokens */

const MONTHS =
  'gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|' +
  'january|february|march|april|june|july|august|september|october|november|december|' +
  'gen|feb|mar|apr|mag|giu|lug|ago|sett|set|ott|nov|dic|jan|may|jun|jul|aug|sept|sep|oct|dec'
const WEEKDAYS =
  'lunedì|lunedi|martedì|martedi|mercoledì|mercoledi|giovedì|giovedi|venerdì|venerdi|sabato|domenica|' +
  'monday|tuesday|wednesday|thursday|friday|saturday|sunday|lun|mar|mer|gio|ven|sab|dom|mon|tue|wed|thu|fri|sat|sun'
const D_ISO = String.raw`\d{4}[/.-]\d{1,2}[/.-]\d{1,2}`
const D_NUM_Y = String.raw`\d{1,2}[/.-]\d{1,2}[/.-](?:\d{4}|\d{2})(?!\d)`
const D_NUM = String.raw`\d{1,2}[/.-]\d{1,2}(?![/.,-]?\d)`
const D_NAMED = String.raw`\d{1,2}[\s.-]+(?:${MONTHS})\.?(?:[\s.-]+\d{4}|[\s.-]+\d{2}(?!\d))?(?![\p{L}\d])`
const D_US = String.raw`(?:${MONTHS})\.?\s+\d{1,2},?\s+\d{4}`
const WD = String.raw`(?:(?:${WEEKDAYS})\.?,?\s+)?`
// any date as statements print it; a bare "02.09" only counts at the start of a line, where it can't be an amount
const DATE_ANY = `(?:${D_ISO}|${D_NUM_Y}|${D_US}|${D_NAMED}|${D_NUM})`
const DATE_STRICT = `(?:${D_ISO}|${D_NUM_Y}|${D_US}|${D_NAMED})`
const LEADING_DATE = new RegExp(`^${WD}${DATE_ANY}(?=\\s|$)`, 'iu')
const IS_DATE = new RegExp(`^${WD}(${DATE_ANY})$`, 'iu')
const IS_STRICT_DATE = new RegExp(`^${WD}(${DATE_STRICT})$`, 'iu')
const WEEKDAY_PREFIX = new RegExp(`^(?:${WEEKDAYS})\\.?,?\\s+`, 'iu')
const WEEKDAY_ONLY = new RegExp(`^(?:${WEEKDAYS}|oggi|ieri|today|yesterday)\\.?,?$`, 'iu')
const FULL_DATE_ANYWHERE = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b|\b(\d{4})-(\d{2})-(\d{2})\b/g

const SIGN = '[-+−–]'
const CUR = '(?:€|eur|euro)'
const NUM = String.raw`(?:\d{1,3}(?:[.,'’  ]\d{3})+|\d+)[.,]\d{2}`
const MARK = '(?:dr|cr|d|c|a)'
const AMOUNT_SRC = String.raw`(?:${SIGN}\s?)?(?:${CUR}\s?)?(?:${SIGN}\s?)?\(?${NUM}\)?${SIGN}?(?:\s?${CUR})?(?:\s?${MARK}(?![\p{L}\d]))?`
const IS_AMOUNT = new RegExp(`^${AMOUNT_SRC}$`, 'iu')
// "ORE 12.30" and "h 9.15" are times, not amounts
const TRAILING_AMOUNT = new RegExp(String.raw`(?<!\b(?:ore|h|alle))\s+(${AMOUNT_SRC})$`, 'iu')
const CURRENCY_ONLY = /^(€|eur|euro|[-+])$/i
// a date or an amount anywhere in a line, for the diagnostic counts
const ANY_DATE = new RegExp(`(?:^|\\s)${DATE_STRICT}(?![\\p{L}\\d])`, 'iu')
const ANY_AMOUNT = new RegExp(`(?:^|\\s)${AMOUNT_SRC}(?=\\s|$)`, 'iu')

type Kind = 'date' | 'amount' | 'text'
interface Tok extends Item {
  kind: Kind
}

const plausible = (s: string) => resolveDate(s, '2000-06-30') != null

/**
 * Splits the line's cells into dates, amounts and text. Dates are only peeled off the start
 * of the line (operation and value date); amounts off the end of each cell. A bare "02.09"
 * counts as a date at the start of the line and as an amount anywhere else.
 */
function tokenize(line: PdfLine): Tok[] {
  const toks: Tok[] = []
  let leading = true
  const push = (p: Item) => {
    let kind: Kind = 'text'
    if (leading && IS_DATE.test(p.str) && plausible(p.str)) kind = 'date'
    else if (IS_AMOUNT.test(p.str)) kind = 'amount'
    else if (IS_STRICT_DATE.test(p.str) && plausible(p.str)) kind = 'date'
    if (kind !== 'date') leading = false
    toks.push({ ...p, kind })
  }
  for (const it of line.items) {
    const charW = it.w / Math.max(1, it.str.length)
    const at = (i: number, str: string): Item => ({ x: it.x + i * charW, w: str.length * charW, str, h: it.h })
    // monospace statements line up their columns with runs of spaces inside one string
    for (const seg of it.str.matchAll(/\S+(?: \S+)*/g)) {
      let text = seg[0]
      let start = seg.index ?? 0
      while (leading && text) {
        const m = text.match(LEADING_DATE)
        if (!m || !plausible(m[0])) break
        push(at(start, m[0]))
        const rest = text.slice(m[0].length)
        start += m[0].length + (rest.length - rest.trimStart().length)
        text = rest.trimStart()
      }
      const tail: Item[] = []
      while (text) {
        if (IS_AMOUNT.test(text)) {
          tail.unshift(at(start, text))
          text = ''
          break
        }
        const m = text.match(TRAILING_AMOUNT)
        if (!m || m.index == null) break
        tail.unshift(at(start + m.index + m[0].length - m[1].length, m[1]))
        text = text.slice(0, m.index).trimEnd()
      }
      if (text) push(at(start, text))
      tail.forEach(push)
    }
  }
  return toks
}

/** Value with its sign; `explicit` when the statement printed the sign (−, +, parentheses, D/C) */
function signedValue(raw: string): { value: number; explicit: boolean } | null {
  const s = raw.trim()
  const mark = s.match(/\s?(dr|cr|d|c|a)$/i)?.[1]?.toLowerCase()
  const core = (mark ? s.slice(0, s.length - mark.length) : s).replace(/(eur|euro|€)/gi, '').trim()
  const v = parseAmount(core)
  if (v == null) return null
  if (mark) return { value: mark.startsWith('d') ? -Math.abs(v) : Math.abs(v), explicit: true }
  const explicit = /^[-+−–(]|[-−–)]$/.test(core)
  return { value: core.startsWith('+') ? Math.abs(v) : v, explicit }
}

/* ------------------------------------------------------------------ dates */

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
  const s = raw.replace(WEEKDAY_PREFIX, '').trim()
  const full = parseDate(s)
  if (full) return full
  // no year: take the statement's year, or the one before if that would land after the statement
  const year = Number(ref.slice(0, 4))
  const withYear = (y: number) => {
    const named = s.match(/^(\d{1,2})[\s.-]+([a-zà-ü]+)\.?$/i)
    return named ? parseDate(`${named[1]} ${named[2]} ${y}`) : /^\d{1,2}[/.-]\d{1,2}$/.test(s) ? parseDate(`${s.replace(/[.-]/g, '/')}/${y}`) : null
  }
  const guess = withYear(year)
  if (!guess) return null
  const limit = new Date(`${ref}T00:00:00Z`)
  limit.setUTCDate(limit.getUTCDate() + 45)
  return guess > limit.toISOString().slice(0, 10) ? withYear(year - 1) : guess
}

/* ------------------------------------------------------------------ columns */

interface Span {
  l: number
  r: number
}
interface Cols {
  debit?: Span
  credit?: Span
  balance?: Span
}

const DEBIT_WORD = /^(dare|addebit[io]|uscit[ae]|debit[io]?|debits|withdrawals?)$/
const CREDIT_WORD = /^(avere|accredit[io]|entrat[ae]|credit[io]?|credits|deposits?)$/
const BALANCE_WORD = /^(saldo|balance)$/
const NOT_A_COLUMN = /^(iniziale|finale|precedente|contabile|disponibile|liquido|medio|al|iniz|fin)$/

/** Column positions from a table header: "Dare / Avere", "Uscite / Entrate", "Money out / Money in", "Saldo" */
function headerCols(items: Item[]): Cols | null {
  const words = items.flatMap((c) => {
    const cw = c.w / Math.max(1, c.str.length)
    return [...c.str.matchAll(/\S+/g)].map((m) => ({
      s: m[0].toLowerCase().replace(/[^\p{L}]/gu, ''),
      l: c.x + (m.index ?? 0) * cw,
      r: c.x + ((m.index ?? 0) + m[0].length) * cw,
      cell: c,
    }))
  })
  const keyword = (i: number): keyof Cols | null => {
    const w = words[i].s
    const prev = words[i - 1]?.s ?? ''
    if (DEBIT_WORD.test(w) || (w === 'out' && /^(money|paid)$/.test(prev))) return 'debit'
    if (CREDIT_WORD.test(w) || (w === 'in' && /^(money|paid)$/.test(prev))) return 'credit'
    if (BALANCE_WORD.test(w) && !NOT_A_COLUMN.test(words[i + 1]?.s ?? '')) return 'balance'
    return null
  }
  const found = words.map((_, i) => keyword(i))
  const cols: Cols = {}
  found.forEach((kind, i) => {
    if (!kind || cols[kind]) return
    const w = words[i]
    // a cell holding one header ("Denaro in uscita") spans the whole cell; merged headers fall back to the word
    const sameCell = words.filter((x, j) => x.cell === w.cell && found[j])
    cols[kind] = sameCell.length === 1 ? { l: w.cell.x, r: w.cell.x + w.cell.w } : { l: w.l, r: w.r }
  })
  return cols.debit && cols.credit ? cols : null
}

function dist(t: Item, s: Span) {
  const c = t.x + t.w / 2
  return Math.min(Math.abs(c - (s.l + s.r) / 2), Math.abs(t.x - s.l), Math.abs(t.x + t.w - s.r))
}

/* ------------------------------------------------------------------ parsing */

const STOP_RE = /^(saldo|totale|totali|pagina|page|riporto|a riportare|segue|estratto conto|codice iban|iban)\b/i
/** balance lines, never movements: "Saldo iniziale", "SALDO FINALE AL 31/03", "Opening balance" */
const BALANCE_LINE =
  /^(saldo(\s+(iniziale|finale|al|alla data|in data|contabile|disponibile|precedente|di apertura|di chiusura|riportato|liquido|attuale|iniz|fin)\b|\s*$)|(opening|closing|starting|ending) balance|balance (brought|carried) forward|riporto|a riportare)/i
const OPENING = /(iniziale|apertura|precedente|riportato|opening|brought forward|inizio)/i
const CLOSING = /(finale|chiusura|closing|carried forward)/i
const SKIP_LINE = /^(totale|totali|total)\b/i
const INCOME_HINT = /(accredito|stipendio|emolumenti|a vostro favore|a tuo favore|ricevuto|rimborso|storno|versamento|incasso|entrata|refund|salary|bonifico da|giroconto da|pagamento da)/i
/** a section title: "Transazioni del conto…", "In sospeso…", "Transazioni stornate…", "Movimenti…" */
const SECTION_RE = /^(transazioni|movimenti|operazioni|in sospeso|pending|transactions|reverted|completed)\b/i
const SKIP_SECTION_RE = /(sospeso|pending|stornat|revert|annullat|deposito|savings|vault|salvadanaio)/i
/** per-row lines that only carry ids, card numbers or exchange rates */
const NOISE_LINE = /^(id transazione|transaction id|carta:|card:|tasso revolut|revolut rate|tasso ecb|ecb rate)/i
const DETAIL_PREFIX = /^(a|da|to|from|riferimento|reference|beneficiario|ordinante):\s*/i
const TIME_PREFIX = /^\d{1,2}[:.]\d{2}(?::\d{2})?\s+/

interface Prepared {
  line: PdfLine
  toks: Tok[]
  text: string
  dates: Tok[]
  amounts: Tok[]
  desc: string
}

interface Anchor {
  idx: number
  line: PdfLine
  date: string
  desc: string
  section: string
  amounts: Tok[]
  chosen: Tok
  value: number
  sign: 1 | -1
  from: 'columns' | 'explicit' | 'guess'
  balance?: number
  /** the balance came from a "Saldo" column; otherwise it is trusted only if the running balance adds up */
  trusted: boolean
  before: string[]
  after: string[]
}

const MARK_WORD = /^(d|a|c|dr|cr|dare|avere)$/i

/** A sign or a D/A mark printed in its own column next to the amount belongs to the amount */
function attachMarks(toks: Tok[]): Tok[] {
  const out: Tok[] = []
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]
    const next = toks[i + 1]
    const prev = out[out.length - 1]
    if (t.kind === 'amount' && next?.kind === 'text' && MARK_WORD.test(next.str) && next.x - (t.x + t.w) < 80 && !/[a-z]$/i.test(t.str)) {
      const mark = /^(dare|d|dr)$/i.test(next.str) ? 'D' : 'C'
      out.push({ ...t, str: `${t.str} ${mark}`, w: next.x + next.w - t.x })
      i++
    } else if (t.kind === 'amount' && prev?.kind === 'text' && /^[-+−]$/.test(prev.str) && t.x - (prev.x + prev.w) < 45) {
      out.pop()
      out.push({ ...t, str: `${prev.str}${t.str}`, x: prev.x, w: t.x + t.w - prev.x })
    } else out.push(t)
  }
  return out
}

function prepare(line: PdfLine): Prepared {
  const toks = attachMarks(tokenize(line))
  const desc = toks
    .filter((t) => t.kind === 'text' && !CURRENCY_ONLY.test(t.str))
    .map((t) => t.str)
    .join(' ')
    .replace(TIME_PREFIX, '')
    .replace(/\s+/g, ' ')
    .trim()
  return {
    line,
    toks,
    text: line.items.map((i) => i.str).join(' '),
    dates: toks.filter((t) => t.kind === 'date'),
    amounts: toks.filter((t) => t.kind === 'amount'),
    desc,
  }
}

/** x of the column that holds the movement dates: the most common position of the first date on a line with an amount */
function dateColumn(ps: Prepared[]): number | null {
  const bins = new Map<number, number[]>()
  for (const p of ps) {
    if (!p.dates.length || !p.amounts.length) continue
    const k = Math.round(p.dates[0].x / 12)
    bins.set(k, [...(bins.get(k) ?? []), p.dates[0].x])
  }
  let best: number[] = []
  for (const [k, xs] of bins) {
    const around = [...xs, ...(bins.get(k - 1) ?? []), ...(bins.get(k + 1) ?? [])]
    if (around.length > best.length) best = around
  }
  return best.length ? best.reduce((a, b) => a + b, 0) / best.length : null
}

function isDateHeading(p: Prepared) {
  return p.dates.length === 1 && p.amounts.length <= 1 && p.toks.every((t) => t.kind !== 'text' || WEEKDAY_ONLY.test(t.str) || CURRENCY_ONLY.test(t.str))
}

interface Ctx {
  ref: string
  ps: Prepared[]
  sectionAt: string[]
  colsAt: (Cols | null)[]
  skip: Set<number>
}

/** Section and header in force at each line, plus the lines that are titles or headers */
function context(ps: Prepared[], ref: string): Ctx {
  const sectionAt: string[] = []
  const colsAt: (Cols | null)[] = []
  const skip = new Set<number>()
  let section = ''
  let cols: Cols | null = null
  ps.forEach((p, i) => {
    if (SECTION_RE.test(p.text) && !p.amounts.length && p.text.length < 120) {
      // "Transazioni del conto dal giorno 1 gennaio…" → "Transazioni del conto"
      section = p.text.replace(/\s+(dal|da|from|tra)\s+(giorno\s+)?\d.*$/i, '').trim()
      skip.add(i)
    } else if (!p.amounts.length) {
      const h = headerCols(p.line.items)
      if (h) {
        cols = h
        skip.add(i)
      }
    }
    sectionAt.push(section)
    colsAt.push(cols)
  })
  return { ref, ps, sectionAt, colsAt, skip }
}

function makeAnchor(ctx: Ctx, idx: number, date: string, amounts: Tok[], desc: string, useCols = true): Anchor | null {
  const cols = useCols ? ctx.colsAt[idx] : null
  const p = ctx.ps[idx]
  let chosen = amounts[0]
  let balanceTok: Tok | undefined
  let colSign: 1 | -1 | 0 = 0
  if (cols?.debit && cols.credit) {
    const debit = cols.debit
    const credit = cols.credit
    const near = (t: Tok) => Math.min(dist(t, debit), dist(t, credit))
    const bal = cols.balance ? amounts.filter((t) => dist(t, cols.balance!) < near(t)) : []
    const cand = amounts.filter((t) => !bal.includes(t))
    chosen = (cand.length ? cand : amounts).reduce((a, b) => (near(b) < near(a) ? b : a))
    colSign = dist(chosen, debit) < dist(chosen, credit) ? -1 : 1
    balanceTok = bal[bal.length - 1]
  } else if (amounts.length > 1) {
    balanceTok = amounts[amounts.length - 1]
    chosen = amounts[amounts.length - 2]
  }
  const sv = signedValue(chosen.str)
  if (!sv || sv.value === 0) return null
  let sign: 1 | -1
  let from: Anchor['from']
  if (colSign) {
    // a minus in the debit column is a refund: the column and the printed sign multiply
    sign = (colSign * Math.sign(sv.value)) as 1 | -1
    from = 'columns'
  } else if (sv.explicit) {
    sign = sv.value < 0 ? -1 : 1
    from = 'explicit'
  } else {
    sign = INCOME_HINT.test(desc) ? 1 : -1
    from = 'guess'
  }
  const balance = balanceTok ? signedValue(balanceTok.str)?.value : undefined
  return {
    idx,
    line: p.line,
    date,
    desc,
    section: ctx.sectionAt[idx],
    amounts,
    chosen,
    value: Math.abs(sv.value),
    sign,
    from,
    balance,
    trusted: !!(cols?.balance && balanceTok),
    before: [],
    after: [],
  }
}

/** Layout 1: every movement line carries its own date (most bank statements) */
function datedRows(ctx: Ctx) {
  const { ps, ref } = ctx
  const col = dateColumn(ps)
  const anchors: Anchor[] = []
  const used = new Set<number>()
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i]
    if (ctx.skip.has(i) || used.has(i) || !p.dates.length) continue
    const leading = p.toks[0]?.kind === 'date'
    const dateTok = leading ? p.toks[0] : col != null ? p.dates.find((d) => Math.abs(d.x - col) < 20) : undefined
    if (!dateTok) continue
    const date = resolveDate(dateTok.str, ref)
    if (!date) continue
    let amounts = p.amounts
    let desc = p.desc
    if (!amounts.length) {
      // a wrapped description can carry the amount on its last line
      if (!leading || BALANCE_LINE.test(desc) || SKIP_LINE.test(desc)) continue
      const h = p.line.items[0]?.h ?? 10
      for (let j = i + 1; j <= i + 2 && j < ps.length; j++) {
        const q = ps[j]
        if (q.line.page !== p.line.page || p.line.y - q.line.y > h * 2.8 || ctx.skip.has(j)) break
        if (q.dates.length) break
        if (q.amounts.length) {
          if (STOP_RE.test(q.text)) break
          amounts = q.amounts
          desc = [desc, q.desc].filter(Boolean).join(' ')
          used.add(j)
          break
        }
      }
      if (!amounts.length) continue
    }
    if (BALANCE_LINE.test(desc) || SKIP_LINE.test(desc)) continue
    const a = makeAnchor(ctx, i, date, amounts, desc)
    if (a) {
      anchors.push(a)
      used.add(i)
    }
  }
  inheritDates(ctx, anchors, used)
  return { anchors, used }
}

/**
 * Some statements print the date only on the first movement of the day. A line right below,
 * with a description and an amount in the same column as the dated movements, is another
 * movement of that day. The column test keeps amounts quoted inside detail lines out.
 */
function inheritDates(ctx: Ctx, anchors: Anchor[], used: Set<number>) {
  const { ps } = ctx
  if (anchors.length < 2) return
  const edges = anchors.map((a) => a.chosen.x + a.chosen.w)
  const inColumn = (t: Tok, i: number) => {
    const cols = ctx.colsAt[i]
    if (cols?.debit && cols.credit) return Math.min(dist(t, cols.debit), dist(t, cols.credit)) < 20
    return edges.filter((e) => Math.abs(e - (t.x + t.w)) < 4).length >= Math.max(2, anchors.length * 0.3)
  }
  const byIdx = new Map(anchors.map((a) => [a.idx, a]))
  const extra: Anchor[] = []
  let day: Anchor | null = null
  let last: Anchor | null = null
  for (let i = 0; i < ps.length; i++) {
    const own = byIdx.get(i)
    if (own) {
      day = own
      last = own
      continue
    }
    const p = ps[i]
    if (!day || !last || used.has(i) || ctx.skip.has(i) || p.dates.length || !p.amounts.length || !p.desc) continue
    if (ctx.sectionAt[i] !== day.section || p.line.page !== last.line.page || last.line.y - p.line.y > (p.line.items[0]?.h ?? 10) * 4) continue
    if (STOP_RE.test(p.text) || BALANCE_LINE.test(p.desc) || SKIP_LINE.test(p.desc) || NOISE_LINE.test(p.text)) continue
    if (!p.amounts.some((t) => inColumn(t, i))) continue
    const a = makeAnchor(ctx, i, day.date, p.amounts, p.desc)
    if (a) {
      extra.push(a)
      used.add(i)
      last = a
    }
  }
  if (!extra.length) return
  anchors.push(...extra)
  anchors.sort((a, b) => a.idx - b.idx)
}

/** Layout 2: a heading with the day, then the movements of that day without a date (apps, fintech) */
function groupedRows(ctx: Ctx) {
  const { ps, ref } = ctx
  const anchors: Anchor[] = []
  const used = new Set<number>()
  let day: string | null = null
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i]
    if (ctx.skip.has(i)) continue
    if (isDateHeading(p)) {
      day = resolveDate(p.dates[0].str, ref)
      used.add(i)
      continue
    }
    if (!day || p.dates.length || !p.amounts.length || !p.desc) continue
    if (STOP_RE.test(p.text) || BALANCE_LINE.test(p.desc) || SKIP_LINE.test(p.desc)) continue
    const a = makeAnchor(ctx, i, day, p.amounts, p.desc)
    if (a) {
      anchors.push(a)
      used.add(i)
    }
  }
  return { anchors, used }
}

const LABEL_DATE = new RegExp(
  String.raw`\b(?:data(?!\s+(?:valuta|di nascita|emissione|stampa))(?:\s+(?:operazione|contabile|registrazione|movimento|transazione))?|date|booking date|transaction date)\s*:?\s*(${DATE_STRICT})`,
  'iu',
)
const LABEL_AMOUNT = new RegExp(String.raw`\b(?:importo|amount|ammontare)\s*:?\s*(${AMOUNT_SRC})(?![\p{L}\d])`, 'iu')
const LABEL_DESC = /\b(?:descrizione|causale|description|esercente|beneficiario|merchant|controparte)\s*:?\s*(.+?)(?=\s+(?:importo|amount|data|date|causale|stato|categoria|valuta|saldo)\b|$)/iu

/** Layout 3: label and value pairs, "Data 02/09/2026 Descrizione … Importo 45,20" (receipts, web printouts) */
function labeledRows(ctx: Ctx) {
  const { ps, ref } = ctx
  const anchors: Anchor[] = []
  const used = new Set<number>()
  interface Rec { idx: number; date?: string; amount?: string; desc?: string; lines: number[] }
  let cur: Rec | null = null
  const flush = (rec: Rec | null) => {
    if (rec?.date && rec.amount) {
      const a = makeAnchor(ctx, rec.idx, rec.date, [{ x: 0, w: 0, str: rec.amount, kind: 'amount' }], rec.desc ?? '', false)
      if (a) {
        anchors.push(a)
        rec.lines.forEach((i) => used.add(i))
      }
    }
    return null
  }
  for (let i = 0; i < ps.length; i++) {
    const text = ps[i].text
    const d = text.match(LABEL_DATE)
    const am = text.match(LABEL_AMOUNT)
    const de = text.match(LABEL_DESC)
    if (!d && !am && !de) {
      if (cur && i - cur.lines[cur.lines.length - 1] > 3) cur = flush(cur)
      continue
    }
    // a label that the current movement already has starts the next one
    if (cur && ((d && cur.date) || (am && cur.amount))) cur = flush(cur)
    const rec: Rec = cur ?? { idx: i, lines: [] }
    if (d) rec.date ??= resolveDate(d[1], ref) ?? undefined
    if (am) rec.amount ??= am[1]
    if (de) rec.desc ??= de[1].trim()
    rec.lines.push(i)
    cur = rec
  }
  flush(cur)
  return { anchors, used }
}

/**
 * When rows carry a running balance, each balance minus the previous one is the movement,
 * sign included. If that holds for most rows, it settles the sign (and picks the right figure
 * when a row also shows a foreign-currency amount).
 */
function applyRunningBalance(anchors: Anchor[], opening?: number) {
  const close = (a: number, b: number) => Math.abs(a - b) < 0.006
  const fits = (a: Anchor, delta: number) => a.amounts.find((t) => close(Math.abs(signedValue(t.str)?.value ?? NaN), Math.abs(delta)))
  let pairs = 0
  let asc = 0
  let desc = 0
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1]
    const b = anchors[i]
    if (a.balance == null || b.balance == null) continue
    pairs++
    if (fits(b, b.balance - a.balance)) asc++
    if (fits(a, a.balance - b.balance)) desc++
  }
  const best = Math.max(asc, desc)
  if (pairs === 0 || best < Math.max(2, pairs * 0.6)) return { applied: false, matched: best, pairs, ascending: asc >= desc }
  const ascending = asc >= desc
  const set = (a: Anchor, delta: number) => {
    const tok = fits(a, delta)
    if (!tok || close(delta, 0)) return
    a.chosen = tok
    a.value = Math.abs(delta)
    a.sign = delta < 0 ? -1 : 1
  }
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i]
    const neighbour = ascending ? anchors[i - 1] : anchors[i + 1]
    if (a.balance == null) continue
    // ascending: this balance minus the previous one; newest first: this one minus the next (older) one
    if (neighbour?.balance != null) set(a, a.balance - neighbour.balance)
    else if (opening != null && !neighbour) set(a, a.balance - opening)
  }
  return { applied: true, matched: best, pairs, ascending }
}

export function parsePdfLines(lines: PdfLine[], pages = 1): PdfResult {
  const ref = referenceDate(lines)
  const ps = lines.map(prepare)
  const ctx = context(ps, ref)

  const dated = datedRows(ctx)
  const grouped = groupedRows(ctx)
  // grouped wins when it finds more movements with a description of their own: in an app-style
  // statement the dated lines are the day headings, whose figure is the day's total
  const described = (as: Anchor[]) => as.filter((a) => a.desc).length
  const useGrouped = grouped.anchors.length >= 2 && described(grouped.anchors) > described(dated.anchors)
  // label/value printouts only when the table readings find less
  const labeled = labeledRows(ctx)
  const layout: PdfResult['layout'] =
    labeled.anchors.length > Math.max(described(dated.anchors), useGrouped ? described(grouped.anchors) : 0) ? 'labeled' : useGrouped ? 'grouped' : 'rows'
  const { anchors, used } = { rows: dated, grouped, labeled }[layout]

  // printed balances: "Saldo iniziale … 1.000,00", "SALDO FINALE AL 31/03 1.234,56"
  let opening: number | undefined
  let closing: number | undefined
  const firstDate = anchors.reduce((a, x) => (x.date < a ? x.date : a), '9999-12-31')
  const lastDate = anchors.reduce((a, x) => (x.date > a ? x.date : a), '')
  ps.forEach((p) => {
    const label = p.desc || p.text
    if (!p.amounts.length || !BALANCE_LINE.test(label)) return
    const v = signedValue(p.amounts[p.amounts.length - 1].str)?.value
    if (v == null) return
    const when = p.dates[0] ? resolveDate(p.dates[0].str, ref) : null
    if (OPENING.test(label) || (when && when <= firstDate && !CLOSING.test(label))) opening ??= v
    else if (CLOSING.test(label) || (when && when >= lastDate)) closing = v
  })

  // detail lines: under a movement they are its details (counterpart, reference); just above
  // a movement with no description of its own they are its description (vertically centered cells)
  const gaps: number[] = []
  for (let i = 1; i < anchors.length; i++) {
    if (anchors[i].line.page === anchors[i - 1].line.page) gaps.push(Math.abs(anchors[i - 1].line.y - anchors[i].line.y))
  }
  gaps.sort((a, b) => a - b)
  const rowGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 14
  const byPage = new Map<number, Anchor[]>()
  for (const a of anchors) byPage.set(a.line.page, [...(byPage.get(a.line.page) ?? []), a])
  ps.forEach((p, i) => {
    if (used.has(i) || ctx.skip.has(i) || p.amounts.length || !p.text || STOP_RE.test(p.text) || NOISE_LINE.test(p.text) || isDateHeading(p)) return
    let above: Anchor | null = null
    let below: Anchor | null = null
    for (const a of byPage.get(p.line.page) ?? []) {
      if (a.line.y > p.line.y && (!above || a.line.y < above.line.y)) above = a
      if (a.line.y < p.line.y && (!below || a.line.y > below.line.y)) below = a
    }
    const dAbove = above ? above.line.y - p.line.y : Infinity
    const dBelow = below ? p.line.y - below.line.y : Infinity
    if (below && !below.desc && dBelow < dAbove && dBelow <= rowGap) {
      if (below.before.length < 3) below.before.push(p.text)
    } else if (above && dAbove <= Math.max(rowGap * 1.2, 14)) {
      if (above.after.length < 4) above.after.push(p.text)
    }
  })

  // sections, then the running balance and the totals check on the main one
  const names = [...new Set(anchors.map((a) => a.section))]
  const sections: PdfSection[] = names.map((name) => ({
    name: name || 'Movimenti',
    count: anchors.filter((a) => a.section === name).length,
    includeByDefault: !SKIP_SECTION_RE.test(name),
  }))
  if (sections.length && !sections.some((x) => x.includeByDefault)) sections[0].includeByDefault = true
  const mainName = names[sections.findIndex((x) => x.includeByDefault)] ?? ''
  const main = anchors.filter((a) => a.section === mainName)
  const chain = applyRunningBalance(main, opening)

  let check: BalanceCheck | undefined
  const total = Math.round(main.reduce((s, a) => s + a.sign * a.value, 0) * 100) / 100
  if (opening != null && closing != null && sections.filter((x) => x.includeByDefault).length === 1) {
    const diff = Math.round((closing - (opening + total)) * 100) / 100
    check = { how: 'saldi', ok: Math.abs(diff) < 0.01, opening, closing, diff }
  } else if (chain.pairs >= 2) {
    check = { how: 'colonna', ok: chain.applied && chain.matched === chain.pairs, matched: chain.matched, total: chain.pairs }
  }

  // closing balance: the latest row of the main section that carries one
  const withBalance = main.filter((a) => a.balance != null && (a.trusted || chain.applied))
  const latestRow = chain.ascending === false ? withBalance[0] : withBalance[withBalance.length - 1]
  const latestBalance = latestRow
    ? { amount: latestRow.balance!, date: latestRow.date }
    : closing != null && lastDate
      ? { amount: closing, date: lastDate }
      : undefined

  const drafts: DraftTx[] = anchors.map((a, k) => {
    const own = a.desc
    // a row whose date line has no text takes its description from the lines around it
    const description = (own ? [...a.before, own] : [...a.before, ...a.after]).filter(Boolean).join(' ').trim() || 'Movimento'
    const detail = own ? a.after.map((t) => t.replace(DETAIL_PREFIX, '').trim()).filter(Boolean).join(' · ') : ''
    return {
      key: `${k}`,
      date: a.date,
      description,
      detail: detail || undefined,
      section: a.section || undefined,
      amount: Math.round(a.value * a.sign * 100) / 100,
      currency: 'EUR',
      balance: a.trusted || (chain.applied && a.section === mainName) ? a.balance : undefined,
    }
  })

  const count = (f: Anchor['from']) => anchors.filter((a) => a.from === f).length
  const signSource: PdfResult['signSource'] =
    count('columns') > anchors.length / 2 ? 'columns' : chain.applied ? 'balance' : count('explicit') > anchors.length / 2 ? 'explicit' : 'guess'
  const text = lines.map((l) => l.items.map((i) => i.str).join('   '))
  const chars = text.join('')
  const readable = chars.length ? (chars.match(/[\p{L}\p{N}\p{P}\p{Zs}€$£]/gu)?.length ?? 0) / chars.length : 1
  return {
    drafts,
    sections,
    holder: findHolder(lines),
    institution: findInstitution(text),
    latestBalance,
    signSource,
    layout,
    check,
    pages,
    text,
    stats: {
      lines: lines.length,
      dated: ps.filter((p) => p.dates.length || ANY_DATE.test(p.text)).length,
      withAmount: ps.filter((p) => p.amounts.length || ANY_AMOUNT.test(p.text)).length,
      readable,
    },
  }
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
