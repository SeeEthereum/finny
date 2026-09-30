import { ChevronRight } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import type { CategoryTotal } from '../lib/analytics'
import { category } from '../lib/categories'
import { money, percent, shortDate } from '../lib/format'
import type { Transaction } from '../lib/types'
import { useUi } from '../store/ui'
import { useFinny } from '../store/useFinny'
import { CategoryIcon, cx } from './ui/primitives'

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="mb-6 flex flex-wrap items-end justify-between gap-4 lg:mb-8"
    >
      <div className="min-w-0">
        <div className="eyebrow mb-2">{eyebrow}</div>
        <h1 className="text-[32px] leading-[1.05] font-semibold text-fg sm:text-[44px]">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </motion.header>
  )
}

/** Category ranking as horizontal bars (one series color, value at the tip) */
export function CategoryBars({ totals, limit = 6 }: { totals: CategoryTotal[]; limit?: number }) {
  const reduce = useReducedMotion()
  const go = useFinny((s) => s.go)
  const setCategory = useUi((s) => s.setCategory)
  const setSearch = useUi((s) => s.setSearch)
  const top = totals.slice(0, limit)
  const rest = totals.slice(limit)
  const rows = rest.length
    ? [...top, { id: 'altro' as const, total: rest.reduce((a, c) => a + c.total, 0), count: rest.reduce((a, c) => a + c.count, 0), share: rest.reduce((a, c) => a + c.share, 0), folded: rest.length }]
    : top
  const max = Math.max(1, ...rows.map((r) => r.total))
  if (!rows.length) return <p className="text-sm text-muted">Nessuna spesa in questo periodo.</p>
  return (
    <ul className="space-y-1">
      {rows.map((r, i) => {
        const folded = 'folded' in r
        return (
          <li key={folded ? 'folded' : r.id}>
            <button
              disabled={folded}
              onClick={() => {
                setSearch('')
                setCategory(r.id)
                go('movimenti')
              }}
              className="group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface-3 disabled:hover:bg-transparent"
            >
              <CategoryIcon id={r.id} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-medium text-fg">{folded ? `Altre ${(r as { folded: number }).folded} categorie` : category(r.id).label}</span>
                  <span className="shrink-0 font-semibold text-fg tabular-nums">{money(r.total, { round: true })}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                    <motion.div
                      className="h-full rounded-full bg-series-1"
                      initial={reduce ? false : { width: 0 }}
                      animate={{ width: `${(r.total / max) * 100}%` }}
                      transition={{ delay: 0.15 + i * 0.06, type: 'spring', stiffness: 90, damping: 18 }}
                    />
                  </div>
                  <span className="w-9 text-right text-xs text-muted tabular-nums">{percent(r.share)}</span>
                </div>
              </div>
              {!folded && <ChevronRight size={15} className="text-muted opacity-0 transition-opacity group-hover:opacity-100" />}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function TxRow({ t, onClick, showDate = true }: { t: Transaction; onClick?: () => void; showDate?: boolean }) {
  const c = category(t.category)
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-surface-3">
      <CategoryIcon id={t.category} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-fg">{t.merchant}</div>
        <div className="truncate text-xs text-muted">
          {c.label}
          {showDate && ` · ${shortDate(t.date)}`}
        </div>
      </div>
      <div className={cx('shrink-0 text-sm font-semibold tabular-nums', t.amount > 0 ? 'text-good-text' : 'text-fg')}>{money(t.amount, { sign: true })}</div>
    </button>
  )
}

export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="grid size-14 place-items-center rounded-2xl border border-line bg-surface-2 text-accent">{icon}</div>
      <h3 className="mt-4 text-lg font-semibold text-fg">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-fg-2">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
