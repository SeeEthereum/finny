import { normalize } from '../categorize'
import { cellText, detectDateOrder, parseAmount, parseDate, type Cell, type DateOrder } from './values'

export type Grid = Cell[][]

export type Field = 'date' | 'description' | 'amount' | 'debit' | 'credit' | 'currency' | 'status' | 'fee' | 'balance'

export interface Mapping {
  date: number | null
  description: number[]
  amount: number | null
  debit: number | null
  credit: number | null
  currency: number | null
  status: number | null
  fee: number | null
  balance: number | null
}

export interface DetectedTable {
  headerRow: number
  headers: string[]
  rows: Cell[][]
  mapping: Mapping
  dateOrder: DateOrder
}

export interface DraftTx {
  key: string
  date: string
  description: string
  amount: number
  currency: string
  balance?: number
}

export interface ToDraftsResult {
  drafts: DraftTx[]
  skipped: number
  latestBalance?: { amount: number; date: string }
}

/**
 * Header synonyms in priority order. Earlier entries win when two columns
 * both look like a date (e.g. "Data contabile" beats "Data valuta").
 */
const SYNONYMS: Record<Field, string[]> = {
  date: [
    'data operazione', 'data contabile', 'data registrazione', 'data movimento', 'data', 'date',
    'booking date', 'transaction date', 'completed date', 'started date', 'buchungstag', 'fecha',
    'data valuta', 'value date',
  ],
  description: [
    'descrizione operazione', 'descrizione', 'causale', 'dettagli', 'description', 'payee',
    'beneficiario', 'controparte', 'merchant', 'esercente', 'operazione', 'transaction description',
    'payment reference', 'riferimento', 'note', 'memo', 'details', 'name', 'nome',
  ],
  amount: ['importo', 'amount', 'importo eur', 'amount eur', 'valore', 'totale', 'betrag', 'importe', 'movimento'],
  debit: ['dare', 'uscite', 'uscita', 'addebiti', 'addebito', 'debit', 'debito', 'importo dare', 'money out', 'paid out', 'withdrawals'],
  credit: ['avere', 'entrate', 'entrata', 'accrediti', 'accredito', 'credit', 'credito', 'importo avere', 'money in', 'paid in', 'deposits'],
  currency: ['divisa', 'currency', 'valuta divisa', 'currency code'],
  status: ['state', 'stato', 'status'],
  fee: ['fee', 'commissione', 'commissioni', 'fees'],
  balance: ['saldo', 'balance', 'saldo contabile', 'saldo disponibile', 'running balance'],
}

function headerScore(text: string, field: Field) {
  const t = normalize(text)
  if (!t) return 0
  const list = SYNONYMS[field]
  for (let i = 0; i < list.length; i++) {
    const syn = normalize(list[i])
    if (t === syn) return 100 - i
    if (t.startsWith(`${syn} `) || t.endsWith(` ${syn}`)) return 60 - i
  }
  return 0
}

function rowScore(row: Cell[]) {
  let hits = 0
  for (const c of row) {
    const txt = cellText(c)
    if (!txt || txt.length > 40) continue
    if ((Object.keys(SYNONYMS) as Field[]).some((f) => headerScore(txt, f) > 0)) hits++
  }
  return hits
}

function emptyMapping(): Mapping {
  return {
    date: null, description: [], amount: null, debit: null, credit: null,
    currency: null, status: null, fee: null, balance: null,
  }
}

function colValues(rows: Cell[][], i: number, limit = 60) {
  return rows.slice(0, limit).map((r) => r[i])
}

function fraction(values: Cell[], test: (c: Cell) => boolean) {
  const filled = values.filter((v) => v != null && cellText(v) !== '')
  if (!filled.length) return 0
  return filled.filter(test).length / filled.length
}

/** Finds the header row, then maps columns by name first and by content as a fallback. */
export function detectTable(grid: Grid): DetectedTable {
  const clean = grid.filter((r) => r && r.some((c) => cellText(c) !== ''))
  let headerRow = -1
  let best = 1
  for (let i = 0; i < Math.min(clean.length, 40); i++) {
    const s = rowScore(clean[i])
    if (s > best) {
      best = s
      headerRow = i
    }
  }

  const width = Math.max(0, ...clean.map((r) => r.length))
  const headers =
    headerRow >= 0
      ? Array.from({ length: width }, (_, i) => cellText(clean[headerRow][i]) || `Colonna ${i + 1}`)
      : Array.from({ length: width }, (_, i) => `Colonna ${i + 1}`)
  const rows = clean.slice(headerRow + 1)
  const mapping = emptyMapping()

  if (headerRow >= 0) {
    const taken = new Set<number>()
    const pick = (field: Field) => {
      let bestIdx = -1
      let bestScore = 0
      headers.forEach((h, i) => {
        if (taken.has(i)) return
        const s = headerScore(h, field)
        if (s > bestScore) {
          bestScore = s
          bestIdx = i
        }
      })
      if (bestIdx >= 0) taken.add(bestIdx)
      return bestIdx >= 0 ? bestIdx : null
    }
    // order matters: the specific fields claim their columns before the generic ones
    mapping.debit = pick('debit')
    mapping.credit = pick('credit')
    mapping.balance = pick('balance')
    mapping.fee = pick('fee')
    mapping.status = pick('status')
    mapping.currency = pick('currency')
    mapping.date = pick('date')
    mapping.amount = pick('amount')
    const desc = pick('description')
    if (desc != null) mapping.description = [desc]

    // a "Valuta" column holds either the value date or the currency code
    headers.forEach((h, i) => {
      if (taken.has(i) || normalize(h) !== 'valuta') return
      const vals = colValues(rows, i)
      if (mapping.currency == null && fraction(vals, (v) => /^[a-z]{3}$/i.test(cellText(v))) > 0.8) {
        mapping.currency = i
        taken.add(i)
      }
    })

    // a date column must actually contain dates, amounts must be numbers
    if (mapping.date != null && fraction(colValues(rows, mapping.date), (v) => parseDate(v) != null) < 0.6) {
      mapping.date = null
    }
    if (mapping.amount != null && fraction(colValues(rows, mapping.amount), (v) => parseAmount(v) != null) < 0.6) {
      mapping.amount = null
    }
    if (mapping.debit != null && mapping.credit == null) {
      // a lone "Dare/Uscite" header on a signed column is really the amount
      mapping.amount ??= mapping.debit
      mapping.debit = null
    }
  }

  inferByContent(rows, width, mapping)
  const dateOrder = mapping.date != null ? detectDateOrder(colValues(rows, mapping.date, 400)) : 'dmy'
  return { headerRow, headers, rows, mapping, dateOrder }
}

