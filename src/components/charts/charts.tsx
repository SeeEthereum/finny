import { motion, useReducedMotion } from 'motion/react'
import { useId, useMemo, useState } from 'react'
import type { MonthStat } from '../../lib/analytics'
import { money, monthLabel } from '../../lib/format'
import { columnPath, niceTicks, tickFmt, Tooltip, TipRow, useSize } from './kit'

const PAD = { top: 8, right: 8, bottom: 26, left: 44 }

/** Income vs expenses per month: grouped columns, one baseline, one axis */
export function CashflowChart({ data, height = 240 }: { data: MonthStat[]; height?: number }) {
  const [ref, { width }] = useSize<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const reduce = useReducedMotion()
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expenses]))
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1]
  const plotW = Math.max(0, width - PAD.left - PAD.right)
  const plotH = height - PAD.top - PAD.bottom
  const band = plotW / Math.max(1, data.length)
  const barW = Math.min(22, Math.max(4, (band - 12) / 2 - 2))
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH
  const showEvery = band < 30 ? 2 : 1

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Entrate e uscite per mese" onPointerLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--muted)" className="tabular">
                {tickFmt.format(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = PAD.left + band * i + band / 2
            const x1 = cx - barW - 2
            const x2 = cx + 2
            const active = hover === i
            return (
              <g key={d.key} opacity={hover == null || active ? 1 : 0.45} style={{ transition: 'opacity .2s' }}>
                <rect x={PAD.left + band * i + 2} y={PAD.top} width={band - 4} height={plotH} fill={active ? 'var(--surface-2)' : 'transparent'} rx={14} />
                <motion.path
                  d={columnPath(x1, y(d.income), barW, y(0) - y(d.income), barW / 2)}
                  fill="var(--series-1)"
                  initial={reduce ? false : { scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ delay: 0.15 + i * 0.04, type: 'spring', stiffness: 120, damping: 18 }}
                  style={{ originY: 1 }}
                />
                <motion.path
                  d={columnPath(x2, y(d.expenses), barW, y(0) - y(d.expenses), barW / 2)}
                  fill="var(--series-2)"
                  initial={reduce ? false : { scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ delay: 0.2 + i * 0.04, type: 'spring', stiffness: 120, damping: 18 }}
                  style={{ originY: 1 }}
                />
                {i % showEvery === (data.length - 1) % showEvery && (
                  <text x={cx} y={height - 8} textAnchor="middle" fontSize={11} fill={active ? 'var(--fg)' : 'var(--muted)'}>
                    {monthLabel(d.key)}
                  </text>
                )}
                <rect
                  x={PAD.left + band * i}
                  y={0}
                  width={band}
                  height={height}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${monthLabel(d.key, true)}: entrate ${money(d.income)}, uscite ${money(d.expenses)}`}
                  onPointerEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                />
              </g>
            )
          })}
        </svg>
      )}
      {hover != null && data[hover] && (
        <Tooltip x={PAD.left + band * hover + band / 2} y={height / 2} width={width}>
          <div className="mb-1 font-semibold text-fg capitalize">{monthLabel(data[hover].key, true)}</div>
          <TipRow color="var(--series-1)" label="Entrate" value={money(data[hover].income, { round: true })} />
          <TipRow color="var(--series-2)" label="Uscite" value={money(data[hover].expenses, { round: true })} />
          <div className="my-1 border-t border-line" />
          <TipRow label="Risparmio" value={money(data[hover].net, { round: true, sign: true })} />
        </Tooltip>
      )}
    </div>
  )
}

/** Tiny trend line with a 10% wash and an emphasized endpoint */
export function Sparkline({ values, color = 'var(--series-1)', height = 40 }: { values: number[]; color?: string; height?: number }) {
  const [ref, { width }] = useSize<HTMLDivElement>()
  const id = useId().replace(/:/g, '')
  const reduce = useReducedMotion()
  const pts = useMemo(() => {
    if (!width || values.length < 2) return []
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = max - min || 1
    return values.map((v, i) => [4 + (i / (values.length - 1)) * (width - 10), 4 + (1 - (v - min) / span) * (height - 10)] as const)
  }, [values, width, height])
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join('')
  const last = pts[pts.length - 1]
  return (
    <div ref={ref} className="w-full" style={{ height }} aria-hidden>
      {pts.length > 1 && (
        <svg width={width} height={height}>
          <defs>
            <linearGradient id={`sp-${id}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity={0.18} />
              <stop offset="1" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={`${line}L${last[0]},${height}L${pts[0][0]},${height}Z`} fill={`url(#sp-${id})`} />
          <motion.path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.2, ease: [0.65, 0, 0.35, 1] }}
          />
          <motion.circle
            cx={last[0]}
            cy={last[1]}
            r={4}
            fill={color}
            stroke="var(--surface)"
            strokeWidth={2}
            initial={reduce ? false : { scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 1.1, type: 'spring' }}
          />
        </svg>
      )}
    </div>
  )
}

