import type { RawTextItem } from './pdf'

/*
 * Optical character recognition for scanned statements and photos, with Tesseract running
 * in a worker inside the browser: the image never leaves the device. The engine (~3 MB) and
 * the Italian model (~1.7 MB) are served from this site and only downloaded the first time
 * an image needs reading; the model is then cached by the browser.
 */

interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** The parts of a Tesseract line this reader uses */
export interface OcrLine {
  bbox: Box
  baseline: Box
  rowAttributes?: { rowHeight: number }
  words: { text: string; confidence: number; bbox: Box }[]
}

export interface OcrPage {
  items: RawTextItem[]
  /** page height in points, the same unit as the items */
  height: number
  confidence: number
}

/** Table rules and stray marks Tesseract reads as characters */
const JUNK = /^[|_—–=~.·•:;,'"`¦!]+$/

/** Digits Tesseract tends to read as letters inside figures: O→0, l/I/|→1 */
function cleanWord(raw: string) {
  const w = raw.replace(/^[—–]/, '-').trim()
  const digits = (w.match(/\d/g) ?? []).length
  if (digits >= 2 && /^[-+−(€]?[\dOoIl|.,]+[)€-]?$/.test(w) && digits / w.length >= 0.5) return w.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1')
  return w
}

/**
 * Tesseract words → text items in page points, shaped like pdf.js items so the PDF reader
 * handles them the same way. The page's skew (a scan is rarely perfectly straight) is measured
 * on the long lines and taken out, so cells of the same row land on the same line.
 */
export function wordsToItems(lines: OcrLine[], scale: number): RawTextItem[] {
  const slopes = lines
    .filter((l) => l.baseline && l.baseline.x1 - l.baseline.x0 > 200)
    .map((l) => (l.baseline.y1 - l.baseline.y0) / (l.baseline.x1 - l.baseline.x0))
    .sort((a, b) => a - b)
  const skew = slopes.length ? slopes[Math.floor(slopes.length / 2)] : 0
  const out: RawTextItem[] = []
  for (const l of lines) {
    const bl = l.baseline
    const own = bl && bl.x1 !== bl.x0 ? (bl.y1 - bl.y0) / (bl.x1 - bl.x0) : skew
    for (const w of l.words) {
      const text = cleanWord(w.text)
      if (!text || w.confidence < 25 || JUNK.test(text)) continue
      const cx = (w.bbox.x0 + w.bbox.x1) / 2
      const base = bl && Number.isFinite(bl.y0) ? bl.y0 + own * (cx - bl.x0) : w.bbox.y1
      const wordH = w.bbox.y1 - w.bbox.y0
      const rowH = l.rowAttributes?.rowHeight || l.bbox.y1 - l.bbox.y0
      const h = Math.min(rowH, wordH * 2.5) / scale
      out.push({
        str: text,
        // horizontal text at the de-skewed baseline, in points from the top of the page
        transform: [h, 0, 0, h, w.bbox.x0 / scale, (base - skew * cx) / scale],
        width: (w.bbox.x1 - w.bbox.x0) / scale,
        height: h,
        word: true,
      })
    }
  }
  return out
}

type TesseractWorker = Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>>

export interface Ocr {
  read(image: HTMLCanvasElement, scale: number, onProgress?: (p: number) => void): Promise<OcrPage>
  close(): Promise<void>
}

/** Starts the OCR engine; `close()` frees it (several hundred MB of memory on large pages) */
export async function startOcr(): Promise<Ocr> {
  const { createWorker, OEM } = await import('tesseract.js')
  const base = new URL('ocr/', document.baseURI).href
  let report: ((p: number) => void) | undefined
  const worker: TesseractWorker = await createWorker('ita', OEM.LSTM_ONLY, {
    workerPath: `${base}worker.min.js`,
    corePath: base,
    langPath: base.replace(/\/$/, ''),
    // a same-origin worker: the site's Content-Security-Policy applies to it as to the page
    workerBlobURL: false,
    logger: (m) => {
      if (m.status === 'recognizing text') report?.(m.progress)
    },
  })
  // keep runs of spaces: they separate the columns of the statement
  await worker.setParameters({ preserve_interword_spaces: '1' })
  return {
    async read(image, scale, onProgress) {
      report = onProgress
      const { data } = await worker.recognize(image, {}, { blocks: true, text: false })
      report = undefined
      const lines = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines)) as unknown as OcrLine[]
      return { items: wordsToItems(lines, scale), height: image.height / scale, confidence: data.confidence }
    },
    async close() {
      await worker.terminate()
    },
  }
}

/**
 * A photo or a picture of a statement drawn on a canvas ready for OCR. The width is mapped to
 * an A4 page (595 pt), so font sizes come out in the range the reader expects.
 */
export async function imageCanvas(file: Blob): Promise<{ canvas: HTMLCanvasElement; scale: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  // Tesseract reads best with characters 20-40 px tall: big phone photos are scaled down
  const k = Math.min(1, 3600 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * k)
  canvas.height = Math.round(bitmap.height * k)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return { canvas, scale: canvas.width / 595 }
}
