import { describe, expect, it } from 'vitest'
import { detectSubscriptions, monthlyStats } from './analytics'
import { categorize, merchantName } from './categorize'
import { demoSnapshot } from './demo'
import { buildInsights } from './insights'
import { parsePdfLines, type PdfLine } from './parse/pdf'
import { parseCsvText } from './parse/readers'
import { detectTable, toDrafts } from './parse/table'
import { parseAmount, parseDate } from './parse/values'

describe('parseAmount', () => {
  it.each([
    ['1.234,56', 1234.56],
    ['-12,50', -12.5],
    ['12,50-', -12.5],
    ['(3.00)', -3],
    ['€ 1 234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['+50', 50],
    ['1.234', 1234],
    ['-0,99 €', -0.99],
    ['−7,00', -7],
    [42.1, 42.1],
    ['', null],
    ['abc', null],
  ])('%s → %s', (raw, expected) => {
    expect(parseAmount(raw as string)).toBe(expected)
  })
})

describe('parseDate', () => {
  it('reads Italian and ISO formats', () => {
    expect(parseDate('03/02/2026')).toBe('2026-02-03')
    expect(parseDate('3.2.26')).toBe('2026-02-03')
    expect(parseDate('2026-02-03 14:22:01')).toBe('2026-02-03')
    expect(parseDate('03 feb 2026')).toBe('2026-02-03')
    expect(parseDate('02/03/2026', 'mdy')).toBe('2026-02-03')
    expect(parseDate(46056)).toBe('2026-02-03')
    expect(parseDate('31/02/2026')).toBeNull()
  })
})

describe('CSV detection', () => {
  it('handles a bank export with a preamble and Dare/Avere columns', () => {
    const csv = [
      'Estratto conto;;;;',
      'Intestatario: Mario Rossi;;;;',
      ';;;;',
      'Data contabile;Data valuta;Descrizione;Dare;Avere',
      '02/09/2026;02/09/2026;PAGAMENTO POS ESSELUNGA MILANO;45,20;',
      '27/08/2026;27/08/2026;ACCREDITO EMOLUMENTI STIPENDIO;;2.150,00',
      '01/08/2026;01/08/2026;SALDO INIZIALE;;',
    ].join('\n')
    const table = detectTable(parseCsvText(csv))
    expect(table.headers[0]).toBe('Data contabile')
    expect(table.mapping.date).toBe(0)
    expect(table.mapping.debit).toBe(3)
    expect(table.mapping.credit).toBe(4)
    const { drafts, skipped } = toDrafts(table)
    expect(drafts.map((d) => d.amount)).toEqual([-45.2, 2150])
    expect(skipped).toBe(1)
  })

  it('handles a Revolut-style export with state and fee', () => {
    const csv = [
      'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance',
      'CARD_PAYMENT,Current,2026-09-01 10:00:00,2026-09-02 09:00:00,Glovo,-18.40,0.00,EUR,COMPLETED,120.00',
      'CARD_PAYMENT,Current,2026-09-03 10:00:00,,Amazon,-30.00,0.00,EUR,REVERTED,',
      'EXCHANGE,Current,2026-09-04 10:00:00,2026-09-04 10:00:00,Exchanged to USD,-100.00,0.50,EUR,COMPLETED,19.50',
    ].join('\n')
    const table = detectTable(parseCsvText(csv))
    const { drafts, latestBalance } = toDrafts(table)
    expect(drafts).toHaveLength(2)
    expect(drafts[0]).toMatchObject({ date: '2026-09-01', amount: -18.4, description: 'Glovo' })
    expect(drafts[1].amount).toBe(-100.5)
    expect(latestBalance).toEqual({ amount: 19.5, date: '2026-09-04' })
  })

  it('falls back to content when there is no header', () => {
    const csv = ['12/09/2026,NETFLIX.COM,-13.99', '13/09/2026,CONAD CITY,-22.10'].join('\n')
    const table = detectTable(parseCsvText(csv))
    const { drafts } = toDrafts(table)
    expect(drafts.map((d) => d.description)).toEqual(['NETFLIX.COM', 'CONAD CITY'])
  })
})

describe('categorize', () => {
  it.each([
    ['PAGAMENTO POS ESSELUNGA MILANO', -40, 'spesa'],
    ['PAGAMENTO CARTA UBER EATS', -20, 'delivery'],
    ['PAGAMENTO CARTA UBER TRIP', -12, 'trasporti'],
    ['PRELIEVO BANCOMAT ATM', -50, 'contanti'],
    ['PAGAMENTO BANCOMAT CONAD', -30, 'spesa'],
    ['ACCREDITO EMOLUMENTI', 2000, 'stipendio'],
    ['PAGAMENTO CARTA AMAZON MKTP IT', 25, 'rimborsi'],
    ['ADDEBITO SDD ENEL ENERGIA', -90, 'bollette'],
    ['PAGAMENTO CARTA Q8', -50, 'auto'],
    ['BONIFICO A FAVORE DI QUALCUNO', -100, 'altro'],
  ])('%s', (desc, amount, cat) => {
    expect(categorize(desc, amount)).toBe(cat)
  })

  it('user rules win', () => {
    expect(categorize('BONIFICO A FAVORE DI LUCA', -100, [{ id: '1', match: 'luca', category: 'regali' }])).toBe('regali')
  })

  it('cleans merchant names', () => {
    expect(merchantName('PAGAMENTO POS ESSELUNGA SPA 1234 MILANO')).toBe('Esselunga')
    expect(merchantName('PAGAMENTO POS 12/09 BAR CENTRALE CARTA N. ****1234')).toBe('Bar Centrale')
  })
})

describe('PDF lines', () => {
  const line = (y: number, items: [number, string][]): PdfLine => ({
    page: 1,
    y,
    items: items.map(([x, str]) => ({ x, w: str.length * 5, str })),
  })
  it('assigns sign from Dare/Avere column positions', () => {
    const lines = [
      line(700, [[40, 'Data'], [100, 'Descrizione'], [400, 'Dare'], [470, 'Avere'], [540, 'Saldo']]),
      line(680, [[40, '02/09/2026'], [100, 'PAGAMENTO POS ESSELUNGA'], [395, '45,20'], [535, '1.200,00']]),
      line(670, [[100, 'MILANO VIA TORINO']]),
      line(660, [[40, '27/08/2026'], [100, 'ACCREDITO STIPENDIO'], [462, '2.150,00'], [535, '1.245,20']]),
    ]
    const res = parsePdfLines(lines)
    expect(res.signSource).toBe('columns')
    expect(res.drafts.map((d) => d.amount)).toEqual([-45.2, 2150])
    expect(res.drafts[0].description).toBe('PAGAMENTO POS ESSELUNGA MILANO VIA TORINO')
  })
})

describe('PDF with vertically centered multi-line cells', () => {
  it('attaches wrapped description lines to the closest movement', () => {
    const l = (y: number, items: [number, string][]): PdfLine => ({ page: 1, y, items: items.map(([x, str]) => ({ x, w: str.length * 5, str })) })
    const lines = [
      l(761.1, [[29, 'Data'], [95, 'Valuta'], [161, 'Descrizione'], [435, 'Dare'], [481, 'Avere'], [534, 'Saldo']]),
      l(724.4, [[31, '05/09/2026 05/09/2026 ADDEBITO SDD NETFLIX.COM'], [429, '13,99'], [518, '1.940,81']]),
      l(704.9, [[31, '12/09/2026 12/09/2026 PAGAMENTO CARTA GLOVO'], [429, '22,50'], [518, '1.918,31']]),
      l(685.4, [[164, 'ACCREDITO EMOLUMENTI STIPENDIO ACME']]),
      l(678.6, [[31, '27/09/2026 27/09/2026 '], [465, '2.380,00 4.298,31']]),
      l(671.9, [[164, 'SRL']]),
      l(654.6, [[161, 'SALDO FINALE'], [520, '4.298,31']]),
    ]
    const res = parsePdfLines(lines)
    expect(res.drafts.map((d) => [d.description, d.amount])).toEqual([
      ['ADDEBITO SDD NETFLIX.COM', -13.99],
      ['PAGAMENTO CARTA GLOVO', -22.5],
      ['ACCREDITO EMOLUMENTI STIPENDIO ACME SRL', 2380],
    ])
  })
})

describe('demo analytics', () => {
  const demo = demoSnapshot()
  it('produces a year of data with positive savings', () => {
    const stats = monthlyStats(demo.transactions)
    expect(stats).toHaveLength(12)
    expect(stats[5].income).toBeGreaterThan(2000)
    expect(stats[5].expenses).toBeGreaterThan(1000)
  })
  it('finds the recurring charges', () => {
    const subs = detectSubscriptions(demo.transactions)
    const names = subs.map((s) => s.merchant)
    expect(names).toEqual(expect.arrayContaining(['Netflix', 'Spotify', 'Iliad']))
    expect(subs.find((s) => s.merchant === 'Netflix')?.priceChange).toBeDefined()
  })
  it('builds insights', () => {
    const insights = buildInsights(demo.transactions)
    expect(insights.length).toBeGreaterThan(4)
    expect(insights.some((i) => i.id === 'subs')).toBe(true)
  })
})
