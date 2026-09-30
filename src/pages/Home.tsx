import { ArrowDownLeft, ArrowUpRight, CalendarClock, FileUp, PiggyBank, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo } from 'react'
import { CashflowChart, Sparkline } from '../components/charts/charts'
import { ChartCard, Legend } from '../components/charts/kit'
import { CategoryBars, Empty, PageHeader, TxRow } from '../components/shared'
import { AnimatedNumber, Button, Card, CategoryIcon, Delta, SectionTitle, stagger } from '../components/ui/primitives'
import { VocinaCarousel } from '../components/Vocina'
import { categoryTotals, inMonth } from '../lib/analytics'
import { daysBetween, money, monthLabel, percent, shiftMonth, shortDate, todayISO } from '../lib/format'
import { useDerived } from '../store/derived'
import { useFinny } from '../store/useFinny'

function greeting() {
  const h = new Date().getHours()
  return h < 5 ? 'Buonanotte' : h < 13 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera'
}

export default function Home() {
  const txs = useFinny((s) => s.transactions)
  const accounts = useFinny((s) => s.accounts)
  const isDemo = useFinny((s) => s.isDemo)
  const go = useFinny((s) => s.go)
  const { cur, stats, subs, insights } = useDerived()

  const thisM = stats[stats.length - 1]
  const prevM = stats[stats.length - 2]
  const totals = useMemo(() => categoryTotals(inMonth(txs, cur)), [txs, cur])
  const knownBalance = accounts.filter((a) => a.balance)
  const balance = knownBalance.reduce((a, acc) => a + (acc.balance?.amount ?? 0), 0)
  const today = todayISO()
  const upcoming = subs.filter((s) => daysBetween(today, s.next) <= 30).sort((a, b) => a.next.localeCompare(b.next)).slice(0, 5)
  const netSeries = stats.map((s) => s.net)
  const cumulative = netSeries.reduce<number[]>((acc, v) => [...acc, (acc[acc.length - 1] ?? 0) + v], [])

  if (!txs.length) {
    return (
      <>
        <PageHeader eyebrow="Panoramica" title="Iniziamo dai tuoi movimenti" />
        <Card className="p-2">
          <Empty
            icon={<FileUp />}
            title="Nessun movimento ancora"
            body="Carica l'estratto conto in CSV, Excel o PDF. Finny lo legge qui nel browser e non lo invia a nessun server."
            action={<Button onClick={() => go('importa')}>Importa un estratto conto</Button>}
          />
        </Card>
      </>
    )
  }

  const tiles = [
    { label: 'Entrate', value: thisM.income, prev: prevM?.income, icon: ArrowDownLeft, good: true, color: 'var(--series-1)', spark: stats.map((s) => s.income) },
    { label: 'Uscite', value: thisM.expenses, prev: prevM?.expenses, icon: ArrowUpRight, good: false, color: 'var(--series-2)', spark: stats.map((s) => s.expenses) },
    { label: 'Risparmiato', value: thisM.net, prev: prevM?.net, icon: PiggyBank, good: true, color: 'var(--series-3)', spark: netSeries },
  ]

  return (
    <>
      <PageHeader eyebrow={`${greeting()} · ${monthLabel(cur, true)}`} title={<>La tua situazione, <span className="text-accent">in chiaro.</span></>}>
        {isDemo && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
            <Sparkles size={13} /> Dati di esempio
          </span>
        )}
        <Button onClick={() => go('importa')}>
          <FileUp size={16} /> Importa
        </Button>
      </PageHeader>

      <motion.div variants={stagger.container} initial="hidden" animate="show" className="grid gap-4 lg:grid-cols-12 lg:gap-5">
        {/* Hero: the one number this view leads with */}
        <motion.div variants={stagger.item} className="lg:col-span-7">
          <Card tilt className="h-full overflow-hidden p-6 sm:p-7">
            <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-accent/10 blur-3xl" />
            <div className="eyebrow">{knownBalance.length ? 'Saldo totale' : 'Risparmio netto, 12 mesi'}</div>
            <div className="mt-3 text-[44px] leading-none font-semibold tracking-[-0.03em] text-fg sm:text-[60px]">
              <AnimatedNumber value={knownBalance.length ? balance : cumulative[cumulative.length - 1] ?? 0} duration={1.6} />
            </div>
            <div className="mt-3 text-sm text-fg-2">
              {knownBalance.length
                ? `${knownBalance.length === 1 ? '1 conto' : `${knownBalance.length} conti`} · aggiornato al ${shortDate(knownBalance.map((a) => a.balance!.date).sort().pop()!)}`
                : 'Il tuo estratto non riporta il saldo: mostro quanto hai messo da parte.'}
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {accounts.map((a) => (
                <span key={a.id} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/60 px-3 py-1.5 text-xs text-fg-2">
                  <span className="size-1.5 rounded-full bg-accent" />
                  {a.name}
                  {a.balance && <span className="font-semibold text-fg tabular-nums">{money(a.balance.amount, { round: true })}</span>}
                </span>
              ))}
            </div>
            <div className="mt-6">
              <div className="mb-1 flex items-center justify-between text-xs text-muted">
                <span>Risparmio cumulato</span>
                <span className="tabular-nums">{money(cumulative[cumulative.length - 1] ?? 0, { round: true, sign: true })}</span>
              </div>
              <Sparkline values={cumulative} color="var(--accent)" height={56} />
            </div>
          </Card>
        </motion.div>

        <motion.div variants={stagger.item} className="grid gap-4 sm:grid-cols-3 lg:col-span-5 lg:grid-cols-1 lg:gap-3">
          {tiles.map((t) => (
            <Card key={t.label} className="flex items-center gap-4 p-4 sm:flex-col sm:items-stretch lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm text-fg-2">
                  <t.icon size={15} style={{ color: t.color }} />
                  {t.label} · {monthLabel(cur)}
                </div>
                <div className="mt-1 flex flex-wrap items-baseline gap-2">
                  <span className="text-2xl font-semibold text-fg">
                    <AnimatedNumber value={t.value} format={(n) => money(n, { round: true })} />
                  </span>
                  {t.prev ? <Delta value={(t.value - t.prev) / Math.abs(t.prev)} goodWhenUp={t.good} /> : null}
                </div>
                {t.label === 'Risparmiato' && thisM.income > 0 && (
                  <div className="mt-0.5 text-xs text-muted">tasso di risparmio {percent(thisM.savingsRate)}</div>
                )}
              </div>
              <div className="w-28 shrink-0 sm:w-full lg:w-28">
                <Sparkline values={t.spark} color={t.color} height={40} />
              </div>
            </Card>
          ))}
        </motion.div>

        <motion.div variants={stagger.item} className="lg:col-span-12">
          <VocinaCarousel insights={insights} />
        </motion.div>

        <motion.div variants={stagger.item} className="lg:col-span-8">
          <ChartCard
            id="cashflow"
            eyebrow="Ultimi 12 mesi"
            title="Entrate e uscite"
            legend={<Legend items={[{ label: 'Entrate', color: 'var(--series-1)' }, { label: 'Uscite', color: 'var(--series-2)' }]} />}
            chart={<CashflowChart data={stats} />}
            table={{
              head: ['Mese', 'Entrate', 'Uscite', 'Risparmio'],
              rows: stats.map((s) => [monthLabel(s.key, true), money(s.income, { round: true }), money(s.expenses, { round: true }), money(s.net, { round: true })]),
            }}
          />
        </motion.div>

        <motion.div variants={stagger.item} className="lg:col-span-4">
          <Card className="h-full p-5 sm:p-6">
            <SectionTitle eyebrow={monthLabel(cur, true)} title="Dove vanno i soldi" />
            <div className="mt-4">
              <CategoryBars totals={totals} limit={5} />
            </div>
          </Card>
        </motion.div>

        <motion.div variants={stagger.item} className="lg:col-span-5">
          <Card className="h-full p-5 sm:p-6">
            <SectionTitle
              eyebrow="Prossimi 30 giorni"
              title="In arrivo"
              action={
                <button onClick={() => go('abbonamenti')} className="text-sm font-semibold text-accent">
                  Tutti
                </button>
              }
            />
            <ul className="mt-4 space-y-1">
              {upcoming.map((s) => (
                <li key={s.merchant} className="flex items-center gap-3 rounded-xl px-2 py-2">
                  <CategoryIcon id={s.category} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-fg">{s.merchant}</div>
                    <div className="flex items-center gap-1 text-xs text-muted">
                      <CalendarClock size={12} /> {shortDate(s.next)} · {s.cadence}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-fg tabular-nums">{money(-s.amount)}</div>
                </li>
              ))}
              {!upcoming.length && <li className="px-2 py-6 text-sm text-muted">Nessun addebito ricorrente previsto nei prossimi 30 giorni.</li>}
            </ul>
          </Card>
        </motion.div>

        <motion.div variants={stagger.item} className="lg:col-span-7">
          <Card className="h-full p-5 sm:p-6">
            <SectionTitle
              eyebrow={`${txs.length.toLocaleString('it-IT')} movimenti`}
              title="Ultimi movimenti"
              action={
                <button onClick={() => go('movimenti')} className="text-sm font-semibold text-accent">
                  Vedi tutti
                </button>
              }
            />
            <div className="mt-3">
              {txs.slice(0, 7).map((t) => (
                <TxRow key={t.id} t={t} onClick={() => go('movimenti')} />
              ))}
            </div>
          </Card>
        </motion.div>
      </motion.div>
      <p className="mt-6 text-xs text-muted">
        Il confronto è con {monthLabel(shiftMonth(cur, -1), true)}. I giroconti tra i tuoi conti non contano come entrate o uscite; PAC e conto deposito contano come risparmio.
      </p>
    </>
  )
}
