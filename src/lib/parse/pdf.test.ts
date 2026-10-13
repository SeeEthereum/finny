import { describe, expect, it } from 'vitest'
import { linesFromDocument, parsePdfLines, type PdfResult } from './pdf'
import { makePdf, textWidth, type PdfPage, type PdfText } from './testPdf'

/*
 * Real PDF files, built in memory and read back through pdf.js, laid out the way different
 * banks print their statements. Names and amounts are invented.
 */

const MOVES: [string, string, number, string?][] = [
  ['2026-01-02', 'PAGAMENTO POS ESSELUNGA', -45.2, 'MILANO VIA TORINO'],
  ['2026-01-03', 'ADDEBITO SDD NETFLIX.COM', -13.99],
  ['2026-01-05', 'BONIFICO A FAVORE DI LUCIA BIANCHI', -150, 'AFFITTO GENNAIO'],
  ['2026-01-07', 'PRELIEVO BANCOMAT', -50],
  ['2026-01-10', 'PAGAMENTO POS BAR CENTRALE', -4.5],
  ['2026-01-10', 'PAGAMENTO POS EDICOLA', -3.2],
  ['2026-01-12', 'RIMBORSO AMAZON', 23.99],
  ['2026-01-15', 'PAGAMENTO POS CONAD', -61.86],
  ['2026-01-20', 'ADDEBITO SDD ENEL ENERGIA', -141.28],
  ['2026-01-27', 'ACCREDITO STIPENDIO ACME SRL', 2380, 'CEDOLINO DICEMBRE'],
  ['2026-01-28', 'PAGAMENTO POS GLOVO', -22.5],
  ['2026-01-30', 'CANONE MENSILE CONTO', -3],
  ['2026-02-02', 'PAGAMENTO POS LIDL', -38.4],
  ['2026-02-03', 'ADDEBITO SDD SPOTIFY', -11.99],
  ['2026-02-05', 'BONIFICO DA MARIO ROSSI', 75],
  ['2026-02-09', 'PAGAMENTO POS FARMACIA SAN BABILA', -21.24],
  ['2026-02-11', 'PAGAMENTO POS Q8 CARBURANTE', -60],
  ['2026-02-14', 'PAGAMENTO POS RISTORANTE DA MARIO', -86.5],
  ['2026-02-14', 'PAGAMENTO POS GELATERIA', -7],
  ['2026-02-18', 'ADDEBITO SDD ILIAD', -9.99],
  ['2026-02-21', 'PAGAMENTO POS ZALANDO', -1249.9],
  ['2026-02-26', 'ACCREDITO STIPENDIO ACME SRL', 2380],
  ['2026-02-27', 'PAGAMENTO POS CARREFOUR', -59.9],
]
const OPENING = 1250
const balances = MOVES.reduce<number[]>((acc, [, , a]) => [...acc, Math.round(((acc[acc.length - 1] ?? OPENING) + a) * 100) / 100], [])
const CLOSING = balances[balances.length - 1]

const it2 = (n: number) => `${Math.abs(n).toFixed(2).split('.')[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${Math.abs(n).toFixed(2).split('.')[1]}`
const en2 = (n: number) => `${Math.abs(n).toFixed(2).split('.')[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${Math.abs(n).toFixed(2).split('.')[1]}`
const dmy = (iso: string, sep = '.', short = false) => `${iso.slice(8, 10)}${sep}${iso.slice(5, 7)}${sep}${short ? iso.slice(2, 4) : iso.slice(0, 4)}`
const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
const DAYS = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato']

async function read(pages: PdfPage[]): Promise<PdfResult> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: makePdf(pages) }).promise
  return parsePdfLines(await linesFromDocument(doc), doc.numPages)
}

