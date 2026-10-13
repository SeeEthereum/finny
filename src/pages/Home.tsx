import { FileUp, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, type ReactNode } from 'react'
import { AiBrief } from '../components/AiBrief'
import { CashflowChart, PillBars, ShareBar } from '../components/charts/charts'
import { ChartCard, Legend } from '../components/charts/kit'
import { Empty, PageHeader, ReviewCard, TxRow } from '../components/shared'
import { Avatar, BigMoney, Button, Card, Chip, Delta, stagger } from '../components/ui/primitives'
import { InsightRow, Orb } from '../components/Vocina'
import { bucketSplit, categoryTotals, inMonth, inRange, lastDate, monthlyStats } from '../lib/analytics'
import { category } from '../lib/categories'
import { daysBetween, daysInMonth, money, monthLabel, percent, shiftMonth, shortDate, todayISO } from '../lib/format'
import type { CategoryId } from '../lib/types'
import { useAiReady } from '../store/ai'
import { useDerived } from '../store/derived'
import { useSubscriptionReview } from '../store/review'
import { useUi } from '../store/ui'
import { useFinny } from '../store/useFinny'

const REST = '__rest'

function greeting() {
  const h = new Date().getHours()
  return h < 5 ? 'Buonanotte' : h < 13 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera'
}

function inDays(n: number) {
  return n <= 0 ? 'oggi' : n === 1 ? 'domani' : `tra ${n} giorni`
}

/** Quiet text link in a gray pill, for "see all" on a section */
function More({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="rounded-full bg-surface-2 px-3 py-1 text-sm font-medium text-fg-2 transition-colors hover:bg-surface-3 hover:text-fg">
      {children}
    </button>
  )
}

function Heading({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <div className="mb-0.5 text-sm text-fg-2">{eyebrow}</div>}
        <h2 className="text-[22px] leading-tight text-fg">{title}</h2>
      </div>
      {action}
    </div>
  )
}

