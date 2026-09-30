import { Search, Trash2, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Empty, PageHeader, TxRow } from '../components/shared'
import { Sheet } from '../components/ui/Sheet'
import { toast } from '../components/ui/toast'
import { Button, Card, CategoryIcon, cx, Segmented } from '../components/ui/primitives'
import { isExpense, isIncome } from '../lib/analytics'
import { CATEGORIES, category } from '../lib/categories'
import { normalize } from '../lib/categorize'
import { dayLabel, money } from '../lib/format'
import type { CategoryId, Transaction } from '../lib/types'
import { useUi } from '../store/ui'
import { useFinny } from '../store/useFinny'

type Kind = 'all' | 'in' | 'out'
const PAGE = 120

export default function Movimenti() {
  const txs = useFinny((s) => s.transactions)
  const accounts = useFinny((s) => s.accounts)
  const { search, setSearch, category: cat, setCategory } = useUi()
  const [kind, setKind] = useState<Kind>('all')
  const [account, setAccount] = useState('all')
  const [limit, setLimit] = useState(PAGE)
  const [selected, setSelected] = useState<Transaction | null>(null)

  const filtered = useMemo(() => {
    const q = normalize(search)
    return txs.filter((t) => {
      if (cat !== 'all' && t.category !== cat) return false
      if (account !== 'all' && t.accountId !== account) return false
      if (kind === 'in' && t.amount <= 0) return false
      if (kind === 'out' && t.amount >= 0) return false
      if (q && !normalize(`${t.merchant} ${t.description} ${category(t.category).label}`).includes(q)) return false
      return true
    })
  }, [txs, search, cat, account, kind])

  const totals = useMemo(() => {
    let inc = 0
    let out = 0
    for (const t of filtered) {
      if (isIncome(t)) inc += t.amount
      else if (isExpense(t)) out -= t.amount
    }
    return { inc, out }
  }, [filtered])

  const groups = useMemo(() => {
    const out: { day: string; items: Transaction[]; total: number }[] = []
    for (const t of filtered.slice(0, limit)) {
      const g = out[out.length - 1]
      if (g && g.day === t.date) {
        g.items.push(t)
        g.total += t.amount
      } else out.push({ day: t.date, items: [t], total: t.amount })
    }
    return out
  }, [filtered, limit])

  const usedCats = useMemo(() => CATEGORIES.filter((c) => txs.some((t) => t.category === c.id)), [txs])
  const filtersOn = cat !== 'all' || account !== 'all' || kind !== 'all' || search

  return (
    <>
      <PageHeader eyebrow="Movimenti" title="Ogni euro, al suo posto." />

      <Card className="sticky top-[calc(env(safe-area-inset-top,0px)+62px)] z-20 p-3 backdrop-blur-xl sm:p-4 lg:top-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="flex flex-1 items-center gap-2 rounded-xl border border-line bg-bg-2 px-3 focus-within:border-accent/60">
            <Search size={16} className="text-muted" />
            <input
              id="tx-search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setLimit(PAGE)
              }}
              placeholder="Cerca esercente, causale o categoria"
              className="h-10 min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-muted"
            />
            {search && (
              <button aria-label="Svuota ricerca" onClick={() => setSearch('')} className="text-muted hover:text-fg">
                <X size={15} />
              </button>
            )}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              id="kind"
              size="sm"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'all', label: 'Tutti' },
                { value: 'out', label: 'Uscite' },
                { value: 'in', label: 'Entrate' },
              ]}
            />
            {accounts.length > 1 && (
              <select
                id="tx-account"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                className="h-8 rounded-full border border-line bg-surface px-3 text-xs text-fg-2 outline-none"
              >
                <option value="all">Tutti i conti</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        <div className="scroll-thin -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {[{ id: 'all' as const, label: 'Tutte' }, ...usedCats].map((c) => {
            const active = cat === c.id
            return (
              <button
                key={c.id}
                onClick={() => {
                  setCategory(c.id)
                  setLimit(PAGE)
                }}
                className={cx(
                  'relative shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  active ? 'border-transparent text-accent-ink' : 'border-line text-fg-2 hover:text-fg',
                )}
              >
                {active && <motion.span layoutId="cat-chip" className="absolute inset-0 rounded-full bg-accent" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
                <span className="relative">{c.label}</span>
              </button>
            )
          })}
        </div>
      </Card>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 px-1 text-sm">
        <span className="text-fg-2">
          <span className="font-semibold text-fg tabular-nums">{filtered.length.toLocaleString('it-IT')}</span> movimenti
          {filtersOn && (
            <button
              onClick={() => {
                setSearch('')
                setCategory('all')
                setAccount('all')
                setKind('all')
              }}
              className="ml-3 text-xs font-semibold text-accent"
            >
              Azzera filtri
            </button>
          )}
        </span>
        <span className="flex gap-4 tabular-nums">
          <span className="text-good-text">+{money(totals.inc, { round: true })}</span>
          <span className="text-fg">−{money(totals.out, { round: true })}</span>
        </span>
      </div>

      <div className="mt-3 space-y-4">
        <AnimatePresence initial={false}>
          {groups.map((g, gi) => (
            <motion.section
              key={g.day}
              layout
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0, transition: { delay: Math.min(gi, 8) * 0.035 } }}
              exit={{ opacity: 0 }}
            >
              <div className="mb-1 flex items-center justify-between px-3 text-xs">
                <span className="font-semibold text-fg-2 capitalize">{dayLabel(g.day)}</span>
                <span className="text-muted tabular-nums">{money(g.total, { sign: true })}</span>
              </div>
              <Card className="p-1.5">
                {g.items.map((t) => (
                  <TxRow key={t.id} t={t} showDate={false} onClick={() => setSelected(t)} />
                ))}
              </Card>
            </motion.section>
          ))}
        </AnimatePresence>
        {!filtered.length && (
          <Card>
            <Empty icon={<Search />} title="Nessun movimento trovato" body="Prova a cambiare i filtri o a cercare un'altra parola." />
          </Card>
        )}
        {filtered.length > limit && (
          <div className="flex justify-center pt-2">
            <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE)}>
              Mostra altri {Math.min(PAGE, filtered.length - limit)}
            </Button>
          </div>
        )}
      </div>

      <TxSheet tx={selected} onClose={() => setSelected(null)} />
    </>
  )
}