/** Rows laid out top to bottom, starting a new page (with its header) when the page is full */
function paginate(header: (y: number) => PdfText[], rows: ((y: number) => { texts: PdfText[]; height: number })[], first: PdfText[] = [], opts: { top?: number; bottom?: number; landscape?: boolean } = {}) {
  const top = opts.top ?? 200
  const bottom = opts.bottom ?? 780
  const pages: PdfPage[] = [{ texts: [...first, ...header(top)], landscape: opts.landscape }]
  let y = top + 22
  for (const row of rows) {
    let r = row(y)
    if (y + r.height > bottom) {
      pages.push({ texts: header(60), landscape: opts.landscape })
      y = 82
      r = row(y)
    }
    pages[pages.length - 1].texts.push(...r.texts)
    y += r.height
  }
  return { pages, y, last: pages[pages.length - 1] }
}

const expected = MOVES.map(([d, , a]) => [d, a])

describe('Italian bank, Dare/Avere columns (Intesa-style)', () => {
  const build = (glyphs = false) => {
    const t = (x: number, y: number, text: string, more: Partial<PdfText> = {}): PdfText => ({ x, y, text, glyphs, ...more })
    const header = (y: number) => [
      t(40, y, 'Data', { font: 'bold' }), t(95, y, 'Valuta', { font: 'bold' }), t(150, y, 'Descrizione operazione', { font: 'bold' }),
      t(470, y, 'Addebiti', { font: 'bold', right: true }), t(550, y, 'Accrediti', { font: 'bold', right: true }),
    ]
    const first = [
      t(40, 40, 'Intesa Sanpaolo', { font: 'bold', size: 14 }),
      t(40, 70, 'MARIO ROSSI'),
      t(40, 84, 'VIA ROMA 1, 20100 MILANO'),
      t(40, 110, 'ESTRATTO CONTO AL 28.02.2026', { font: 'bold' }),
      t(40, 124, 'Periodo dal 01.01.2026 al 28.02.2026'),
      t(40, 145, 'Saldo iniziale'), t(550, 145, it2(OPENING), { right: true }),
      t(40, 159, 'Totale addebiti'), t(550, 159, it2(MOVES.filter((m) => m[2] < 0).reduce((s, m) => s - m[2], 0)), { right: true }),
      t(40, 173, 'Saldo finale'), t(550, 173, it2(CLOSING), { right: true }),
    ]
    const rows = MOVES.map(([d, desc, a, detail]) => (y: number) => ({
      texts: [
        t(40, y, dmy(d)), t(95, y, dmy(d)), t(150, y, desc),
        t(a < 0 ? 470 : 550, y, it2(a), { right: true }),
        ...(detail ? [t(150, y + 10, detail, { size: 8 })] : []),
      ],
      height: detail ? 26 : 16,
    }))
    const { pages, y, last } = paginate(header, rows, first, { bottom: 520 })
    last.texts.push(t(150, y + 4, 'SALDO FINALE', { font: 'bold' }), t(550, y + 4, it2(CLOSING), { font: 'bold', right: true }))
    return pages
  }

  it('reads every movement with the right sign, details and the totals check', async () => {
    const res = await read(build())
    expect(res.pages).toBe(2)
    expect(res.drafts.map((d) => [d.date, d.amount])).toEqual(expected)
    expect(res.signSource).toBe('columns')
    expect(res.check).toMatchObject({ how: 'saldi', ok: true, opening: OPENING, closing: CLOSING })
    expect(res.drafts[0]).toMatchObject({ description: 'PAGAMENTO POS ESSELUNGA', detail: 'MILANO VIA TORINO' })
    expect(res.drafts[9]).toMatchObject({ description: 'ACCREDITO STIPENDIO ACME SRL', detail: 'CEDOLINO DICEMBRE' })
    expect(res.institution).toBe('Intesa Sanpaolo')
    expect(res.holder).toBe('MARIO ROSSI')
  })

  it('reads the same statement when every character is placed on its own', async () => {
    const res = await read(build(true))
    expect(res.drafts.map((d) => [d.date, d.amount])).toEqual(expected)
    expect(res.drafts[0].description).toBe('PAGAMENTO POS ESSELUNGA')
    expect(res.check?.ok).toBe(true)
  })
})

