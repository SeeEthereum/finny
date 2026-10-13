import { ArrowUp, CalendarClock, Repeat, User } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { BudgetRing, ShareBar } from '../components/charts/charts'
import { Empty, NoticeRow, PageHeader, ReviewCard } from '../components/shared'
import { Avatar, BigMoney, Button, Card, Chip, cx, Segmented, stagger } from '../components/ui/primitives'
import type { Overlap, Subscription } from '../lib/analytics'
import { category } from '../lib/categories'
import { daysBetween, money, shortDate, todayISO } from '../lib/format'
import { useUi } from '../store/ui'
import { useSubscriptionReview } from '../store/review'
import { useFinny } from '../store/useFinny'

const CYCLE_DAYS: Record<string, number> = { settimanale: 7, mensile: 30, bimestrale: 61, trimestrale: 91, annuale: 365 }
const CADENCE_LABEL: Record<string, string> = { settimanale: 'Settimanale', mensile: 'Mensile', bimestrale: 'Bimestrale', trimestrale: 'Trimestrale', annuale: 'Annuale' }
// group colors, largest first: ink, coral, then quieter steps
const GROUP_COLORS = ['var(--series-1)', 'var(--accent)', '#9c9a94', '#c9c7c1', 'var(--accent-2)', '#dedcd7']
const perMonth = (s: Subscription) => s.yearly / 12

export default function Abbonamenti() {
  const accounts = useFinny((s) => s.accounts)
  const { all, active, stopped, overlaps, openOverlaps, raises, toReview, dismissed, dismiss } = useSubscriptionReview()
  const tab = useUi((s) => s.subsTab)
  const setTab = useUi((s) => s.setSubsTab)

  if (!all.length) {
    return (
      <>
        <PageHeader eyebrow="Abbonamenti e spese fisse" title="Ricorrenti" />
        <Card>
          <Empty icon={<Repeat />} title="Nessun addebito ricorrente trovato" body="Servono almeno 2-3 mesi di movimenti perché Finny riconosca abbonamenti e spese fisse." />
        </Card>
      </>
    )
  }

  const accountName = accounts.length === 1 ? accounts[0].name : undefined

  return (
    <>
      <PageHeader eyebrow="Abbonamenti e spese fisse" title="Ricorrenti" />
      <div className="mb-5 max-w-xl">
        <Segmented
          id="subs-tab"
          stretch
          value={tab}
          onChange={setTab}
          options={[
            { value: 'attivi', label: 'Attivi', count: active.length },
            { value: 'rivedere', label: 'Da rivedere', count: toReview },
            { value: 'interrotti', label: 'Interrotti', count: stopped.length },
          ]}
        />
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
          {tab === 'attivi' && (
            <Active subs={active} overlaps={openOverlaps} toReview={toReview} reviewSaving={openOverlaps.reduce((a, o) => a + o.monthlySaving, 0)} onReview={() => setTab('rivedere')} accountName={accountName} />
          )}
          {tab === 'rivedere' && <Review overlaps={overlaps} dismissed={dismissed} onDismiss={dismiss} raises={raises} />}
          {tab === 'interrotti' && <Stopped subs={stopped} />}
        </motion.div>
      </AnimatePresence>
    </>
  )
}

