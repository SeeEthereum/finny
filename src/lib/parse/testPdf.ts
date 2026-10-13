/**
 * Builds real PDF files in memory for the parser tests, with the quirks bank statements have:
 * landscape pages stored rotated, text placed one character at a time, monospace layouts
 * aligned with spaces, bold figures on a slightly different baseline. Test-only: the app never
 * imports it.
 */

export interface PdfText {
  /** left edge, in points from the left of the page as displayed */
  x: number
  /** baseline, in points from the top of the page as displayed */
  y: number
  text: string
  size?: number
  font?: 'regular' | 'bold' | 'mono'
  /** right-align the text so it ends at x */
  right?: boolean
  /** draw every character with its own positioning operator, as some report engines do */
  glyphs?: boolean
}

export interface PdfPage {
  texts: PdfText[]
  /** store the page portrait and rotate it 90° for display, like many landscape statements */
  landscape?: boolean
  /** draw a landscape layout sideways on a portrait page, without marking the page as rotated */
  sideways?: boolean
}

// Helvetica advance widths (1/1000 em) for the characters the fixtures use
const HELV: Record<string, number> = {
  ' ': 278, '!': 278, '"': 355, '#': 556, '%': 889, '&': 667, "'": 191, '(': 333, ')': 333, '*': 389, '+': 584,
  ',': 278, '-': 333, '.': 278, '/': 278, ':': 278, ';': 278, '?': 556, '@': 1015, '€': 556, '•': 350, '–': 556,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833, N: 722,
  O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556,
  o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  à: 556, è: 556, é: 556, ì: 278, ò: 556, ù: 556,
}
const WIN_ANSI: Record<string, number> = { '€': 0x80, '•': 0x95, '–': 0x96, à: 0xe0, è: 0xe8, é: 0xe9, ì: 0xec, ò: 0xf2, ù: 0xf9 }

function code(ch: string) {
  return WIN_ANSI[ch] ?? (ch.charCodeAt(0) < 128 ? ch.charCodeAt(0) : 63)
}

function advance(ch: string, font: PdfText['font']) {
  if (font === 'mono') return 600
  return HELV[ch] ?? (/\d/.test(ch) ? 556 : 556)
}

export function textWidth(text: string, size = 9, font: PdfText['font'] = 'regular') {
  return [...text].reduce((a, ch) => a + advance(ch, font), 0) * (size / 1000)
}

function literal(text: string) {
  let out = '('
  for (const ch of text) {
    const c = code(ch)
    if (ch === '(' || ch === ')' || ch === '\\') out += `\\${ch}`
    else if (c > 126) out += `\\${c.toString(8).padStart(3, '0')}`
    else out += String.fromCharCode(c)
  }
  return `${out})`
}

const fmt = (n: number) => (Math.round(n * 100) / 100).toString()

function show(t: PdfText, page: PdfPage, x: number, y: number, text: string) {
  const font = { regular: 'F1', bold: 'F2', mono: 'F3' }[t.font ?? 'regular']
  const size = t.size ?? 9
  // display point (x, y from top) → page space. Portrait pages are 595×842; landscape ones are
  // stored portrait with /Rotate 90, so the text runs along +y in page space.
  const m = page.landscape
    ? `0 1 -1 0 ${fmt(y)} ${fmt(x)}`
    : page.sideways
      ? `0 -1 1 0 ${fmt(595 - y)} ${fmt(842 - x)}`
      : `1 0 0 1 ${fmt(x)} ${fmt(842 - y)}`
  return `BT /${font} ${size} Tf ${m} Tm ${literal(text)} Tj ET`
}

function pageContent(page: PdfPage) {
  const ops: string[] = []
  for (const t of page.texts) {
    const size = t.size ?? 9
    const x0 = t.right ? t.x - textWidth(t.text, size, t.font) : t.x
    if (!t.glyphs) {
      ops.push(show(t, page, x0, t.y, t.text))
      continue
    }
    let x = x0
    for (const ch of t.text) {
      if (ch !== ' ') ops.push(show(t, page, x, t.y, ch))
      x += advance(ch, t.font) * (size / 1000)
    }
  }
  return ops.join('\n')
}

function widthsArray(font: PdfText['font']) {
  const out: number[] = []
  for (let c = 32; c <= 255; c++) {
    const ch = Object.entries(WIN_ANSI).find(([, v]) => v === c)?.[0] ?? String.fromCharCode(c)
    out.push(advance(ch, font))
  }
  return out.join(' ')
}

/** A complete PDF file (bytes), one entry per page */
export function makePdf(pages: PdfPage[]): Uint8Array {
  const objects: string[] = []
  const font = (base: string, f: PdfText['font']) =>
    `<< /Type /Font /Subtype /Type1 /BaseFont /${base} /Encoding /WinAnsiEncoding /FirstChar 32 /LastChar 255 /Widths [${widthsArray(f)}] >>`
  objects.push('<< /Type /Catalog /Pages 2 0 R >>')
  objects.push('') // pages, filled below
  objects.push(font('Helvetica', 'regular'), font('Helvetica-Bold', 'bold'), font('Courier', 'mono'))
  const kids: number[] = []
  for (const page of pages) {
    const content = pageContent(page)
    const contentId = objects.length + 2
    const pageId = objects.length + 1
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842]${page.landscape ? ' /Rotate 90' : ''} /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentId} 0 R >>`,
    )
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
    kids.push(pageId)
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`

  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((o, i) => {
    offsets.push(body.length)
    body += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) body += `${String(off).padStart(10, '0')} 00000 n \n`
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  // every character is below 256 (content streams use octal escapes), so this is a byte-for-byte copy
  return Uint8Array.from(body, (c) => c.charCodeAt(0))
}