describe('BancoPosta-style: two-line headers, amounts before the description, short years', () => {
  it('reads it', async () => {
    const t = (x: number, y: number, text: string, more: Partial<PdfText> = {}): PdfText => ({ x, y, text, size: 8, ...more })
    const header = (y: number) => [
      t(40, y - 9, 'DATA', { font: 'bold' }), t(40, y, 'CONTABILE', { font: 'bold' }),
      t(95, y - 9, 'DATA', { font: 'bold' }), t(95, y, 'VALUTA', { font: 'bold' }),
      t(205, y, 'ADDEBITI', { font: 'bold', right: true }), t(270, y, 'ACCREDITI', { font: 'bold', right: true }),
      t(290, y, 'DESCRIZIONE OPERAZIONI', { font: 'bold' }),
    ]
    const rows = [
      (y: number) => ({ texts: [t(290, y, 'SALDO INIZIALE'), t(270, y, it2(OPENING), { right: true })], height: 14 }),
      ...MOVES.map(([d, desc, a]) => (y: number) => ({
        texts: [t(40, y, dmy(d, '/', true)), t(95, y, dmy(d, '/', true)), t(a < 0 ? 205 : 270, y, it2(a), { right: true }), t(290, y, desc)],
        height: 14,
      })),
    ]
    const { pages, y, last } = paginate(header, rows, [t(40, 50, 'BancoPosta', { size: 14, font: 'bold' }), t(40, 80, 'ESTRATTO CONTO N. 2 DEL 28/02/26')])
    last.texts.push(t(290, y, 'SALDO FINALE'), t(270, y, it2(CLOSING), { right: true }), t(500, 810, 'Pagina 1 di 1'))
    const res = await read(pages)
    expect(res.drafts.map((d) => [d.date, d.amount])).toEqual(expected)
    expect(res.drafts[2].description).toBe('BONIFICO A FAVORE DI LUCIA BIANCHI')
    expect(res.check).toMatchObject({ how: 'saldi', ok: true })
    expect(res.institution).toBe('BancoPosta')
  })
})

describe('UniCredit-style: newest first, with a running balance', () => {
  const build = (landscape: boolean) => {
    const w = landscape ? 1.35 : 1
    const t = (x: number, y: number, text: string, more: Partial<PdfText> = {}): PdfText => ({ x: x * w, y, text, size: 8.5, ...more })
    const header = (y: number) => [
      t(40, y, 'Data Registrazione', { font: 'bold' }), t(125, y, 'Data Valuta', { font: 'bold' }), t(200, y, 'Descrizione', { font: 'bold' }),
      t(440, y, 'Uscite', { font: 'bold', right: true }), t(495, y, 'Entrate', { font: 'bold', right: true }), t(560, y, 'Saldo', { font: 'bold', right: true }),
    ]
    const rows = MOVES.map((m, i) => ({ m, bal: balances[i] }))
      .reverse()
      .map(({ m: [d, desc, a], bal }) => (y: number) => ({
        texts: [t(40, y, dmy(d, '/')), t(125, y, dmy(d, '/')), t(200, y, desc), t(a < 0 ? 440 : 495, y, it2(a), { right: true }), t(560, y, it2(bal), { right: true })],
        height: 15,
      }))
    return paginate(header, rows, [t(40, 50, 'UniCredit', { size: 14, font: 'bold' })], { top: 120, bottom: landscape ? 400 : 780, landscape }).pages
  }

  it('reads it, checks every running balance and finds the closing balance at the top', async () => {
    const res = await read(build(false))
    expect(res.drafts.map((d) => [d.date, d.amount])).toEqual([...expected].reverse())
    expect(res.check).toMatchObject({ how: 'colonna', ok: true, matched: MOVES.length - 1, total: MOVES.length - 1 })
    expect(res.latestBalance).toEqual({ amount: CLOSING, date: '2026-02-27' })
  })

  it('reads a landscape page stored rotated', async () => {
    const res = await read(build(true))
    expect(res.pages).toBeGreaterThan(1)
    expect(res.drafts.map((d) => [d.date, d.amount])).toEqual([...expected].reverse())
    expect(res.check?.ok).toBe(true)
  })
})

