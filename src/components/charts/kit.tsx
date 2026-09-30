import { AnimatePresence, motion } from 'motion/react'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Card, Segmented } from '../ui/primitives'

export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect
      setSize((s) => (Math.abs(s.width - width) > 0.5 || Math.abs(s.height - height) > 0.5 ? { width, height } : s))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}

/** Clean axis ticks: 0, 500, 1.000… never odd steps */
export function niceTicks(max: number, count = 4) {
  if (max <= 0) return [0]
  const raw = max / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const top = Math.ceil(max / step) * step
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)
}

export const tickFmt = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 })

/** Column path: 4px rounded data end, square at the baseline */
export function columnPath(x: number, y: number, w: number, h: number, r = 4) {
  if (h <= 0) return ''
  const rr = Math.min(r, w / 2, h)
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`
}

export function Legend({ items }: { items: { label: string; color: string; kind?: 'dot' | 'line' }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-2">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          {it.kind === 'line' ? (
            <span className="h-[2px] w-4 rounded-full" style={{ background: it.color }} />
          ) : (
            <span className="size-2.5 rounded-[3px]" style={{ background: it.color }} />
          )}
          {it.label}
        </span>
      ))}
    </div>
  )
}

export function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const flip = x > width - 190
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1, left: flip ? x - 12 : x + 12, top: y }}
      transition={{ type: 'spring', stiffness: 500, damping: 36 }}
      className="pointer-events-none absolute z-10 min-w-[160px] rounded-xl border border-line-strong bg-surface/95 px-3 py-2 text-xs shadow-xl backdrop-blur"
      style={{ translateX: flip ? '-100%' : '0%', translateY: '-50%' }}
    >
      {children}
    </motion.div>
  )
}

export function TipRow({ color, label, value }: { color?: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="inline-flex items-center gap-1.5 text-fg-2">
        {color && <span className="size-2 rounded-[2px]" style={{ background: color }} />}
        {label}
      </span>
      <span className="font-semibold text-fg tabular-nums">{value}</span>
    </div>
  )
}

/** Wraps a chart with its title, legend and a table-view twin */
export function ChartCard({
  id,
  eyebrow,
  title,
  legend,
  chart,
  table,
  aside,
  className,
}: {
  id: string
  eyebrow?: string
  title: ReactNode
  legend?: ReactNode
  chart: ReactNode
  table: { head: string[]; rows: (string | number)[][] }
  aside?: ReactNode
  className?: string
}) {
  const [mode, setMode] = useState<'chart' | 'table'>('chart')
  return (
    <Card className={`p-5 sm:p-6 ${className ?? ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
          <h3 className="text-lg font-semibold text-fg">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          {aside}
          <Segmented
            id={`view-${id}`}
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'chart', label: 'Grafico' },
              { value: 'table', label: 'Tabella' },
            ]}
          />
        </div>
      </div>
      {legend && mode === 'chart' && <div className="mt-3">{legend}</div>}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={mode}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className="mt-4"
        >
          {mode === 'chart' ? (
            chart
          ) : (
            <div className="scroll-thin max-h-[320px] overflow-auto rounded-xl border border-line">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-surface-2 text-xs text-muted">
                  <tr>
                    {table.head.map((h, i) => (
                      <th key={h} className={`px-3 py-2 font-medium ${i ? 'text-right' : ''}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="tabular">
                  {table.rows.map((r, k) => (
                    <tr key={k} className="border-t border-line">
                      {r.map((c, i) => (
                        <td key={i} className={`px-3 py-2 ${i ? 'text-right text-fg' : 'text-fg-2'}`}>
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </Card>
  )
}
