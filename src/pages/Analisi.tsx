import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { PaceChart, SplitBar, WeekdayChart } from '../components/charts/charts'
import { ChartCard, Legend } from '../components/charts/kit'
import { CategoryBars, PageHeader } from '../components/shared'
import { AnimatedNumber, Card, CategoryIcon, SectionTitle, Segmented, stagger } from '../components/ui/primitives'
import { InsightCard } from '../components/Vocina'
import {
  bucketSplit, categoryTotals, forecastMonth, inMonth, monthPace, topMerchants, weekdayProfile,
} from '../lib/analytics'
import { category } from '../lib/categories'
import { money, monthLabel, percent, shiftMonth, WEEKDAY_SHORT } from '../lib/format'
import { useDerived } from '../store/derived'
import { useFinny } from '../store/useFinny'

type Period = '3' | '6' | '12'

export default function Analisi() {
  const txs = useFinny((s) => s.transactions)
  const { cur, stats, subs, insights } = useDerived()
  const [period, setPeriod] = useState<Period>('6')
  const months = Number(period)

  const data = useMemo(() => {
    // complete months only: the running month would drag every average down
    const to = shiftMonth(cur, -1)
    const from = shiftMonth(cur, -months)
    const slice = txs.filter((t) => t.date.slice(0, 7) >= from && t.date.slice(0, 7) <= to)
    const periodStats = stats.filter((s) => s.key >= from && s.key <= to)
    const n = Math.max(1, periodStats.length)
    const income = periodStats.reduce((a, s) => a + s.income, 0) / n
    const expenses = periodStats.reduce((a, s) => a + s.expenses, 0) / n
    const prevFrom = shiftMonth(from, -months)
    const prevSlice = txs.filter((t) => t.date.slice(0, 7) >= prevFrom && t.date.slice(0, 7) < from)
    const prevTotals = categoryTotals(prevSlice)
    // the earlier window may be only partly covered by the imported statements
    const prevN = Math.max(1, new Set(prevSlice.map((t) => t.date.slice(0, 7))).size)
    const totals = categoryTotals(slice)
    const hasPrev = prevSlice.length > 0
    const changes = totals
      .map((c) => {
        const before = prevTotals.find((p) => p.id === c.id)?.total ?? 0
        return { id: c.id, now: c.total / n, before: before / prevN, delta: before ? c.total / n / (before / prevN) - 1 : NaN }
      })
      .slice(0, 8)
    const weekday = weekdayProfile(slice)
    const peak = weekday.indexOf(Math.max(...weekday))
    return {
      from, to, income, expenses, rate: income ? (income - expenses) / income : 0,
      split: bucketSplit(slice), totals, changes, hasPrev, weekday, peak,
      merchants: topMerchants(slice, 8), n,
    }
  }, [txs, stats, cur, months])

  const pace = useMemo(() => {
    const current = monthPace(txs, cur)
    const prev = [1, 2, 3].map((k) => monthPace(txs, shiftMonth(cur, -k)))
    const average = current.map((_, d) => prev.reduce((a, p) => a + (p[Math.min(d, p.length - 1)] ?? 0), 0) / prev.length)
    const fc = forecastMonth(txs, subs, cur)
    return { current, average, fc }
  }, [txs, cur, subs])

  const tiles = [
    { label: 'Entrate medie al mese', value: data.income, fmt: (n: number) => money(n, { round: true }) },
    { label: 'Uscite medie al mese', value: data.expenses, fmt: (n: number) => money(n, { round: true }) },
    { label: 'Tasso di risparmio', value: data.rate, fmt: (n: number) => percent(n) },
    { label: 'Previsione fine mese', value: pace.fc.projected, fmt: (n: number) => money(n, { round: true }) },
  ]

  return (
    <>
      <PageHeader eyebrow={`Analisi · ${monthLabel(data.from, true)} – ${monthLabel(data.to, true)}`} title="Capire dove si può fare meglio.">
        <Segmented
          id="period"
          value={period}
          onChange={setPeriod}
          options={[
            { value: '3', label: '3 mesi' },
            { value: '6', label: '6 mesi' },
            { value: '12', label: '12 mesi' },
          ]}
        />
      </PageHeader>

      <motion.div key={period} variants={stagger.container} initial="hidden" animate="show" className="grid gap-4 lg:grid-cols-12 lg:gap-5">
        <motion.div variants={stagger.item} className="grid grid-cols-2 gap-3 lg:col-span-12 lg:grid-cols-4 lg:gap-4">
          {tiles.map((t) => (
            <Card key={t.label} className="p-4 sm:p-5">
              <div className="text-xs text-fg-2 sm:text-sm">{t.label}</div>
              <div className="mt-1.5 text-2xl font-semibold text-fg sm:text-3xl">
                <AnimatedNumber value={t.value} format={t.fmt} />
              </div>
            </Card>
          ))}
        </motion.div>

        <motion.div variants={stagger.item} className="lg:col-span-7">
          <ChartCard
            id="pace"
            eyebrow={monthLabel(cur, true)}
            title="Il ritmo di spesa del mese"
            legend={
              <Legend
                items={[
                  { label: 'Questo mese', color: 'var(--series-2)', kind: 'line' },
                  { label: 'Media dei 3 mesi prima', color: 'var(--muted)', kind: 'line' },
                ]}
              />
            }
            chart={<PaceChart current={pace.current} average={pace.average} today={pace.fc.dayIdx} />}
            table={{
              head: ['Giorno', 'Questo mese', 'Media'],
              rows: pace.average.map((a, i) => [i + 1, i < pace.fc.dayIdx ? money(pace.current[i], { round: true }) : '—', money(a, { round: true })]),
            }}
          />
        </motion.div>

        <motion.div variants={stagger.item} className="lg:col-span-5">
          <Card className="h-full p-5 sm:p-6">
            <SectionTitle eyebrow="Regola 50/30/20" title="Come dividi le entrate" />
            <p className="mt-1 text-sm text-fg-2">
              Necessità (casa, bollette, spesa, trasporti), desideri (ristoranti, shopping, svago) e risparmio, in percentuale sul totale.
            </p>
            <div className="mt-5">
              <SplitBar needs={data.split.needs} wants={data.split.wants} savings={data.split.savings} />
            </div>
            <a
              href="https://en.wikipedia.org/wiki/All_Your_Worth"
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-block text-xs text-muted underline decoration-line-strong underline-offset-4"
            >
              Fonte: E. Warren, A. Warren Tyagi, "All Your Worth", 2005
            </a>
          </Card>
        </motion.div>

        <motion.div variants={stagger.item} className="lg:col-span-5">
          <Card className="h-full p-5 sm:p-6">
            <SectionTitle eyebrow={`Totale ${months} mesi`} title="Categorie" />
            <div className="mt-4">
              <CategoryBars totals={data.totals} limit={7} />
            </div>
          </Card>
        </motion.div>

        <motion.div variants={stagger.item} className="lg:col-span-7">
          <Card className="h-full p-5 sm:p-6">
            <SectionTitle eyebrow="Media mensile" title={data.hasPrev ? `Rispetto ai ${months} mesi precedenti` : 'Media mensile per categoria'} />
            <div className="scroll-thin mt-4 overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="pb-2 font-medium">Categoria</th>
                    <th className="pb-2 text-right font-medium">Ora</th>
                    {data.hasPrev && <th className="pb-2 text-right font-medium">Prima</th>}
                    {data.hasPrev && <th className="pb-2 text-right font-medium">Variazione</th>}
                  </tr>
                </thead>
                <tbody className="tabular">
                  {data.changes.map((c) => (
                    <tr key={c.id} className="border-t border-line">
                      <td className="py-2.5">
                        <span className="flex items-center gap-2 text-fg">
                          <CategoryIcon id={c.id} size={26} />
                          {category(c.id).label}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-semibold text-fg">{money(c.now, { round: true })}</td>
                      {data.hasPrev && <td className="py-2.5 text-right text-fg-2">{money(c.before, { round: true })}</td>}
                      {data.hasPrev && (
                        <td className="py-2.5 text-right">
                          {Number.isFinite(c.delta) ? (
                            <span className={c.delta > 0.05 ? 'text-critical-text' : c.delta < -0.05 ? 'text-good-text' : 'text-fg-2'}>
                              {c.delta > 0 ? '↑' : c.delta < 0 ? '↓' : '→'} {percent(Math.abs(c.delta))}
                            </span>
                          ) : (
                            <span className="text-muted">nuova</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </motion.div>

        <motion.div variants={stagger.item} className="lg:col-span-6">
          <ChartCard
            id="weekday"
            eyebrow="Spese variabili, media settimanale"
            title={`Il giorno più caro è ${['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'][data.peak]}`}
            chart={<WeekdayChart values={data.weekday} />}
            table={{ head: ['Giorno', 'Media'], rows: [1, 2, 3, 4, 5, 6, 0].map((d) => [WEEKDAY_SHORT[d], money(data.weekday[d], { round: true })]) }}
          />
        </motion.div>

        <motion.div variants={stagger.item} className="lg:col-span-6">
          <Card className="h-full p-5 sm:p-6">
            <SectionTitle eyebrow={`Totale ${months} mesi`} title="Dove spendi di più" />
            <ol className="mt-4 space-y-1">
              {data.merchants.map((m, i) => (
                <li key={m.merchant} className="flex items-center gap-3 rounded-xl px-2 py-2">
                  <span className="w-5 text-right font-mono text-xs text-muted">{i + 1}</span>
                  <CategoryIcon id={m.category} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-fg">{m.merchant}</div>
                    <div className="text-xs text-muted">
                      {m.count} {m.count === 1 ? 'pagamento' : 'pagamenti'} · media {money(m.total / m.count, { round: true })}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-fg tabular-nums">{money(m.total, { round: true })}</div>
                </li>
              ))}
            </ol>
          </Card>
        </motion.div>

        <motion.div variants={stagger.item} className="lg:col-span-12">
          <SectionTitle eyebrow="La vocina" title="Tutti i consigli" />
        </motion.div>
        {insights.map((tip) => (
          <motion.div key={tip.id} variants={stagger.item} className="sm:col-span-1 lg:col-span-4">
            <InsightCard tip={tip} />
          </motion.div>
        ))}
      </motion.div>
      {inMonth(txs, cur).length === 0 && <p className="mt-4 text-xs text-muted">Non ci sono ancora movimenti per {monthLabel(cur, true)}.</p>}
    </>
  )
}
