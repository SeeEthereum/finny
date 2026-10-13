import {
  AlertTriangle,
  Banknote,
  Bike,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Gauge,
  Info,
  Lightbulb,
  OctagonAlert,
  PiggyBank,
  Receipt,
  Repeat,
  ShieldCheck,
  ShoppingBag,
  Tag,
  TrendingDown,
  TrendingUp,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import type { Insight, Tone } from '../lib/insights'
import { useFinny } from '../store/useFinny'
import { Button, Card, cx } from './ui/primitives'

export const TONE: Record<Tone, { label: string; icon: LucideIcon; color: string; text: string }> = {
  good: { label: 'Bene', icon: CheckCircle2, color: 'var(--good)', text: 'var(--good-text)' },
  warning: { label: 'Attenzione', icon: AlertTriangle, color: 'var(--warning)', text: 'var(--fg)' },
  critical: { label: 'Critico', icon: OctagonAlert, color: 'var(--critical)', text: 'var(--critical-text)' },
  info: { label: 'Consiglio', icon: Info, color: 'var(--series-1)', text: 'var(--fg)' },
}

/** Round icon fill by tone: coral asks for attention, green is good news, gray is a plain tip */
export const TONE_CIRCLE: Record<Tone, string> = {
  critical: 'bg-accent text-accent-ink',
  warning: 'bg-accent text-accent-ink',
  good: 'bg-good text-white',
  info: 'bg-surface-3 text-fg',
}

const ICONS: [string, LucideIcon][] = [
  ['price-', Tag],
  ['spike-', TrendingUp],
  ['drop-', TrendingDown],
  ['savings-rate', PiggyBank],
  ['subs', Repeat],
  ['emergency', ShieldCheck],
  ['delivery', Bike],
  ['fees', Receipt],
  ['cash', Banknote],
  ['weekend', CalendarDays],
  ['forecast', Gauge],
  ['wants', ShoppingBag],
  ['biggest', Zap],
]

/** The icon that says what a tip is about, so the list reads at a glance */
export function insightIcon(id: string): LucideIcon {
  return ICONS.find(([prefix]) => id.startsWith(prefix))?.[1] ?? Lightbulb
}

/** The talking orb: rings breathe, the core swells while the vocina is "thinking" */
export function Orb({ speaking = false, size = 64 }: { speaking?: boolean; size?: number }) {
  const reduce = useReducedMotion()
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute inset-0 rounded-full border border-accent/40"
          animate={reduce ? undefined : { scale: [1, 1.55], opacity: [0.5, 0] }}
          transition={{ duration: 2.8, repeat: Infinity, delay: i * 0.93, ease: 'easeOut' }}
        />
      ))}
      <motion.span
        className="absolute inset-[14%] rounded-full"
        style={{ background: 'radial-gradient(circle at 32% 28%, var(--accent-2), var(--accent) 60%)' }}
        animate={reduce ? undefined : speaking ? { scale: [1, 1.1, 0.96, 1.07, 1] } : { scale: [1, 1.03, 1] }}
        transition={{ duration: speaking ? 0.9 : 3.2, repeat: Infinity, ease: 'easeInOut' }}
      />
      <span className="absolute inset-[30%] rounded-full bg-white/25 blur-[6px]" />
    </div>
  )
}

function Source({ tip }: { tip: Insight }) {
  if (!tip.source) return null
  return (
    <a
      href={tip.source.url}
      target="_blank"
      rel="noreferrer"
      className="text-xs text-muted underline decoration-line-strong underline-offset-4 hover:text-fg-2"
    >
      Fonte: {tip.source.label}
    </a>
  )
}

/**
 * A "What we noticed" row: round icon, title and the first line of the tip.
 * Opens in place to show the whole explanation, the source and the next step.
 */
export function InsightRow({ tip }: { tip: Insight }) {
  const [open, setOpen] = useState(false)
  const go = useFinny((s) => s.go)
  const Icon = insightIcon(tip.id)
  return (
    <div className="card overflow-hidden rounded-[24px]">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-4 px-4 py-3.5 text-left">
        <span className={cx('grid size-12 shrink-0 place-items-center rounded-full', TONE_CIRCLE[tip.tone])} title={TONE[tip.tone].label}>
          <Icon size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-medium text-fg">{tip.title}</span>
          <motion.span animate={{ opacity: open ? 0 : 1, height: open ? 0 : 'auto' }} className="mt-0.5 block truncate text-[14px] text-fg-2">
            {tip.body}
          </motion.span>
        </span>
        {tip.figure && <span className="figure hidden shrink-0 text-[16px] text-fg tabular-nums sm:block">{tip.figure}</span>}
        <motion.span animate={{ rotate: open ? 90 : 0 }} className="shrink-0 text-muted">
          <ChevronRight size={18} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          >
            <div className="px-4 pb-4 sm:pl-[80px]">
              {tip.figure && <div className="figure mb-1 text-[22px] text-fg sm:hidden">{tip.figure}</div>}
              <p className="max-w-[64ch] text-[15px] text-fg-2">{tip.body}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                {tip.action && (
                  <Button size="sm" onClick={() => go(tip.action!.to)}>
                    {tip.action.label}
                  </Button>
                )}
                <Source tip={tip} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** The same tip as a card, for the grid in Analisi */
export function InsightCard({ tip }: { tip: Insight }) {
  const go = useFinny((s) => s.go)
  const Icon = insightIcon(tip.id)
  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <span className={cx('grid size-11 shrink-0 place-items-center rounded-full', TONE_CIRCLE[tip.tone])} title={TONE[tip.tone].label}>
          <Icon size={19} />
        </span>
        {tip.figure && <span className="figure text-[22px] text-fg tabular-nums">{tip.figure}</span>}
      </div>
      <h3 className="mt-4 text-[17px] font-semibold text-fg">{tip.title}</h3>
      <p className="mt-1.5 flex-1 text-[14px] text-fg-2">{tip.body}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        {tip.action && (
          <Button size="sm" variant="secondary" onClick={() => go(tip.action!.to)}>
            {tip.action.label}
          </Button>
        )}
        <Source tip={tip} />
      </div>
    </Card>
  )
}