/** Cumulative spending this month vs the average of previous months */
export function PaceChart({ current, average, today, height = 220 }: { current: number[]; average: number[]; today: number; height?: number }) {
  const [ref, { width }] = useSize<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const reduce = useReducedMotion()
  const days = Math.max(current.length, average.length)
  const cur = current.slice(0, today)
  const max = Math.max(1, ...cur, ...average)
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1]
  const plotW = Math.max(0, width - PAD.left - PAD.right)
  const plotH = height - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (i / Math.max(1, days - 1)) * plotW
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH
  const path = (vs: number[]) => vs.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join('')
  const h = hover != null ? Math.min(hover, days - 1) : null

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label="Spesa cumulata del mese rispetto alla media"
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            const i = Math.round(((e.clientX - r.left - PAD.left) / plotW) * (days - 1))
            setHover(Math.max(0, Math.min(days - 1, i)))
          }}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--axis)' : 'var(--grid)'} />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--muted)" className="tabular">
                {tickFmt.format(t)}
              </text>
            </g>
          ))}
          {[1, 8, 15, 22, days].map((d) => (
            <text key={d} x={x(d - 1)} y={height - 8} textAnchor="middle" fontSize={11} fill="var(--muted)">
              {d}
            </text>
          ))}
          <path d={`${path(cur)}L${x(cur.length - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill="var(--series-2)" opacity={0.1} />
          <motion.path
            d={path(average)}
            fill="none"
            stroke="var(--muted)"
            strokeWidth={2}
            strokeLinecap="round"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.2, ease: 'easeInOut' }}
          />
          <motion.path
            d={path(cur)}
            fill="none"
            stroke="var(--series-2)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.4, ease: 'easeInOut', delay: 0.2 }}
          />
          {cur.length > 0 && (
            <>
              <circle cx={x(cur.length - 1)} cy={y(cur[cur.length - 1])} r={4.5} fill="var(--series-2)" stroke="var(--surface)" strokeWidth={2} />
              <text x={x(cur.length - 1)} y={y(cur[cur.length - 1]) - 12} textAnchor={cur.length > days * 0.8 ? 'end' : 'middle'} fontSize={12} fontWeight={600} fill="var(--fg)">
                {money(cur[cur.length - 1], { round: true })}
              </text>
            </>
          )}
          {h != null && (
            <g>
              <line x1={x(h)} x2={x(h)} y1={PAD.top} y2={y(0)} stroke="var(--line-strong)" />
              {h < cur.length && <circle cx={x(h)} cy={y(cur[h])} r={4} fill="var(--series-2)" stroke="var(--surface)" strokeWidth={2} />}
              <circle cx={x(h)} cy={y(average[h] ?? 0)} r={4} fill="var(--muted)" stroke="var(--surface)" strokeWidth={2} />
            </g>
          )}
        </svg>
      )}
      {h != null && (
        <Tooltip x={x(h)} y={height / 2} width={width}>
          <div className="mb-1 font-semibold text-fg">Giorno {h + 1}</div>
          {h < cur.length && <TipRow color="var(--series-2)" label="Questo mese" value={money(cur[h], { round: true })} />}
          <TipRow color="var(--muted)" label="Media mesi precedenti" value={money(average[h] ?? 0, { round: true })} />
        </Tooltip>
      )}
    </div>
  )
}

export interface Share {
  label: string
  value: number
  color: string
}

/**
 * "Share by group": one bar of rounded segments separated by gaps, with a dot legend
 * carrying the amounts. Small slices keep a minimum width so they stay visible.
 */
export function ShareBar({ items, height = 14, legend = true }: { items: Share[]; height?: number; legend?: boolean }) {
  const reduce = useReducedMotion()
  const shown = items.filter((x) => x.value > 0)
  const total = shown.reduce((a, x) => a + x.value, 0) || 1
  return (
    <div>
      <div className="flex w-full gap-1" style={{ height }} role="img" aria-label={shown.map((x) => `${x.label} ${money(x.value, { round: true })}`).join(', ')}>
        {shown.map((x, i) => (
          <motion.div
            key={x.label}
            className="h-full rounded-full"
            style={{ background: x.color, minWidth: height }}
            initial={reduce ? false : { flexGrow: 0.0001 }}
            animate={{ flexGrow: x.value / total }}
            transition={{ delay: 0.15 + i * 0.08, type: 'spring', stiffness: 70, damping: 18 }}
            title={`${x.label}: ${money(x.value)}`}
          />
        ))}
      </div>
      {legend && (
        <div className="mt-3.5 flex flex-wrap gap-x-5 gap-y-1.5 text-[14px]">
          {shown.map((x) => (
            <span key={x.label} className="inline-flex items-center gap-2 text-fg-2">
              <span className="size-2.5 rounded-full" style={{ background: x.color }} />
              {x.label} <span className="text-fg tabular-nums">{money(x.value, { round: true })}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** 50/30/20 as a share bar, with the recommended split under each part */
export function SplitBar({ needs, wants, savings }: { needs: number; wants: number; savings: number }) {
  const total = needs + wants + savings || 1
  const parts = [
    { key: 'Necessità', v: needs, color: 'var(--series-1)', target: 0.5 },
    { key: 'Desideri', v: wants, color: 'var(--series-2)', target: 0.3 },
    { key: 'Risparmio', v: savings, color: 'var(--series-3)', target: 0.2 },
  ]
  return (
    <div>
      <ShareBar items={parts.map((p) => ({ label: p.key, value: p.v, color: p.color }))} legend={false} />
      <div className="mt-4 grid grid-cols-3 gap-3">
        {parts.map((p) => (
          <div key={p.key} className="min-w-0">
            <div className="flex items-center gap-1.5 text-[13px] text-fg-2">
              <span className="size-2.5 rounded-full" style={{ background: p.color }} />
              {p.key}
            </div>
            <div className="figure mt-1 text-[26px] text-fg">{Math.round((p.v / total) * 100)}%</div>
            <div className="text-xs text-muted">
              obiettivo {Math.round(p.target * 100)}% · {money(p.v, { round: true })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * "Where it goes each month": a pill track per item with a filled pill rising from the bottom
 * and a dark tag carrying the amount. The last item can be set apart in ink ("Altro").
 */
export function PillBars({ items, height = 210, onSelect }: { items: { key: string; label: string; value: number; ink?: boolean }[]; height?: number; onSelect?: (key: string) => void }) {
  const reduce = useReducedMotion()
  const max = Math.max(1, ...items.map((x) => x.value))
  const track = height - 30
  return (
    <div className="flex items-end gap-2.5 sm:gap-3" style={{ height }}>
      {items.map((x, i) => {
        const fill = Math.max(0.12, x.value / max) * (track - 34)
        return (
          <button
            key={x.key}
            onClick={onSelect ? () => onSelect(x.key) : undefined}
            className="group flex min-w-0 flex-1 flex-col items-center gap-2"
            aria-label={`${x.label}: ${money(x.value)}`}
          >
            <div className="relative w-full max-w-[84px] rounded-[999px] bg-track" style={{ height: track }}>
              <motion.div
                className="absolute inset-x-0 bottom-0 rounded-[999px]"
                style={{ background: x.ink ? 'var(--series-1)' : 'var(--accent)' }}
                initial={reduce ? false : { height: 0 }}
                animate={{ height: fill }}
                transition={{ delay: 0.15 + i * 0.07, type: 'spring', stiffness: 90, damping: 17 }}
              />
              <motion.span
                className="figure absolute left-1/2 -translate-x-1/2 rounded-full bg-ink px-2 py-0.5 text-[12px] whitespace-nowrap text-ink-fg"
                initial={reduce ? false : { bottom: 0, opacity: 0 }}
                animate={{ bottom: fill - 12, opacity: 1 }}
                transition={{ delay: 0.15 + i * 0.07, type: 'spring', stiffness: 90, damping: 17 }}
              >
                {money(x.value, { round: true })}
              </motion.span>
            </div>
            <span className="max-w-full truncate text-[13px] text-fg-2 group-hover:text-fg">{x.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Average spend per weekday; the busiest day carries the accent, the rest stay quiet */
export function WeekdayChart({ values, height = 180 }: { values: number[]; height?: number }) {
  const [ref, { width }] = useSize<HTMLDivElement>()
  const reduce = useReducedMotion()
  const order = [1, 2, 3, 4, 5, 6, 0]
  const labels = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']
  const vs = order.map((i) => values[i] ?? 0)
  const max = Math.max(1, ...vs)
  const peak = vs.indexOf(max)
  const plotH = height - 42
  const band = width / 7
  const barW = Math.min(28, band - 10)
  return (
    <div ref={ref} className="w-full" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Spesa media per giorno della settimana">
          {vs.map((v, i) => {
            const h = (v / max) * plotH
            const x = band * i + (band - barW) / 2
            return (
              <g key={labels[i]}>
                <motion.path
                  d={columnPath(x, plotH + 18 - h, barW, h, barW / 2)}
                  fill={i === peak ? 'var(--series-2)' : 'var(--series-1)'}
                  opacity={i === peak ? 1 : 0.18}
                  initial={reduce ? false : { scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ delay: 0.1 + i * 0.05, type: 'spring', stiffness: 140, damping: 18 }}
                  style={{ originY: 1 }}
                />
                <text x={x + barW / 2} y={plotH + 12 - h} textAnchor="middle" fontSize={11} fill={i === peak ? 'var(--fg)' : 'var(--muted)'} fontWeight={i === peak ? 600 : 400}>
                  {i === peak ? money(v, { round: true }) : ''}
                </text>
                <text x={x + barW / 2} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--muted)">
                  {labels[i]}
                </text>
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}

/**
 * Countdown/meter ring: a track of small ticks with a rounded arc on top. Used for budgets
 * (warning at 85%, critical past 100%) and for days left before a charge.
 */
export function BudgetRing({ spent, budget, size = 64, color }: { spent: number; budget: number; size?: number; color?: string }) {
  const reduce = useReducedMotion()
  const ratio = budget > 0 ? spent / budget : 0
  const stroke = Math.max(4, size / 13)
  const r = size / 2 - stroke
  const c = 2 * Math.PI * r
  const arc = color ?? (ratio > 1 ? 'var(--critical)' : ratio > 0.85 ? 'var(--warning)' : 'var(--series-1)')
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-strong)" strokeWidth={stroke * 0.7} strokeDasharray={`1.2 ${(c / 48 - 1.2).toFixed(2)}`} strokeLinecap="round" />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={arc}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        initial={reduce ? false : { strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - Math.min(1, ratio)) }}
        transition={{ type: 'spring', stiffness: 60, damping: 16, delay: 0.2 }}
      />
    </svg>
  )
}