function Active({
  subs,
  overlaps,
  toReview,
  reviewSaving,
  onReview,
  accountName,
}: {
  subs: Subscription[]
  overlaps: Overlap[]
  toReview: number
  reviewSaving: number
  onReview: () => void
  accountName?: string
}) {
  const [sort, setSort] = useState<'costo' | 'data'>('costo')
  const monthly = subs.reduce((a, s) => a + perMonth(s), 0)
  const flagged = new Set(overlaps.flatMap((o) => o.items.map((s) => s.merchant)))
  const today = todayISO()

  const groups = useMemo(() => {
    const by = new Map<string, Subscription[]>()
    for (const s of subs) by.set(category(s.category).label, [...(by.get(category(s.category).label) ?? []), s])
    return [...by.entries()]
      .map(([label, items]) => ({ label, items, total: items.reduce((a, s) => a + perMonth(s), 0) }))
      .sort((a, b) => b.total - a.total)
  }, [subs])

  const shares = groups.slice(0, 5).map((g, i) => ({ label: g.label, value: g.total, color: GROUP_COLORS[i] }))
  const rest = groups.slice(5).reduce((a, g) => a + g.total, 0)
  if (rest > 0) shares.push({ label: 'Altro', value: rest, color: GROUP_COLORS[5] })
  const upcoming = [...subs].filter((s) => s.next).sort((a, b) => a.next.localeCompare(b.next)).slice(0, 3)

  return (
    <motion.div variants={stagger.container} initial="hidden" animate="show" className="grid gap-4 lg:grid-cols-12 lg:gap-5">
      <motion.div variants={stagger.item} className="space-y-4 lg:col-span-5">
        <Card className="p-5 sm:p-6">
          <div className="flex items-baseline justify-between gap-3">
            <BigMoney value={monthly} size="md" unit="al mese" />
            <span className="text-sm text-muted">per gruppo</span>
          </div>
          <div className="mt-1 text-sm text-fg-2">
            {subs.length} addebiti automatici · {money(monthly * 12, { round: true })} all'anno
          </div>
          <div className="mt-5">
            <ShareBar items={shares} />
          </div>
        </Card>

        {toReview > 0 && (
          <ReviewCard count={toReview} saving={reviewSaving} onReview={onReview} />
        )}

        {upcoming.length > 0 && (
          <div>
            <div className="eyebrow mb-2 px-1">Prossimi addebiti</div>
            <div className="space-y-3">
              {upcoming.map((s) => {
                const days = Math.max(0, daysBetween(today, s.next))
                const cycle = CYCLE_DAYS[s.cadence] ?? 30
                return (
                  <Card key={s.merchant} className="flex items-center gap-4 p-4">
                    <div className="relative grid place-items-center">
                      <BudgetRing spent={cycle - days} budget={cycle} size={64} color="var(--accent)" />
                      <span className="figure absolute text-[17px] text-fg">{days === 0 ? 'oggi' : `${days}g`}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Avatar name={s.merchant} size={22} />
                        <span className="truncate text-[16px] font-medium text-fg">{s.merchant}</span>
                      </div>
                      <div className="mt-1 text-[13px] text-fg-2">
                        {money(s.amount)} · {shortDate(s.next)}
                        {accountName && ` · ${accountName}`}
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>
        )}
      </motion.div>

      <motion.div variants={stagger.item} className="lg:col-span-7">
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <span className="text-[15px] text-fg-2">{subs.length} addebiti ricorrenti</span>
          <Segmented
            id="subs-sort"
            size="sm"
            value={sort}
            onChange={setSort}
            options={[
              { value: 'costo', label: 'Più cari' },
              { value: 'data', label: 'Prossimi' },
            ]}
          />
        </div>
        <div className="space-y-6">
          {(sort === 'costo' ? groups : [{ label: 'In ordine di addebito', items: [...subs].sort((a, b) => a.next.localeCompare(b.next)), total: monthly }]).map((g) => (
            <section key={g.label}>
              <div className="mb-2 flex items-baseline justify-between px-1 text-[15px]">
                <span className="font-medium text-fg-2">
                  {g.label} · {g.items.length}
                </span>
                <span className="text-fg-2 tabular-nums">{money(g.total)}/mese</span>
              </div>
              <div className="space-y-2.5">
                {(sort === 'costo' ? [...g.items].sort((a, b) => perMonth(b) - perMonth(a)) : g.items).map((s, i) => (
                  <SubRow key={s.merchant} s={s} flagged={flagged.has(s.merchant)} onFlag={onReview} accountName={accountName} index={i} />
                ))}
              </div>
            </section>
          ))}
        </div>
        <p className="mt-6 px-1 text-xs text-muted">
          Ricorrente = stesso esercente, importo simile, a intervalli regolari. Le bollette possono variare fino al 50%. PAC e conto deposito sono esclusi.
        </p>
      </motion.div>
    </motion.div>
  )
}

function SubRow({ s, flagged, onFlag, accountName, index }: { s: Subscription; flagged?: boolean; onFlag?: () => void; accountName?: string; index: number }) {
  const go = useFinny((st) => st.go)
  const setSearch = useUi((st) => st.setSearch)
  const setCategory = useUi((st) => st.setCategory)
  const raised = s.priceChange && s.priceChange.to > s.priceChange.from
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 8) * 0.03 }}>
      <Card className="flex items-center gap-3.5 rounded-[24px] px-4 py-3.5">
        <button
          className="flex min-w-0 flex-1 items-center gap-3.5 text-left"
          onClick={() => {
            setCategory('all')
            setSearch(s.merchant)
            go('movimenti')
          }}
        >
          <Avatar name={s.merchant} size={46} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[16px] font-medium text-fg">{s.merchant}</span>
            <span className="block truncate text-[13.5px] text-fg-2">
              {CADENCE_LABEL[s.cadence]} · {s.stopped ? `ultimo ${shortDate(s.last)}` : shortDate(s.next)}
              {accountName && ` · ${accountName}`}
            </span>
          </span>
        </button>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="figure text-[17px] text-fg tabular-nums">{money(s.amount)}</span>
          {flagged && (
            <Chip tone="flag" onClick={onFlag} className="px-2.5 py-0.5 text-[12.5px]">
              Doppione?
            </Chip>
          )}
          {!flagged && raised && (
            <Chip tone="flag" className="px-2.5 py-0.5 text-[12.5px]">
              +{money(s.priceChange!.to - s.priceChange!.from)}
            </Chip>
          )}
        </div>
      </Card>
    </motion.div>
  )
}