function TxSheet({ tx, onClose }: { tx: Transaction | null; onClose: () => void }) {
  const txs = useFinny((s) => s.transactions)
  const accounts = useFinny((s) => s.accounts)
  const setCat = useFinny((s) => s.setCategory)
  const del = useFinny((s) => s.deleteTransaction)
  const [all, setAll] = useState(true)
  const [confirm, setConfirm] = useState(false)
  const live = tx ? txs.find((t) => t.id === tx.id) ?? tx : null
  const similar = live ? txs.filter((t) => t.merchant === live.merchant && Math.sign(t.amount) === Math.sign(live.amount)).length : 0

  return (
    <Sheet
      open={!!live}
      onClose={() => {
        setConfirm(false)
        onClose()
      }}
      title="Dettaglio movimento"
    >
      {live && (
        <div>
          <div className="flex items-center gap-3">
            <CategoryIcon id={live.category} size={44} />
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold text-fg">{live.merchant}</div>
              <div className="text-sm text-muted capitalize">{dayLabel(live.date)}</div>
            </div>
            <div className={cx('ml-auto text-2xl font-semibold tabular-nums', live.amount > 0 ? 'text-good-text' : 'text-fg')}>{money(live.amount, { sign: true })}</div>
          </div>
          <dl className="mt-5 grid gap-3 rounded-2xl border border-line bg-bg-2 p-4 text-sm">
            <div>
              <dt className="eyebrow">Causale originale</dt>
              <dd className="mt-1 font-mono text-[13px] break-words text-fg-2">{live.description}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Conto</dt>
              <dd className="text-fg">{accounts.find((a) => a.id === live.accountId)?.name ?? '—'}</dd>
            </div>
          </dl>

          <div className="mt-5 eyebrow">Categoria</div>
          <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {CATEGORIES.map((c) => {
              const active = live.category === c.id
              return (
                <motion.button
                  key={c.id}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => {
                    const n = setCat(live.id, c.id as CategoryId, all)
                    toast(all && n > 1 ? `${n} movimenti spostati in ${c.label}. Userò questa regola anche per i prossimi import.` : `Categoria aggiornata: ${c.label}`)
                  }}
                  className={cx(
                    'flex flex-col items-center gap-1 rounded-xl border p-2 text-center text-[11px] leading-tight transition-colors',
                    active ? 'border-accent bg-accent-soft text-fg' : 'border-line text-fg-2 hover:border-line-strong hover:text-fg',
                  )}
                >
                  <c.icon size={16} className={active ? 'text-accent' : ''} />
                  {c.label}
                </motion.button>
              )
            })}
          </div>
          {similar > 1 && (
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-fg-2">
              <input id="apply-all" type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="size-4 accent-[var(--accent)]" />
              Applica a tutti i {similar} movimenti di {live.merchant} e ricorda la scelta
            </label>
          )}

          <div className="mt-6 flex justify-end">
            {confirm ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-fg-2">Eliminare questo movimento?</span>
                <Button variant="ghost" onClick={() => setConfirm(false)}>
                  Annulla
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    del(live.id)
                    setConfirm(false)
                    onClose()
                    toast('Movimento eliminato')
                  }}
                >
                  Elimina
                </Button>
              </div>
            ) : (
              <Button variant="ghost" onClick={() => setConfirm(true)}>
                <Trash2 size={15} /> Elimina movimento
              </Button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  )
}