export default function Home() {
  const txs = useFinny((s) => s.transactions)
  const accounts = useFinny((s) => s.accounts)
  const isDemo = useFinny((s) => s.isDemo)
  const go = useFinny((s) => s.go)
  const setCategory = useUi((s) => s.setCategory)
  const setSearch = useUi((s) => s.setSearch)
  const setSubsTab = useUi((s) => s.setSubsTab)
  const { cur, stats, subs, insights } = useDerived()
  const { toReview, openOverlaps } = useSubscriptionReview()
  const aiReady = useAiReady()

  const thisM = stats[stats.length - 1]
  // a month still running is compared with the same days of the month before, not with all of it
  const last = lastDate(txs)
  const partial = last.slice(0, 7) === cur && Number(last.slice(8, 10)) < daysInMonth(cur)
  const prevM = useMemo(() => {
    const pk = shiftMonth(cur, -1)
    const upTo = partial ? `${pk}-${last.slice(8, 10)}` : `${pk}-31`
    const list = inRange(txs, `${pk}-01`, upTo)
    return list.length ? monthlyStats(list, 1, pk)[0] : undefined
  }, [txs, cur, partial, last])
  const monthTxs = useMemo(() => inMonth(txs, cur), [txs, cur])
  const totals = useMemo(() => categoryTotals(monthTxs), [monthTxs])
  const split = useMemo(() => bucketSplit(monthTxs), [monthTxs])
  const knownBalance = accounts.filter((a) => a.balance)
  const balance = knownBalance.reduce((a, acc) => a + (acc.balance?.amount ?? 0), 0)
  const today = todayISO()
  const upcoming = subs.filter((s) => daysBetween(today, s.next) <= 30).sort((a, b) => a.next.localeCompare(b.next)).slice(0, 5)
  const since = monthLabel(stats[0]?.key ?? cur, true)
  // entrate meno uscite over the whole period: not the balance, but it says which way it went
  const gap = stats.reduce((a, s) => a + s.net, 0)
  // money moved in from your other accounts or savings over the same months: it explains
  // how the balance can stay positive while spending exceeds income
  const fromOwn = useMemo(() => {
    const from = `${stats[0]?.key ?? cur}-01`
    return txs.filter((t) => t.date >= from && (t.category === 'trasferimenti' || t.category === 'investimenti')).reduce((a, t) => a + t.amount, 0)
  }, [txs, stats, cur])

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

  // the four biggest categories this month, the rest folded into one ink bar
  const top = totals.slice(0, 4)
  const rest = totals.slice(4).reduce((a, c) => a + c.total, 0)
  const bars = [
    ...top.map((c) => ({ key: c.id as string, label: category(c.id).short ?? category(c.id).label, value: c.total })),
    ...(rest > 0 ? [{ key: REST, label: `Altre ${totals.length - 4}`, value: rest, ink: true }] : []),
  ]

  const tiles = [
    { label: 'Entrate', value: thisM.income, prev: prevM?.income, good: true },
    { label: 'Uscite', value: thisM.expenses, prev: prevM?.expenses, good: false },
    { label: 'Risparmiato', value: thisM.net, prev: prevM?.net, good: true },
  ]

  return (
    <>
      <PageHeader eyebrow={`${greeting()} · ${monthLabel(cur, true)}`} title="Panoramica">
        {isDemo && (
          <Chip tone="flag">
            <Sparkles size={13} /> Dati di esempio
          </Chip>
        )}
      </PageHeader>

      <motion.div variants={stagger.container} initial="hidden" animate="show" className="grid gap-4 lg:grid-cols-12 lg:gap-5">
        {/* Hero: the one number this view leads with, straight on the ground like the reference */}
        <motion.section variants={stagger.item} className="lg:col-span-7 lg:pt-2 lg:pr-6">
          <div className="text-sm text-fg-2">{knownBalance.length ? 'Saldo totale' : `Entrate meno uscite da ${since}`}</div>
          <BigMoney value={knownBalance.length ? balance : gap} size="xl" duration={1.6} className="mt-2" />
          <p className="mt-3 max-w-[54ch] text-[15px] text-fg-2">
            {knownBalance.length
              ? `${knownBalance.length === 1 ? '1 conto' : `${knownBalance.length} conti`} · aggiornato al ${shortDate(knownBalance.map((a) => a.balance!.date).sort().pop()!)}`
              : "L'estratto non riporta il saldo: questa è la differenza tra entrate e uscite, non il saldo del conto."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {accounts.map((a) => (
              <Chip key={a.id}>
                {a.name}
                {a.balance && <span className="figure text-fg-2 tabular-nums">{money(a.balance.amount, { round: true })}</span>}
              </Chip>
            ))}
          </div>
          {knownBalance.length > 0 && (
            <p className="mt-4 max-w-[60ch] text-[13px] text-muted">
              Entrate meno uscite da {since}: <span className="font-semibold text-fg-2 tabular-nums">{money(gap, { round: true, sign: true })}</span>.
              {gap < 0 && fromOwn > 0 && (
                <> Il conto non è in rosso perché nello stesso periodo sono arrivati {money(fromOwn, { round: true })} netti dai tuoi altri conti e risparmi.</>
              )}
            </p>
          )}
        </motion.section>

        {/* This month: three figures, then how the income was used */}
        <motion.div variants={stagger.item} className="lg:col-span-5">
          <Card className="h-full p-5 sm:p-6">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[19px] text-fg">Questo mese</h2>
              <span className="text-sm text-muted">{partial ? `dal 1 al ${shortDate(last)}` : monthLabel(cur, true)}</span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {tiles.map((t) => (
                <div key={t.label} className="min-w-0">
                  <div className="text-[13px] text-fg-2">{t.label}</div>
                  <div className="figure mt-1 truncate text-[20px] text-fg tabular-nums sm:text-[22px]">{money(t.value, { round: true })}</div>
                  {/* a percentage from zero, or from a negative to a positive saving, says nothing */}
                  <div className="mt-0.5 h-4">{t.prev && t.prev > 0 && t.value > 0 ? <Delta value={(t.value - t.prev) / t.prev} goodWhenUp={t.good} /> : null}</div>
                </div>
              ))}
            </div>
            <div className="mt-5 border-t border-line pt-4">
              <div className="mb-3 flex items-baseline justify-between gap-3 text-sm">
                <span className="text-fg-2">{thisM.income > 0 ? 'Come hai usato le entrate' : 'Come hai speso'}</span>
                {thisM.income > 0 && <span className="text-muted">risparmio {percent(thisM.savingsRate)}</span>}
              </div>
              <ShareBar
                items={[
                  { label: 'Necessità', value: split.needs, color: 'var(--series-1)' },
                  { label: 'Desideri', value: split.wants, color: 'var(--accent)' },
                  { label: 'Risparmio', value: split.savings, color: 'var(--series-3)' },
                ]}
              />
            </div>
          </Card>
        </motion.div>

        {toReview > 0 && (
          <motion.div variants={stagger.item} className="lg:col-span-12">
            <ReviewCard
              count={toReview}
              saving={openOverlaps.reduce((a, o) => a + o.monthlySaving, 0)}
              onReview={() => {
                setSubsTab('rivedere')
                go('abbonamenti')
              }}
            />
          </motion.div>
        )}

        <motion.div variants={stagger.item} className="lg:col-span-5">
          <Card className="h-full p-5 sm:p-6">
            <Heading eyebrow={monthLabel(cur, true)} title="Dove vanno i soldi" action={<More onClick={() => go('analisi')}>Analisi</More>} />
            <div className="mt-5">
              {bars.length ? (
                <PillBars
                  items={bars}
                  height={236}
                  onSelect={(key) => {
                    if (key === REST) return go('analisi')
                    setSearch('')
                    setCategory(key as CategoryId)
                    go('movimenti')
                  }}
                />
              ) : (
                <p className="py-10 text-center text-sm text-muted">Nessuna spesa in questo mese.</p>
              )}
            </div>
          </Card>
        </motion.div>

        <motion.section variants={stagger.item} className="lg:col-span-7">
          {aiReady && !isDemo ? (
            <AiBrief />
          ) : (
            <>
              <div className="mb-3 flex items-center gap-3">
                <Orb size={40} />
                <div className="min-w-0 flex-1">
                  <Heading eyebrow="La vocina" title="Cosa ho notato" action={<More onClick={() => go('analisi')}>Tutti</More>} />
                </div>
              </div>
              <motion.div variants={stagger.container} className="space-y-2.5">
                {insights.slice(0, 4).map((tip) => (
                  <motion.div key={tip.id} variants={stagger.item}>
                    <InsightRow tip={tip} />
                  </motion.div>
                ))}
              </motion.div>
            </>
          )}
        </motion.section>

        <motion.div variants={stagger.item} className="lg:col-span-8">
          <ChartCard
            id="cashflow"
            eyebrow={`Da ${since}`}
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
            <Heading eyebrow="Prossimi 30 giorni" title="In arrivo" action={<More onClick={() => go('abbonamenti')}>Tutti</More>} />
            <ul className="mt-4 space-y-1">
              {upcoming.map((s) => (
                <li key={s.merchant} className="flex items-center gap-3 py-1.5">
                  <Avatar name={s.merchant} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-medium text-fg">{s.merchant}</div>
                    <div className="text-[13px] text-fg-2">
                      {shortDate(s.next)} · {inDays(daysBetween(today, s.next))}
                    </div>
                  </div>
                  <div className="figure text-[15px] text-fg tabular-nums">{money(-s.amount)}</div>
                </li>
              ))}
              {!upcoming.length && <li className="py-6 text-sm text-muted">Nessun addebito ricorrente previsto nei prossimi 30 giorni.</li>}
            </ul>
          </Card>
        </motion.div>

        <motion.div variants={stagger.item} className="lg:col-span-12">
          <Card className="p-5 sm:p-6">
            <Heading eyebrow={`${txs.length.toLocaleString('it-IT')} movimenti`} title="Ultimi movimenti" action={<More onClick={() => go('movimenti')}>Vedi tutti</More>} />
            <div className="mt-3 grid gap-x-6 lg:grid-cols-2">
              {txs.slice(0, 8).map((t) => (
                <TxRow key={t.id} t={t} onClick={() => go('movimenti')} />
              ))}
            </div>
          </Card>
        </motion.div>
      </motion.div>
      <p className="mt-6 text-xs text-muted">
        Il confronto è con {partial ? `gli stessi giorni di ${monthLabel(shiftMonth(cur, -1), true)}` : monthLabel(shiftMonth(cur, -1), true)}. I giroconti tra i tuoi conti non contano come entrate o uscite; PAC e conto deposito contano come risparmio.
      </p>
    </>
  )
}
