import { AlertTriangle, CalendarClock, Repeat } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useMemo } from 'react'
import { Empty, PageHeader } from '../components/shared'
import { AnimatedNumber, Card, CategoryIcon, SectionTitle, stagger } from '../components/ui/primitives'
import type { Subscription } from '../lib/analytics'
import { category } from '../lib/categories'
import { daysBetween, money, shiftDays, shortDate, todayISO } from '../lib/format'
import { useDerived } from '../store/derived'

const GROUPS: { title: string; eyebrow: string; test: (s: Subscription) => boolean }[] = [
  { title: 'Abbonamenti', eyebrow: 'Si possono disdire', test: (s) => ['abbonamenti', 'svago', 'altro', 'shopping'].includes(s.category) },
  { title: 'Spese fisse', eyebrow: 'Casa, utenze, trasporti', test: (s) => !['abbonamenti', 'svago', 'altro', 'shopping', 'investimenti'].includes(s.category) },
  { title: 'Risparmio automatico', eyebrow: 'PAC, conto deposito', test: (s) => s.category === 'investimenti' },
]

function perMonth(s: Subscription) {
  return s.yearly / 12
}

export default function Abbonamenti() {
  const { subs } = useDerived()
  const reduce = useReducedMotion()
  const today = todayISO()
  const spending = subs.filter((s) => s.category !== 'investimenti')
  const monthly = spending.reduce((a, s) => a + perMonth(s), 0)
  const next30 = useMemo(() => subs.filter((s) => daysBetween(today, s.next) <= 30).sort((a, b) => a.next.localeCompare(b.next)), [subs, today])

  if (!subs.length) {
    return (
      <>
        <PageHeader eyebrow="Ricorrenti" title="Quello che paghi senza pensarci." />
        <Card>
          <Empty icon={<Repeat />} title="Nessun addebito ricorrente trovato" body="Servono almeno 2-3 mesi di movimenti perché Finny riconosca abbonamenti e spese fisse." />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader eyebrow="Ricorrenti" title="Quello che paghi senza pensarci." />
      <motion.div variants={stagger.container} initial="hidden" animate="show" className="grid gap-4 lg:grid-cols-12 lg:gap-5">
        <motion.div variants={stagger.item} className="lg:col-span-5">
          <Card tilt className="h-full p-6">
            <div className="eyebrow">Spesa ricorrente</div>
            <div className="mt-3 text-5xl font-semibold tracking-[-0.03em] text-fg">
              <AnimatedNumber value={monthly} format={(n) => money(n, { round: true })} />
              <span className="ml-1 text-lg font-medium text-muted">/mese</span>
            </div>
            <p className="mt-3 text-sm text-fg-2">
              Sono <span className="font-semibold text-fg">{money(monthly * 12, { round: true })}</span> all'anno in {spending.length} addebiti che partono da soli. Il risparmio automatico non è incluso.
            </p>
          </Card>
        </motion.div>

        <motion.div variants={stagger.item} className="lg:col-span-7">
          <Card className="h-full p-5 sm:p-6">
            <SectionTitle eyebrow="Prossimi 30 giorni" title="Calendario addebiti" />
            <div className="relative mt-8 mb-2 h-24">
              <div className="absolute top-10 right-0 left-0 h-px bg-line-strong" />
              {[0, 7, 14, 21, 30].map((d) => (
                <div key={d} className="absolute top-12 -translate-x-1/2 text-[11px] text-muted" style={{ left: `${(d / 30) * 100}%` }}>
                  {d === 0 ? 'oggi' : shortDate(shiftDays(today, d))}
                </div>
              ))}
              {next30.map((s, i) => {
                const d = Math.max(0, daysBetween(today, s.next))
                const high = i % 2 === 0
                return (
                  <motion.div
                    key={s.merchant}
                    className="absolute -translate-x-1/2"
                    style={{ left: `${(d / 30) * 100}%`, top: high ? 0 : 20 }}
                    initial={reduce ? false : { opacity: 0, y: -10, scale: 0.6 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ delay: 0.3 + i * 0.07, type: 'spring', stiffness: 300, damping: 18 }}
                    title={`${s.merchant} · ${shortDate(s.next)} · ${money(s.amount)}`}
                  >
                    <div className="group relative flex flex-col items-center">
                      <span className="mb-1 hidden rounded-md bg-surface-3 px-1.5 py-0.5 text-[10px] whitespace-nowrap text-fg group-hover:block">
                        {s.merchant} {money(s.amount, { round: true })}
                      </span>
                      <span className="size-3 rounded-full border-2 border-surface" style={{ background: s.category === 'investimenti' ? 'var(--series-3)' : 'var(--accent)' }} />
                    </div>
                  </motion.div>
                )
              })}
            </div>
            <p className="text-xs text-muted">
              {next30.length} addebiti previsti, per {money(next30.reduce((a, s) => a + s.amount, 0), { round: true })}. Passa sopra un punto per il dettaglio.
            </p>
          </Card>
        </motion.div>

        {GROUPS.map((g) => {
          const list = subs.filter(g.test)
          if (!list.length) return null
          return (
            <motion.div key={g.title} variants={stagger.item} className="lg:col-span-12">
              <SectionTitle
                eyebrow={g.eyebrow}
                title={g.title}
                action={<span className="text-sm text-fg-2 tabular-nums">{money(list.reduce((a, s) => a + perMonth(s), 0), { round: true })}/mese</span>}
              />
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((s) => (
                  <SubCard key={s.merchant} s={s} />
                ))}
              </div>
            </motion.div>
          )
        })}
      </motion.div>
      <p className="mt-6 text-xs text-muted">
        Finny considera ricorrente un addebito dello stesso esercente, con importo simile, ripetuto a intervalli regolari. Le bollette possono variare fino al 50%.
      </p>
    </>
  )
}

function SubCard({ s }: { s: Subscription }) {
  const reduce = useReducedMotion()
  const max = Math.max(...s.history.map((h) => h.amount))
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <CategoryIcon id={s.category} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-fg">{s.merchant}</div>
          <div className="text-xs text-muted">
            {category(s.category).label} · {s.cadence}
          </div>
        </div>
        <div className="text-right">
          <div className="font-semibold text-fg tabular-nums">{money(s.amount)}</div>
          <div className="text-xs text-muted tabular-nums">{money(s.yearly, { round: true })}/anno</div>
        </div>
      </div>
      <div className="mt-4 flex h-8 items-end gap-[2px]" aria-hidden>
        {s.history.slice(-12).map((h, i) => (
          <motion.span
            key={h.date}
            className="flex-1 rounded-t-[3px] bg-series-1"
            style={{ opacity: 0.35 + (i / 12) * 0.65, maxWidth: 24 }}
            initial={reduce ? false : { height: 0 }}
            animate={{ height: `${(h.amount / max) * 100}%` }}
            transition={{ delay: 0.2 + i * 0.03, type: 'spring', stiffness: 160, damping: 18 }}
            title={`${shortDate(h.date)}: ${money(h.amount)}`}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1 text-fg-2">
          <CalendarClock size={13} /> prossimo {shortDate(s.next)}
        </span>
        {s.priceChange && (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 font-semibold text-fg">
            <AlertTriangle size={12} className="text-warning" />
            {s.priceChange.to > s.priceChange.from ? 'Rincaro' : 'Ribasso'} {money(s.priceChange.from)} → {money(s.priceChange.to)}
          </span>
        )}
      </div>
    </Card>
  )
}
