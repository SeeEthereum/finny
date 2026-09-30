import { AlertTriangle, ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, Info, OctagonAlert, type LucideIcon } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import type { Insight, Tone } from '../lib/insights'
import { useFinny } from '../store/useFinny'
import { Card, cx } from './ui/primitives'

export const TONE: Record<Tone, { label: string; icon: LucideIcon; color: string; text: string }> = {
  good: { label: 'Bene', icon: CheckCircle2, color: 'var(--good)', text: 'var(--good-text)' },
  warning: { label: 'Attenzione', icon: AlertTriangle, color: 'var(--warning)', text: 'var(--fg)' },
  critical: { label: 'Critico', icon: OctagonAlert, color: 'var(--critical)', text: 'var(--critical-text)' },
  info: { label: 'Consiglio', icon: Info, color: 'var(--series-1)', text: 'var(--fg)' },
}

/** The talking orb: rings breathe, the core swells while a tip is being "said" */
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
        style={{
          background:
            'radial-gradient(circle at 32% 28%, var(--accent-2), var(--accent) 45%, color-mix(in oklab, var(--accent) 40%, var(--series-1)) 100%)',
          boxShadow: '0 0 40px -6px var(--accent)',
        }}
        animate={reduce ? undefined : speaking ? { scale: [1, 1.1, 0.96, 1.07, 1] } : { scale: [1, 1.03, 1] }}
        transition={{ duration: speaking ? 0.9 : 3.2, repeat: Infinity, ease: 'easeInOut' }}
      />
      <span className="absolute inset-[30%] rounded-full bg-white/25 blur-[6px]" />
    </div>
  )
}

function useTypewriter(text: string, speed = 14) {
  const reduce = useReducedMotion()
  const [n, setN] = useState(reduce ? text.length : 0)
  useEffect(() => {
    if (reduce) {
      setN(text.length)
      return
    }
    setN(0)
    const id = setInterval(() => {
      setN((v) => {
        if (v >= text.length) {
          clearInterval(id)
          return v
        }
        return v + 2
      })
    }, speed)
    return () => clearInterval(id)
  }, [text, speed, reduce])
  return { shown: text.slice(0, n), done: n >= text.length }
}

export function VocinaCarousel({ insights }: { insights: Insight[] }) {
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const go = useFinny((s) => s.go)
  const tip = insights[i % Math.max(1, insights.length)]
  const { shown, done } = useTypewriter(tip?.body ?? '')

  useEffect(() => {
    if (paused || insights.length < 2 || !done) return
    const id = setTimeout(() => setI((v) => (v + 1) % insights.length), 7000)
    return () => clearTimeout(id)
  }, [paused, insights.length, done, i])

  if (!tip) return null
  const tone = TONE[tip.tone]
  const ToneIcon = tone.icon

  return (
    <Card
      className="overflow-hidden p-5 sm:p-6"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      <div className="flex items-start gap-4 sm:gap-5">
        <Orb speaking={!done} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow">La vocina dice</span>
            <span
              className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold"
              style={{ color: tone.text }}
            >
              <ToneIcon size={12} style={{ color: tone.color }} aria-hidden />
              {tone.label}
            </span>
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={tip.id}
              initial={{ opacity: 0, y: 10, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -8, filter: 'blur(6px)' }}
              transition={{ duration: 0.35 }}
              className="mt-2"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className="text-xl font-semibold text-fg sm:text-2xl">{tip.title}</h3>
                {tip.figure && <div className="text-2xl font-semibold tracking-tight text-accent">{tip.figure}</div>}
              </div>
              <p className="mt-2 max-w-[62ch] text-[15px] text-fg-2" aria-live="polite">
                {shown}
                {!done && <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-accent" />}
                <span className="sr-only">{tip.body.slice(shown.length)}</span>
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                {tip.action && (
                  <button
                    onClick={() => go(tip.action!.to)}
                    className="group inline-flex items-center gap-1.5 text-sm font-semibold text-accent"
                  >
                    {tip.action.label}
                    <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
                  </button>
                )}
                {tip.source && (
                  <a
                    href={tip.source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-muted underline decoration-line-strong underline-offset-4 hover:text-fg-2"
                  >
                    Fonte: {tip.source.label}
                  </a>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      {insights.length > 1 && (
        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Consigli">
            {insights.map((x, k) => (
              <button
                key={x.id}
                role="tab"
                aria-selected={k === i}
                aria-label={x.title}
                onClick={() => setI(k)}
                className={cx('h-1.5 rounded-full transition-all', k === i ? 'w-6 bg-accent' : 'w-1.5 bg-line-strong hover:bg-muted')}
              />
            ))}
          </div>
          <div className="flex gap-1">
            <button aria-label="Consiglio precedente" onClick={() => setI((v) => (v - 1 + insights.length) % insights.length)} className="grid size-8 place-items-center rounded-full text-fg-2 hover:bg-surface-3 hover:text-fg">
              <ChevronLeft size={16} />
            </button>
            <button aria-label="Consiglio successivo" onClick={() => setI((v) => (v + 1) % insights.length)} className="grid size-8 place-items-center rounded-full text-fg-2 hover:bg-surface-3 hover:text-fg">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </Card>
  )
}

export function InsightCard({ tip }: { tip: Insight }) {
  const go = useFinny((s) => s.go)
  const tone = TONE[tip.tone]
  const Icon = tone.icon
  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: tone.text }}>
          <Icon size={14} style={{ color: tone.color }} aria-hidden />
          {tone.label}
        </span>
        {tip.figure && <span className="text-lg font-semibold text-accent">{tip.figure}</span>}
      </div>
      <h3 className="mt-3 text-base font-semibold text-fg">{tip.title}</h3>
      <p className="mt-1.5 flex-1 text-sm text-fg-2">{tip.body}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        {tip.action && (
          <button onClick={() => go(tip.action!.to)} className="group inline-flex items-center gap-1 text-sm font-semibold text-accent">
            {tip.action.label}
            <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
          </button>
        )}
        {tip.source && (
          <a href={tip.source.url} target="_blank" rel="noreferrer" className="text-xs text-muted underline decoration-line-strong underline-offset-4 hover:text-fg-2">
            Fonte: {tip.source.label}
          </a>
        )}
      </div>
    </Card>
  )
}
