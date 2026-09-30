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
}

const DATE_RE = /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/
const AMOUNT_RE = /^[-+−]?\(?€?\s?\d{1,3}(?:[.'\s]\d{3})*[.,]\d{2}\)?-?$|^[-+−]?\d+[.,]\d{2}-?$/
const DEBIT_HDR = /^(dare|addebiti|addebito|uscite|uscita|debit[oi]?|importo dare|money out)$/i
const CREDIT_HDR = /^(avere|accrediti|accredito|entrate|entrata|credit[oi]?|importo avere|money in)$/i
const BALANCE_HDR = /^(saldo|balance)$/i
const STOP_RE = /^(saldo|totale|pagina|page|riporto|segue|estratto conto|codice iban|iban)/i
const INCOME_HINT = /(accredito|stipendio|emolumenti|a vostro favore|a tuo favore|ricevuto|rimborso|storno|versamento|incasso|entrata|refund|salary)/i

export async function extractLines(file: File): Promise<{ lines: PdfLine[]; pages: number }> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
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

/** Splits items like "12/03/2026 PAGAMENTO POS" or "2.380,00 4.298,31" that pdf.js returns as one run. */
function tokens(line: PdfLine): Item[] {
  const out: Item[] = []
  for (const it of line.items) {
    const parts = it.str
      .split(/\s{2,}|\s(?=\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b)|(?<=\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})\s|(?<=\d[.,]\d{2}-?)\s+(?=[-+−(]?\d)/)
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

const isAmount = (t: Item) => AMOUNT_RE.test(t.str.replace(/\s/g, ''))
const HEADER_WORD = /^(data|valuta|descrizione|causale|operazione|dare|avere|saldo|importo|entrate|uscite|addebiti|accrediti|divisa)$/i

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

  // pass 1: every line that starts with a date and carries an amount is a movement
  interface Anchor { line: PdfLine; draft: DraftTx; before: string[]; after: string[] }
  const anchors: Anchor[] = []
  const loose: { line: PdfLine; text: string }[] = []
  let explicitSigns = 0

  for (const l of lines) {
    const ts = tokens(l)
    const text = ts.map((t) => t.str).join(' ')
    const first = ts[0]?.str ?? ''
    const amounts = ts.filter(isAmount)
    if (!DATE_RE.test(first) || !amounts.length) {
      const headerish = ts.length > 1 && ts.every((t) => HEADER_WORD.test(t.str))
      if (!amounts.length && !STOP_RE.test(text) && !headerish) loose.push({ line: l, text })
      continue
    }
    const date = parseDate(first)
    if (!date) continue
    let chosen = amounts[0]
    let sign: 1 | -1 | 0 = 0
    if (debitX != null && creditX != null) {
      const center = (t: Item) => t.x + t.w / 2
      const candidates = amounts.filter(
        (t) => balanceX == null || Math.abs(center(t) - balanceX) > Math.min(Math.abs(center(t) - debitX!), Math.abs(center(t) - creditX!)),
      )
      chosen = candidates[0] ?? amounts[0]
      sign = Math.abs(center(chosen) - debitX) < Math.abs(center(chosen) - creditX) ? -1 : 1
    }
    const value = parseAmount(chosen.str)
    if (value == null || value === 0) continue
    const raw = chosen.str.trim()
    if (sign === 0 && (/^[-−(]|-$/.test(raw) || raw.startsWith('+'))) {
      sign = value < 0 ? -1 : 1
      explicitSigns++
    }
    const description = ts
      .filter((t) => !amounts.includes(t) && !DATE_RE.test(t.str))
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
  const gaps = anchors.slice(1).filter((a, i) => a.line.page === anchors[i].line.page).map((a, i) => Math.abs(anchors[i].line.y - a.line.y))
  const rowGap = gaps.length ? gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : 14
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
  return { drafts, signSource, pages }
}

export async function readPdf(file: File): Promise<PdfResult> {
  const { lines, pages } = await extractLines(file)
  return parsePdfLines(lines, pages)
}