describe('N26-style: description first, date in the middle, signed amounts', () => {
  it('reads it', async () => {
    const t = (x: number, y: number, text: string, more: Partial<PdfText> = {}): PdfText => ({ x, y, text, ...more })
    const header = (y: number) => [t(40, y, 'Descrizione', { font: 'bold' }), t(330, y, 'Data di registrazione', { font: 'bold' }), t(555, y, 'Importo', { font: 'bold', right: true })]
    const rows = MOVES.map(([d, desc, a]) => (y: number) => ({
      texts: [
        t(40, y, desc.replace(/^PAGAMENTO POS |^ADDEBITO SDD /, '')), t(330, y, dmy(d)), t(555, y, `${a < 0 ? '-' : '+'}${it2(a)}€`, { right: true }),
        t(40, y + 10, `Mastercard • ${a < 0 ? 'Spese' : 'Entrate'}`, { size: 7 }),
        t(40, y + 19, `Data valuta ${dmy(d)}`, { size: 7 }),
      ],
      height: 32,
    }))
    const { pages } = paginate(header, rows, [t(40, 50, 'N26', { size: 16, font: 'bold' }), t(40, 80, 'Estratto conto 01.01.2026 - 28.02.2026')], { top: 110 })
    const res = await read(pages)
    expect(res.drafts.map((d) => [d.date, d.amount])).toEqual(expected)
    expect(res.signSource).toBe('explicit')
    expect(res.drafts[0]).toMatchObject({ description: 'ESSELUNGA', detail: 'Mastercard • Spese · Data valuta 02.01.2026' })
  })
})

