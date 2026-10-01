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
    expect(res.drafts[0].description).toBe('PAGAMENTO POS ESSELUNGA')
    expect(res.drafts[0].detail).toBe('MILANO VIA TORINO')
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

describe('PDF formats seen on real statements', () => {
  const l = (y: number, items: [number, string][], page = 1): PdfLine => ({ page, y, items: items.map(([x, str]) => ({ x, w: str.length * 5, str })) })

  it('reads dates without a year using the statement period', () => {
    const res = parsePdfLines([
      l(800, [[30, 'Estratto conto dal 01/12/2025 al 31/01/2026']]),
      l(760, [[30, 'Data'], [90, 'Valuta'], [160, 'Descrizione'], [430, 'Dare'], [480, 'Avere']]),
      l(740, [[30, '28/12'], [90, '28/12'], [160, 'PAGAMENTO POS CONAD'], [425, '32,40']]),
      l(720, [[30, '27/01'], [90, '27/01'], [160, 'ACCREDITO STIPENDIO'], [475, '2.380,00']]),
    ])
    expect(res.drafts.map((d) => [d.date, d.amount])).toEqual([
      ['2025-12-28', -32.4],
      ['2026-01-27', 2380],
    ])
  })

  it('reads month names, euro signs and amounts glued to the description', () => {
    const res = parsePdfLines([
      l(740, [[30, '2 set 2026 Esselunga Milano -45,20 €']]),
      l(720, [[30, '27 set 2026 Stipendio ACME +2.380,00 €']]),
      l(700, [[30, '28 set 2026'], [120, 'Glovo'], [400, '€ -18,90']]),
    ])
    expect(res.signSource).toBe('explicit')
    expect(res.drafts.map((d) => [d.date, d.description, d.amount])).toEqual([
      ['2026-09-02', 'Esselunga Milano', -45.2],
      ['2026-09-27', 'Stipendio ACME', 2380],
      ['2026-09-28', 'Glovo', -18.9],
    ])
  })

  it('ignores times and numbers inside the description', () => {
    const res = parsePdfLines([
      l(760, [[30, 'Data'], [160, 'Descrizione'], [430, 'Uscite'], [480, 'Entrate'], [540, 'Saldo']]),
      l(740, [[30, '02.09.26'], [160, 'PAGAMENTO POS ORE 12.30 BAR 4,50'], [425, '4,50'], [535, '995,50']]),
    ])
    expect(res.drafts.map((d) => d.amount)).toEqual([-4.5])
  })
})