function inferByContent(rows: Cell[][], width: number, mapping: Mapping) {
  const used = () =>
    new Set(
      [mapping.date, mapping.amount, mapping.debit, mapping.credit, mapping.currency, mapping.status, mapping.fee, mapping.balance, ...mapping.description].filter(
        (x): x is number => x != null,
      ),
    )

  if (mapping.date == null) {
    for (let i = 0; i < width; i++) {
      if (used().has(i)) continue
      if (fraction(colValues(rows, i), (v) => parseDate(v) != null) > 0.8) {
        mapping.date = i
        break
      }
    }
  }
  if (mapping.amount == null && mapping.debit == null && mapping.credit == null) {
    for (let i = 0; i < width; i++) {
      if (used().has(i)) continue
      const vals = colValues(rows, i)
      const numeric = fraction(vals, (v) => parseAmount(v) != null && parseDate(v) == null)
      if (numeric > 0.8) {
        mapping.amount = i
        break
      }
    }
  }
  if (!mapping.description.length) {
    let bestIdx = -1
    let bestLen = 0
    for (let i = 0; i < width; i++) {
      if (used().has(i)) continue
      const vals = colValues(rows, i).map(cellText).filter(Boolean)
      if (!vals.length) continue
      const textual = vals.filter((v) => /[a-z]{3}/i.test(v)).length / vals.length
      const avg = vals.reduce((a, v) => a + v.length, 0) / vals.length
      if (textual > 0.6 && avg > bestLen) {
        bestLen = avg
        bestIdx = i
      }
    }
    if (bestIdx >= 0) mapping.description = [bestIdx]
  }
}

export function mappingProblems(m: Mapping): string[] {
  const problems: string[] = []
  if (m.date == null) problems.push('Scegli la colonna con la data dei movimenti.')
  if (!m.description.length) problems.push('Scegli la colonna con la descrizione.')
  if (m.amount == null && m.debit == null && m.credit == null) {
    problems.push("Scegli la colonna dell'importo, oppure le colonne Dare e Avere.")
  }
  return problems
}

const SKIP_STATUS = /reverted|declined|failed|cancel|annullat|rifiutat|stornat/i
const SKIP_DESCRIPTION = /^(saldo (iniziale|finale|contabile|disponibile)|totale|opening balance|closing balance)/i

export function toDrafts(
  table: Pick<DetectedTable, 'rows' | 'mapping' | 'dateOrder'>,
  opts: { invertSign?: boolean; defaultCurrency?: string } = {},
): ToDraftsResult {
  const { rows, mapping, dateOrder } = table
  const drafts: DraftTx[] = []
  let skipped = 0
  let latestBalance: ToDraftsResult['latestBalance']

  rows.forEach((row, idx) => {
    const date = mapping.date != null ? parseDate(row[mapping.date], dateOrder) : null
    const description = mapping.description
      .map((i) => cellText(row[i]))
      .filter(Boolean)
      .join(' · ')
    let amount: number | null = null
    if (mapping.amount != null) amount = parseAmount(row[mapping.amount])
    if (mapping.debit != null || mapping.credit != null) {
      const out = mapping.debit != null ? parseAmount(row[mapping.debit]) : null
      const inc = mapping.credit != null ? parseAmount(row[mapping.credit]) : null
      if (out || inc) amount = (inc ? Math.abs(inc) : 0) - (out ? Math.abs(out) : 0)
    }
    const status = mapping.status != null ? cellText(row[mapping.status]) : ''
    if (!date || amount == null || amount === 0 || SKIP_STATUS.test(status) || SKIP_DESCRIPTION.test(description)) {
      skipped++
      return
    }
    if (mapping.fee != null) {
      const fee = parseAmount(row[mapping.fee])
      if (fee) amount -= Math.abs(fee)
    }
    if (opts.invertSign) amount = -amount
    const currency =
      (mapping.currency != null && /^[a-z]{3}$/i.test(cellText(row[mapping.currency]))
        ? cellText(row[mapping.currency]).toUpperCase()
        : null) ?? opts.defaultCurrency ?? 'EUR'
    const balance = mapping.balance != null ? parseAmount(row[mapping.balance]) ?? undefined : undefined
    if (balance != null && (!latestBalance || date >= latestBalance.date)) {
      latestBalance = { amount: balance, date }
    }
    drafts.push({
      key: `${idx}`,
      date,
      description: description || 'Movimento senza descrizione',
      amount: Math.round(amount * 100) / 100,
      currency,
      balance,
    })
  })

  return { drafts, skipped, latestBalance }
}