describe('app-style statement: movements grouped under the day', () => {
  it('reads it, ignoring the daily totals next to each day', async () => {
    const t = (x: number, y: number, text: string, more: Partial<PdfText> = {}): PdfText => ({ x, y, text, ...more })
    const days = [...new Set(MOVES.map((m) => m[0]))]
    const rows = days.flatMap((d) => {
      const items = MOVES.filter((m) => m[0] === d)
      const date = new Date(`${d}T12:00:00Z`)
      const heading = `${DAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
      const total = items.reduce((s, m) => s + m[2], 0)
      return [
        (y: number) => ({ texts: [t(40, y + 6, heading, { font: 'bold', size: 10 }), t(555, y + 6, `${total < 0 ? '-' : '+'}${it2(total)} €`, { font: 'bold', size: 10, right: true })], height: 22 }),
        ...items.map(([, desc, a], k) => (y: number) => ({
          texts: [
            t(40, y, `${9 + k}:3${k}`, { size: 8 }), t(80, y, desc.replace(/^PAGAMENTO POS |^ADDEBITO SDD /, '')), t(330, y, a < 0 ? 'Pagamento' : 'Accredito', { size: 8 }),
            t(555, y, `${a < 0 ? '-' : '+'}${it2(a)} €`, { right: true }),
          ],
          height: 15,
        })),
      ]
    })
    const res = await read(paginate(() => [], rows, [t(40, 50, 'Hype', { size: 16, font: 'bold' }), t(40, 80, 'Lista movimenti')], { top: 100 }).pages)
    expect(res.layout).toBe('grouped')
    expect(res.drafts.map((d) => [d.date, d.amount])).toEqual(expected)
    expect(res.drafts[4].description).toMatch(/^BAR CENTRALE/)
  })
})

describe('English statement with ISO dates and Paid out / Paid in / Balance', () => {
  it('reads it and checks opening + movements = closing', async () => {
    const t = (x: number, y: number, text: string, more: Partial<PdfText> = {}): PdfText => ({ x, y, text, ...more })
    const header = (y: number) => [
      t(40, y, 'Date', { font: 'bold' }), t(110, y, 'Description', { font: 'bold' }), t(420, y, 'Paid out', { font: 'bold', right: true }),
      t(485, y, 'Paid in', { font: 'bold', right: true }), t(555, y, 'Balance', { font: 'bold', right: true }),
    ]
    const rows = [
      (y: number) => ({ texts: [t(110, y, 'Opening balance'), t(555, y, en2(OPENING), { right: true })], height: 15 }),
      ...MOVES.map(([d, desc, a], i) => (y: number) => ({
        texts: [t(40, y, d), t(110, y, desc), t(a < 0 ? 420 : 485, y, en2(a), { right: true }), t(555, y, en2(balances[i]), { right: true })],
        height: 15,
      })),
    ]
    const { pages, y, last } = paginate(header, rows, [t(40, 50, 'Account statement', { size: 16, font: 'bold' })], { top: 100 })
    last.texts.push(t(110, y, 'Closing balance'), t(555, y, en2(CLOSING), { right: true }))
    const res = await read(pages)
    expect(res.drafts.map((d) => [d.date, d.amount])).toEqual(expected)
    expect(res.check).toMatchObject({ how: 'saldi', ok: true, opening: OPENING, closing: CLOSING })
  })
})

describe('bold amounts on a shifted baseline, and an amount on the second line of a row', () => {
  it('reads it', async () => {
    const t = (x: number, y: number, text: string, more: Partial<PdfText> = {}): PdfText => ({ x, y, text, size: 8, ...more })
    const header = (y: number) => [t(40, y, 'Data'), t(100, y, 'Descrizione'), t(470, y, 'Dare', { right: true }), t(550, y, 'Avere', { right: true })]
    const rows = MOVES.map(([d, desc, a], i) => (y: number) =>
      i === 2
        ? // the description wraps and the amount sits on its last line
          { texts: [t(40, y, dmy(d, '/')), t(100, y, 'BONIFICO A FAVORE DI'), t(100, y + 10, 'LUCIA BIANCHI'), t(470, y + 10, it2(a), { right: true, font: 'bold', size: 9.5 })], height: 26 }
        : { texts: [t(40, y, dmy(d, '/')), t(100, y, desc), t(a < 0 ? 470 : 550, y - 1.4, it2(a), { right: true, font: 'bold', size: 10 })], height: 15 },
    )
    const res = await read(paginate(header, rows).pages)
    expect(res.drafts.map((d) => [d.date, d.amount])).toEqual(expected)
    expect(res.drafts[2].description).toBe('BONIFICO A FAVORE DI LUCIA BIANCHI')
  })
})

describe('monospace statement aligned with spaces', () => {
  it('reads it', async () => {
    const pad = (s: string, n: number) => s.slice(0, n).padEnd(n)
    const line = (y: number, s: string): PdfText => ({ x: 30, y, text: s, font: 'mono', size: 7.5 })
    const header = (y: number) => [line(y, `${pad('DATA', 10)}${pad('VALUTA', 10)}${pad('DESCRIZIONE', 44)}${'DARE'.padStart(12)}${'AVERE'.padStart(12)}`)]
    const rows = MOVES.map(([d, desc, a]) => (y: number) => ({
      texts: [line(y, `${pad(dmy(d, '/', true), 10)}${pad(dmy(d, '/', true), 10)}${pad(desc, 44)}${(a < 0 ? it2(a) : '').padStart(12)}${(a > 0 ? it2(a) : '').padStart(12)}`)],
      height: 11,
    }))
    const res = await read(paginate(header, rows).pages)
    expect(res.drafts.map((d) => [d.date, d.amount])).toEqual(expected)
    expect(res.signSource).toBe('columns')
    expect(res.drafts[8].description).toBe('ADDEBITO SDD ENEL ENERGIA')
  })
})

describe('amounts marked D / C instead of columns', () => {
  it('reads it', async () => {
    const t = (x: number, y: number, text: string, more: Partial<PdfText> = {}): PdfText => ({ x, y, text, ...more })
    const rows = MOVES.map(([d, desc, a]) => (y: number) => ({
      texts: [t(40, y, dmy(d, '/')), t(110, y, desc), t(555, y, `${it2(a)} ${a < 0 ? 'D' : 'C'}`, { right: true })],
      height: 15,
    }))
    const res = await read(paginate(() => [t(40, 180, 'Movimenti del periodo', { font: 'bold' })], rows).pages)
    expect(res.drafts.map((d) => [d.date, d.amount])).toEqual(expected)
    expect(res.signSource).toBe('explicit')
  })
})

describe('date printed only on the first movement of the day', () => {
  it('gives the following lines the same day', async () => {
    const t = (x: number, y: number, text: string, more: Partial<PdfText> = {}): PdfText => ({ x, y, text, ...more })
    const header = (y: number) => [t(40, y, 'Data'), t(110, y, 'Descrizione'), t(470, y, 'Uscite', { right: true }), t(550, y, 'Entrate', { right: true })]
    const rows = MOVES.map(([d, desc, a], i) => (y: number) => ({
      texts: [...(i > 0 && MOVES[i - 1][0] === d ? [] : [t(40, y, dmy(d, '/'))]), t(110, y, desc), t(a < 0 ? 470 : 550, y, it2(a), { right: true })],
      height: 15,
    }))
    const res = await read(paginate(header, rows).pages)
    expect(res.drafts.map((d) => [d.date, d.amount])).toEqual(expected)
    expect(res.drafts[5].description).toBe('PAGAMENTO POS EDICOLA')
  })
})

describe('a landscape table drawn sideways on a portrait page', () => {
  it('turns it upright', async () => {
    const t = (x: number, y: number, text: string, more: Partial<PdfText> = {}): PdfText => ({ x, y, text, ...more })
    const rows = MOVES.map(([d, desc, a]) => (y: number) => ({
      texts: [t(40, y, dmy(d)), t(130, y, desc), t(640, y, it2(a), { right: true }), t(700, y, a < 0 ? 'D' : 'A')],
      height: 15,
    }))
    const header = (y: number) => [t(40, y, 'Data'), t(130, y, 'Descrizione'), t(640, y, 'Importo', { right: true }), t(700, y, 'Segno')]
    const { pages } = paginate(header, rows, [t(40, 50, 'Lista movimenti', { size: 14 })], { top: 100, bottom: 560 })
    const res = await read(pages.map((p) => ({ ...p, sideways: true })))
    expect(res.drafts.map((d) => [d.date, d.amount])).toEqual(expected)
    expect(res.signSource).toBe('explicit')
  })
})

describe('label and value printouts (receipts, movements printed from the website)', () => {
  it('reads them on one line or spread over several lines', async () => {
    const t = (x: number, y: number, text: string): PdfText => ({ x, y, text })
    const res = await read([
      {
        texts: [
          t(28, 40, 'Estratto conto'),
          t(28, 69, 'Data 02/09/2026 Descrizione POS Esselunga Importo 45,20'),
          t(28, 84, 'Data 27/09/2026 Descrizione Accredito stipendio Importo +2.380,00'),
          t(28, 120, 'Data operazione: 28/09/2026'),
          t(28, 134, 'Data valuta: 29/09/2026'),
          t(28, 148, 'Causale: Pagamento Glovo'),
          t(28, 162, 'Importo: -18,90 EUR'),
        ],
      },
    ])
    expect(res.layout).toBe('labeled')
    expect(res.drafts.map((d) => [d.date, d.description, d.amount])).toEqual([
      ['2026-09-02', 'POS Esselunga', -45.2],
      ['2026-09-27', 'Accredito stipendio', 2380],
      ['2026-09-28', 'Pagamento Glovo', -18.9],
    ])
  })
})

describe('a PDF that is not a statement', () => {
  it('finds nothing and says what it saw', async () => {
    const res = await read([{ texts: [{ x: 40, y: 60, text: 'Gentile cliente, le comunichiamo le nuove condizioni.' }, { x: 40, y: 80, text: 'Cordiali saluti' }] }])
    expect(res.drafts).toHaveLength(0)
    expect(res.stats).toMatchObject({ lines: 2, dated: 0, withAmount: 0 })
    expect(textWidth('ab')).toBeGreaterThan(0)
  })
})