describe('Revolut-style statement', () => {
  // invented names and amounts, laid out like a Revolut "Estratto conto" PDF
  const l = (page: number, y: number, items: [number, string][]): PdfLine => ({ page, y, items: items.map(([x, str]) => ({ x, w: str.length * 4.5, str })) })
  const lines: PdfLine[] = [
    l(1, 689, [[40, 'MARIO ALBERTO ROSSI']]),
    l(1, 337, [[43, 'Prodotto'], [253, 'Saldo iniziale'], [335, 'Denaro in uscita'], [417, 'Denaro in entrata']]),
    l(1, 210, [[40, 'In sospeso da 1 gennaio 2026 a 1 ottobre 2026']]),
    l(1, 184, [[43, "Data d'inizio"], [125, 'Descrizione'], [335, 'Denaro in uscita'], [417, 'Denaro in entrata']]),
    l(1, 165, [[43, '30 set 2026'], [125, 'Bar Centrale'], [335, '1,00€']]),
    l(1, 157, [[125, 'ID transazione: 6abc511e']]),
    l(2, 462, [[40, 'Transazioni del conto dal giorno 1 gennaio 2026 al giorno 1 ottobre 2026']]),
    l(2, 436, [[43, 'Data'], [125, 'Descrizione'], [335, 'Denaro in uscita'], [417, 'Denaro in entrata'], [535, 'Saldo']]),
    l(2, 416, [[43, '4 gen 2026'], [125, 'Pagamento da ACME SRL'], [417, '1.500,00€'], [519, '1.500,21€']]),
    l(2, 409, [[125, 'Riferimento: Cedolino dicembre']]),
    l(2, 404, [[125, 'ID transazione: 695a70ae']]),
    l(2, 399, [[125, 'Da: ACME SRL, IT00X0000000000000000000000']]),
    l(2, 382, [[43, '4 gen 2026'], [125, 'To Mario Alberto Rossi'], [335, '150,00€'], [519, '1.350,21€']]),
    l(2, 375, [[125, 'Riferimento: Altro conto']]),
    l(2, 369, [[125, 'ID transazione: 695a732c']]),
    l(2, 347, [[43, '5 gen 2026'], [125, 'Pagamento a favore di LUCIA BIANCHI'], [335, '20,00€'], [519, '1.330,21€']]),
    l(2, 340, [[125, 'ID transazione: 695d62f0']]),
    l(2, 318, [[43, '6 gen 2026'], [125, 'Netflix'], [335, '13,99€'], [519, '1.316,22€']]),
    l(2, 311, [[125, 'ID transazione: 695d6303']]),
    l(2, 306, [[125, 'A: Netflix.com, Amsterdam']]),
    l(2, 300, [[125, 'Carta: 400000******0000']]),
    l(2, 283, [[43, '6 gen 2026'], [125, 'Netflix'], [335, '13,99€'], [519, '1.302,23€']]),
    l(2, 276, [[125, 'ID transazione: 695d6999']]),
    l(3, 477, [[40, 'Transazioni stornate dal giorno 1 gennaio 2026 al giorno 1 ottobre 2026']]),
    l(3, 432, [[43, '21 apr 2026'], [125, 'Spotify'], [335, '1,01€']]),
  ]
  const res = parsePdfLines(lines, 3)

  it('reads the columns, the sections, the holder and the closing balance', () => {
    expect(res.signSource).toBe('columns')
    expect(res.holder).toBe('MARIO ALBERTO ROSSI')
    expect(res.sections.map((s) => [s.name, s.count, s.includeByDefault])).toEqual([
      ['In sospeso', 1, false],
      ['Transazioni del conto', 5, true],
      ['Transazioni stornate', 1, false],
    ])
    expect(res.latestBalance).toEqual({ amount: 1302.23, date: '2026-01-06' })
    const main = res.drafts.filter((d) => d.section === 'Transazioni del conto')
    expect(main.map((d) => d.amount)).toEqual([1500, -150, -20, -13.99, -13.99])
    expect(main[0].detail).toBe('Cedolino dicembre · ACME SRL, IT00X0000000000000000000000')
    expect(main[3].detail).toBe('Netflix.com, Amsterdam')
  })

  it('imports identical rows, spots own-account transfers, salary and payments to people', async () => {
    const { useFinny } = await import('../store/useFinny')
    const main = res.drafts.filter((d) => d.section === 'Transazioni del conto')
    const out = useFinny.getState().importDrafts({ accountName: 'Test', institution: 'Revolut', source: 'pdf', drafts: main, holder: res.holder })
    expect(out).toMatchObject({ added: 5, duplicates: 0 })
    const cats = useFinny.getState().transactions.filter((t) => t.accountId === out.accountId).map((t) => [t.merchant, t.category])
    expect(cats).toEqual(expect.arrayContaining([
      ['Acme Srl', 'stipendio'],
      ['Mario Alberto Rossi', 'trasferimenti'],
      ['Lucia Bianchi', 'persone'],
      ['Netflix', 'abbonamenti'],
    ]))
    // importing the same file again adds nothing
    const again = useFinny.getState().importDrafts({ accountId: out.accountId, accountName: 'Test', institution: 'Revolut', source: 'pdf', drafts: main, holder: res.holder })
    expect(again).toMatchObject({ added: 0, duplicates: 5, replaced: 0 })
  })

  it('replaces a period imported badly before instead of adding to it', async () => {
    const { useFinny } = await import('../store/useFinny')
    const main = res.drafts.filter((d) => d.section === 'Transazioni del conto')
    // what an older, broken import left behind: wrong signs, one row outside the period
    const bad = main.map((d) => ({ ...d, amount: -Math.abs(d.amount), description: `${d.description} ID transazione: x` }))
    const first = useFinny.getState().importDrafts({ accountName: 'Vecchio', institution: '', source: 'pdf', drafts: [...bad, { ...bad[0], key: 'old', date: '2025-12-31' }] })
    const fixed = useFinny.getState().importDrafts({
      accountId: first.accountId, accountName: 'Vecchio', institution: 'Revolut', source: 'pdf', drafts: main, holder: res.holder,
      balance: res.latestBalance, replaceRange: { from: '2026-01-04', to: '2026-01-06' },
    })
    expect(fixed).toMatchObject({ added: 5, duplicates: 0, replaced: 5 })
    const state = useFinny.getState()
    const mine = state.transactions.filter((t) => t.accountId === first.accountId)
    expect(mine).toHaveLength(6) // 5 correct rows + the one outside the replaced period
    expect(mine.filter((t) => t.date >= '2026-01-04').reduce((a, t) => a + t.amount, 0)).toBeCloseTo(1500 - 150 - 20 - 13.99 - 13.99, 2)
    const acc = state.accounts.find((a) => a.id === first.accountId)!
    expect(acc.balance).toEqual({ amount: 1302.23, date: '2026-01-06' })
    expect(acc.institution).toBe('Revolut')
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