function Review({ overlaps, dismissed, onDismiss, raises }: { overlaps: Overlap[]; dismissed: string[]; onDismiss: (id: string) => void; raises: Subscription[] }) {
  const open = overlaps.filter((o) => !dismissed.includes(o.id))
  const [current, setCurrent] = useState(open[0]?.id ?? '')
  const o = open.find((x) => x.id === current) ?? open[0]
  const go = useFinny((s) => s.go)
  const setSearch = useUi((s) => s.setSearch)
  const setCategory = useUi((s) => s.setCategory)

  if (!overlaps.length && !raises.length) {
    return (
      <Card>
        <Empty icon={<CalendarClock />} title="Niente da rivedere" body="Nessun rincaro recente e nessun servizio che sembri fare lo stesso lavoro di un altro." />
      </Card>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-12 lg:gap-5">
      <div className="lg:col-span-7">
        {o ? (
          <>
            <div className="no-scrollbar -mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
              {open.map((x) => (
                <Chip key={x.id} active={x.id === o.id} onClick={() => setCurrent(x.id)}>
                  {x.label}
                </Chip>
              ))}
            </div>
            <h2 className="mb-4 text-[26px] text-fg">Potrebbero fare la stessa cosa</h2>
            <div className="grid grid-cols-2 gap-3">
              {o.items.slice(0, 4).map((s, i) => (
                <motion.div key={s.merchant} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                  <Card className={cx('h-full p-4', i === o.items.length - 1 && 'outline-[1.5px] outline-accent outline-solid')}>
                    <Avatar name={s.merchant} size={44} />
                    <div className="mt-3 truncate text-[17px] font-medium text-fg">{s.merchant}</div>
                    <div className="text-[14px] text-fg-2">
                      {money(perMonth(s))}/mese · da {shortDate(s.history[0]?.date ?? s.last)}
                    </div>
                    <div className="mt-3 flex items-center gap-1.5 border-t border-line pt-3 text-[13px] text-fg-2">
                      <User size={13} /> {s.count} addebiti trovati
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
            <Card className="mt-3 p-5">
              <div className="eyebrow">Perché lo segnalo</div>
              <p className="mt-2 text-[16px] text-fg">
                Sono tutti servizi di {o.label.toLowerCase()}. C'è chi ne paga più d'uno apposta: solo tu sai se li usi davvero tutti.
              </p>
              <div className="mt-4 flex items-baseline justify-between gap-3">
                <span className="text-[15px] text-fg-2">Tenerne uno solo fa risparmiare</span>
                <span className="figure text-[19px] text-fg tabular-nums">
                  {money(o.monthlySaving)}/mese · {money(o.monthlySaving * 12, { round: true })}/anno
                </span>
              </div>
            </Card>
            <div className="mt-4 flex gap-3">
              <Button variant="secondary" size="lg" className="flex-1" onClick={() => onDismiss(o.id)}>
                Li tengo tutti
              </Button>
              <Button
                size="lg"
                className="flex-[1.6]"
                onClick={() => {
                  setCategory('all')
                  setSearch(o.items[o.items.length - 1].merchant)
                  go('movimenti')
                }}
              >
                Vedi i pagamenti
              </Button>
            </div>
          </>
        ) : (
          <Card>
            <Empty icon={<CalendarClock />} title="Nessun doppione aperto" body="I gruppi che hai già controllato sono elencati qui accanto." />
          </Card>
        )}
      </div>

      <div className="space-y-3 lg:col-span-5">
        {raises.length > 0 && (
          <>
            <div className="eyebrow px-1">Rincari recenti</div>
            {raises.map((s) => (
              <NoticeRow
                key={s.merchant}
                icon={ArrowUp}
                title={`${s.merchant} costa di più`}
                detail={`da ${money(s.priceChange!.from)} a ${money(s.priceChange!.to)} · +${money((s.priceChange!.to - s.priceChange!.from) * (s.yearly / s.amount), { round: true })}/anno`}
                onClick={() => {
                  setCategory('all')
                  setSearch(s.merchant)
                  go('movimenti')
                }}
              />
            ))}
          </>
        )}
        {overlaps.filter((x) => x.id !== o?.id).length > 0 && (
          <>
            <div className="eyebrow px-1 pt-2">Altre possibili sovrapposizioni</div>
            {overlaps
              .filter((x) => x.id !== o?.id)
              .map((x) => (
                <Card key={x.id} className="flex items-center gap-3.5 rounded-[24px] px-4 py-3.5">
                  <Avatar name={x.items[0].merchant} size={42} />
                  <button className="min-w-0 flex-1 text-left" onClick={() => setCurrent(x.id)} disabled={dismissed.includes(x.id)}>
                    <span className="block truncate text-[16px] font-medium text-fg">{x.items.map((s) => s.merchant).join(' + ')}</span>
                    <span className="block truncate text-[13.5px] text-fg-2">{x.label}</span>
                  </button>
                  {dismissed.includes(x.id) ? <Chip tone="muted">Ignorato</Chip> : <span className="figure text-[16px] text-fg tabular-nums">{money(x.monthlySaving)}</span>}
                </Card>
              ))}
          </>
        )}
      </div>
    </div>
  )
}

function Stopped({ subs }: { subs: Subscription[] }) {
  if (!subs.length) {
    return (
      <Card>
        <Empty icon={<Repeat />} title="Nessun addebito interrotto" body="Quando un abbonamento smette di essere addebitato per più di due cicli, lo trovi qui." />
      </Card>
    )
  }
  return (
    <div className="max-w-2xl space-y-2.5">
      <p className="mb-3 px-1 text-[15px] text-fg-2">Non li vedo addebitati da più di due cicli: probabilmente li hai disdetti. Controlla che sia davvero così.</p>
      {subs.map((s, i) => (
        <SubRow key={s.merchant} s={s} index={i} />
      ))}
    </div>
  )
}
