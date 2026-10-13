import { ChevronRight, CircleHelp, type LucideIcon } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import type { CategoryTotal } from '../lib/analytics'
import { category } from '../lib/categories'
import { money, percent, shortDate } from '../lib/format'
import type { Transaction } from '../lib/types'
import { useUi } from '../store/ui'
import { useFinny } from '../store/useFinny'
import { Avatar, Button, CategoryIcon, cx } from './ui/primitives'

/** Big page title like "Subscriptions", with a quiet line above it and actions on the right */
export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="mb-5 flex flex-wrap items-end justify-between gap-4 lg:mb-7"
    >
      <div className="min-w-0">
        <div className="mb-1.5 text-sm text-fg-2">{eyebrow}</div>
        <h1 className="text-[34px] leading-[1.05] text-fg sm:text-[42px]">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </motion.header>
  )
}

/** Category ranking: icon, name, amount, and a coral pill in a gray track */
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
              className="group flex w-full items-center gap-3 rounded-[18px] px-2 py-2 text-left transition-colors hover:bg-surface-2 disabled:hover:bg-transparent"
            >
              <CategoryIcon id={r.id} size={38} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2 text-[15px]">
                  <span className="truncate font-medium text-fg">{folded ? `Altre ${(r as { folded: number }).folded} categorie` : category(r.id).label}</span>
                  <span className="figure shrink-0 text-fg tabular-nums">{money(r.total, { round: true })}</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-track">
                    <motion.div
                      className={cx('h-full rounded-full', folded ? 'bg-series-1' : 'bg-accent')}
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

/** A movement as a list row: initials avatar, merchant, category and date, amount on the right */
export function TxRow({ t, onClick, showDate = true }: { t: Transaction; onClick?: () => void; showDate?: boolean }) {
  const c = category(t.category)
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-[20px] px-2.5 py-2.5 text-left transition-colors hover:bg-surface-2">
      <Avatar name={t.merchant} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium text-fg">{t.merchant}</div>
        <div className="truncate text-[13px] text-fg-2">
          {c.label}
          {showDate && ` · ${shortDate(t.date)}`}
        </div>
      </div>
      <div className={cx('figure shrink-0 text-[16px] tabular-nums', t.amount > 0 ? 'text-good-text' : 'text-fg')}>{money(t.amount, { sign: true })}</div>
    </button>
  )
}

/** A "What we noticed" row: round icon, title, one-line detail, chevron */
export function NoticeRow({
  icon: Icon,
  title,
  detail,
  tone = 'accent',
  onClick,
  trailing,
}: {
  icon: LucideIcon
  title: ReactNode
  detail?: ReactNode
  tone?: 'accent' | 'ink' | 'muted' | 'good'
  onClick?: () => void
  trailing?: ReactNode
}) {
  const circle = { accent: 'bg-accent text-accent-ink', ink: 'bg-ink text-ink-fg', muted: 'bg-surface-3 text-fg', good: 'bg-good text-white' }[tone]
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} className={cx('card flex w-full items-center gap-4 rounded-[24px] px-4 py-3.5 text-left', onClick && 'transition-transform hover:-translate-y-0.5')}>
      <span className={cx('grid size-12 shrink-0 place-items-center rounded-full', circle)}>
        <Icon size={20} strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-medium text-fg">{title}</span>
        {detail && <span className="mt-0.5 block text-[14px] text-fg-2">{detail}</span>}
      </span>
      {trailing}
      {onClick && !trailing && <ChevronRight size={18} className="shrink-0 text-muted" />}
    </Tag>
  )
}

/** Coral-outlined call to action: "3 cose da rivedere", with a black pill to open them */
export function ReviewCard({ count, saving, onReview }: { count: number; saving: number; onReview: () => void }) {
  return (
    <motion.div whileHover={{ y: -2 }} className="flex items-center gap-4 rounded-[24px] border-[1.5px] border-accent bg-surface px-4 py-3.5">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-accent-ink">
        <CircleHelp size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[16px] font-medium text-fg">{count === 1 ? '1 cosa da rivedere' : `${count} cose da rivedere`}</div>
        <div className="text-[14px] text-fg-2">{saving > 0 ? `fino a ${money(saving, { round: true })}/mese risparmiabili` : 'rincari e possibili doppioni'}</div>
      </div>
      <Button size="sm" onClick={onReview}>
        Rivedi
      </Button>
    </motion.div>
  )
}

export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="grid size-14 place-items-center rounded-full bg-accent-soft text-accent">{icon}</div>
      <h3 className="mt-4 text-xl text-fg">{title}</h3>
      <p className="mt-1 max-w-sm text-[15px] text-fg-2">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
