import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { defineConfig, type Plugin } from 'vite'

const require = createRequire(import.meta.url)

/**
 * Files the OCR and the PDF image decoders load at run time. They are served from the site
 * itself (the Content-Security-Policy allows no CDN), copied from node_modules at build time
 * instead of being committed, and only downloaded when a scanned PDF or a photo is read.
 */
const RUNTIME_FILES: Record<string, string> = {
  'ocr/worker.min.js': 'tesseract.js/dist/worker.min.js',
  'ocr/tesseract-core-lstm.wasm.js': 'tesseract.js-core/tesseract-core-lstm.wasm.js',
  'ocr/tesseract-core-simd-lstm.wasm.js': 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
  'ocr/tesseract-core-relaxedsimd-lstm.wasm.js': 'tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js',
  'ocr/ita.traineddata.gz': '@tesseract.js-data/ita/4.0.0_best_int/ita.traineddata.gz',
  'pdfjs/wasm/jbig2.wasm': 'pdfjs-dist/wasm/jbig2.wasm',
  'pdfjs/wasm/openjpeg.wasm': 'pdfjs-dist/wasm/openjpeg.wasm',
  'pdfjs/wasm/qcms_bg.wasm': 'pdfjs-dist/wasm/qcms_bg.wasm',
  'pdfjs/wasm/jbig2_nowasm_fallback.js': 'pdfjs-dist/wasm/jbig2_nowasm_fallback.js',
  'pdfjs/wasm/openjpeg_nowasm_fallback.js': 'pdfjs-dist/wasm/openjpeg_nowasm_fallback.js',
  // the licences of what the site redistributes
  'ocr/LICENSE-tesseract.js.txt': 'tesseract.js/LICENSE.md',
  'ocr/LICENSE-tesseract-core.txt': 'tesseract.js-core/LICENSE',
  'pdfjs/wasm/LICENSE_JBIG2': 'pdfjs-dist/wasm/LICENSE_JBIG2',
  'pdfjs/wasm/LICENSE_OPENJPEG': 'pdfjs-dist/wasm/LICENSE_OPENJPEG',
  'pdfjs/wasm/LICENSE_QCMS': 'pdfjs-dist/wasm/LICENSE_QCMS',
  'pdfjs/wasm/LICENSE_PDFJS_JBIG2': 'pdfjs-dist/wasm/LICENSE_PDFJS_JBIG2',
  'pdfjs/wasm/LICENSE_PDFJS_OPENJPEG': 'pdfjs-dist/wasm/LICENSE_PDFJS_OPENJPEG',
  'pdfjs/wasm/LICENSE_PDFJS_QCMS': 'pdfjs-dist/wasm/LICENSE_PDFJS_QCMS',
}

function runtimeFiles(): Plugin {
  const read = (name: string) => readFileSync(require.resolve(RUNTIME_FILES[name]))
  const type = (name: string) =>
    name.endsWith('.js') ? 'text/javascript' : name.endsWith('.wasm') ? 'application/wasm' : /LICENSE/.test(name) ? 'text/plain' : 'application/octet-stream'
  return {
    name: 'finny-runtime-files',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = Object.keys(RUNTIME_FILES).find((n) => req.url?.split('?')[0].endsWith(`/${n}`))
        if (!name) return next()
        res.setHeader('Content-Type', type(name))
        res.end(read(name))
      })
    },
    generateBundle() {
      for (const name of Object.keys(RUNTIME_FILES)) this.emitFile({ type: 'asset', fileName: name, source: read(name) })
    },
  }
}

export default defineConfig({
  // relative asset paths so the build works from any folder or static host
  base: './',
  plugins: [react(), tailwindcss(), runtimeFiles()],
})
