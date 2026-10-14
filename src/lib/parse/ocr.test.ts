import { describe, expect, it } from 'vitest'
import { wordsToItems, type OcrLine } from './ocr'
import { pageLines, parsePdfLines } from './pdf'

/*
 * What Tesseract returns for a scanned page, in pixels at 3× (216 dpi), turned into the
 * reader's lines. The scan is tilted by 1°: the amount column, which Tesseract reports as a
 * separate line, sits several pixels lower than the start of its row.
 */
const SCALE = 3
const TILT = Math.tan((1 * Math.PI) / 180)

function line(words: [number, string][], y: number, confidence = 90): OcrLine {
  const ws = words.map(([x, text]) => {
    const w = text.length * 15
    const base = y + TILT * x
    return { text, confidence, bbox: { x0: x, y0: base - 26, x1: x + w, y1: base + 4 } }
  })
  const x0 = ws[0].bbox.x0
  const x1 = ws[ws.length - 1].bbox.x1
  return { bbox: { x0, y0: y - 26, x1, y1: y + 4 }, baseline: { x0, y0: y + TILT * x0, x1, y1: y + TILT * x1 }, rowAttributes: { rowHeight: 34 }, words: ws }
}

describe('OCR words to statement lines', () => {
  it('straightens a tilted scan, joins the columns of each row and fixes O/0 in figures', () => {
    const rows = [
      line([[120, 'Data'], [300, 'Descrizione']], 300),
      line([[1260, 'Addebiti']], 300),
      line([[1500, 'Accrediti']], 300),
      // on a blurry photo the gap between two words can shrink to almost nothing
      line([[120, '02/01/2026'], [300, 'PAGAMENTO'], [436, 'POS'], [482, 'ESSELUNGA']], 360),
      line([[1300, '45,2O']], 360),
      line([[120, '27/01/2026'], [300, 'ACCREDITO'], [460, 'STIPENDIO']], 420),
      line([[1520, '2.38O,00']], 420),
      line([[120, '|'], [300, '___']], 450, 40),
      line([[120, '28/01/2026'], [300, 'PAGAMENTO'], [460, 'POS'], [530, 'GLOVO']], 480),
      line([[1300, '22,50']], 480),
    ]
    const items = wordsToItems(rows, SCALE)
    expect(items.some((i) => i.str === '|' || i.str === '___')).toBe(false)
    const lines = pageLines(items, { transform: [1, 0, 0, 1, 0, 0], height: 842 }, 1)
    const res = parsePdfLines(lines, 1)
    expect(res.signSource).toBe('columns')
    expect(res.drafts.map((d) => [d.date, d.description, d.amount])).toEqual([
      ['2026-01-02', 'PAGAMENTO POS ESSELUNGA', -45.2],
      ['2026-01-27', 'ACCREDITO STIPENDIO', 2380],
      ['2026-01-28', 'PAGAMENTO POS GLOVO', -22.5],
    ])
  })
})
