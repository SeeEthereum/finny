import { Plus, Target, Wand2, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { BudgetRing } from '../components/charts/charts'
import { Empty, PageHeader } from '../components/shared'
import { toast } from '../components/ui/toast'
import { AnimatedNumber, Button, Card, CategoryIcon, cx } from '../components/ui/primitives'
import { categoryTotals, inMonth } from '../lib/analytics'
import { category, EXPENSE_CATEGORIES } from '../lib/categories'
import { daysInMonth, money, monthKey, monthLabel, percent, shiftMonth, todayISO } from '../lib/format'
import type { CategoryId } from '../lib/types'
import { useDerived } from '../store/derived'
import { useFinny } from '../store/useFinny'

export default function Budget() {
  const txs = useFinny((s) => s.transactions)
  const budgets = useFinny((s) => s.budgets)
  const setBudget = useFinny((s) => s.setBudget)
  const { cur } = useDerived()
  const [adding, setAdding] = useState(false)
  const [newCat, setNewCat] = useState<CategoryId>('spesa')
  const [newAmount, setNewAmount] = useState('')

  const spent = useMemo(() => Object.fromEntries(categoryTotals(inMonth(txs, cur)).map((c) => [c.id, c.total])) as Partial<Record<CategoryId, number>>, [txs, cur])
  const avg3 = useMemo(() => {
    const totals = [1, 2, 3].map((k) => categoryTotals(inMonth(txs, shiftMonth(cur, -k))))
    const out: Partial<Record<CategoryId, number>> = {}
    for (const t of totals.flat()) out[t.id] = (out[t.id] ?? 0) + t.total / 3
    return out
  }, [txs, cur])

  const today = todayISO()
  const isCurrent = monthKey(today) === cur
  const day = isCurrent ? Number(today.slice(8, 10)) : daysInMonth(cur)
  const elapsed = day / daysInMonth(cur)
  const entries = (Object.entries(budgets) as [CategoryId, number][]).sort((a, b) => (spent[b[0]] ?? 0) / b[1] - (spent[a[0]] ?? 0) / a[1])
  const totalBudget = entries.reduce((a, [, v]) => a + v, 0)
  const totalSpent = entries.reduce((a, [c]) => a + (spent[c] ?? 0), 0)
  const available = EXPENSE_CATEGORIES.filter((c) => budgets[c.id] == null)

  const suggest = () => {
    let n = 0
    for (const [c, v] of Object.entries(avg3) as [CategoryId, number][]) {
      const bucket = category(c).bucket
      if (budgets[c] != null || v < 30 || bucket === 'savings' || ['casa', 'tasse', 'commissioni'].includes(c)) continue
      // round the 3-month average down a notch: a budget should nudge, not just mirror
      setBudget(c, Math.max(10, Math.round((v * 0.9) / 10) * 10))
      n++
    }
    toast(n ? `Ho proposto ${n} budget basati sugli ultimi 3 mesi, ridotti del 10%.` : 'Hai già un budget per tutte le categorie principali.', n ? 'success' : 'info')
  }

  return (
    <>
      <PageHeader eyebrow={`Budget · ${monthLabel(cur, true)}`} title="Un tetto per ogni abitudine.">
        <Button variant="secondary" onClick={suggest}>
          <Wand2 size={15} /> Suggeriscili tu
        </Button>
        <Button onClick={() => setAdding(true)}>
          <Plus size={16} /> Nuovo budget
        </Button>
      </PageHeader>

      {entries.length > 0 && (
        <Card className="mb-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="eyebrow">Speso sul totale dei budget</div>
              <div className="mt-2 text-4xl font-semibold tracking-tight text-fg">
                <AnimatedNumber value={totalSpent} format={(n) => money(n, { round: true })} />
                <span className="text-lg font-medium text-muted"> / {money(totalBudget, { round: true })}</span>
              </div>
            </div>
            <div className="text-sm text-fg-2">
              {isCurrent ? `Giorno ${day} di ${daysInMonth(cur)}: il ritmo ideale è ${percent(elapsed)}` : 'Mese concluso'}
            </div>
          </div>
          <div className="relative mt-4 h-2.5 rounded-full bg-accent-soft">
            <motion.div
              className="h-full rounded-full"
              style={{ background: totalSpent > totalBudget ? 'var(--critical)' : totalSpent / totalBudget > elapsed + 0.1 ? 'var(--warning)' : 'var(--accent)' }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, (totalSpent / Math.max(1, totalBudget)) * 100)}%` }}
              transition={{ type: 'spring', stiffness: 60, damping: 16 }}
            />
            <span className="absolute -top-1 h-4.5 w-0.5 rounded-full bg-fg" style={{ left: `${elapsed * 100}%` }} title="Ritmo ideale a oggi" />
          </div>
        </Card>
      )}

      <AnimatePresence>
        {adding && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-5 overflow-hidden">
            <Card className="p-5">
              <form
                className="flex flex-col gap-3 sm:flex-row sm:items-end"
                onSubmit={(e) => {
                  e.preventDefault()
                  const v = Number(newAmount.replace(',', '.'))
                  if (!v || v <= 0) {
                    toast("Scrivi un importo maggiore di zero, per esempio 150.", 'error')
                    return
                  }
                  setBudget(newCat, v)
                  toast(`Budget per ${category(newCat).label}: ${money(v, { round: true })} al mese`)
                  setAdding(false)
                  setNewAmount('')
                  setNewCat(available.find((c) => c.id !== newCat)?.id ?? 'spesa')
                }}
              >
                <label className="flex flex-1 flex-col gap-1 text-sm text-fg-2">
                  Categoria
                  <select id="budget-cat" value={newCat} onChange={(e) => setNewCat(e.target.value as CategoryId)} className="h-11 rounded-xl border border-line bg-bg-2 px-3 text-fg outline-none focus:border-accent/60">
                    {available.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm text-fg-2 sm:w-44">
                  Importo mensile (€)
                  <input
                    id="budget-amount"
                    inputMode="decimal"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    placeholder={avg3[newCat] ? `media ${Math.round(avg3[newCat]!)}` : '150'}
                    className="h-11 rounded-xl border border-line bg-bg-2 px-3 text-fg outline-none placeholder:text-muted focus:border-accent/60"
                  />
                </label>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                    Annulla
                  </Button>
                  <Button type="submit">Salva budget</Button>
                </div>
              </form>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {!entries.length && !adding && (
        <Card>
          <Empty
            icon={<Target />}
            title="Nessun budget impostato"
            body="Un budget per le spese variabili (spesa, ristoranti, shopping) è il modo più semplice per tenerle sotto controllo. Posso proportene alcuni in base agli ultimi tre mesi."
            action={
              <Button onClick={suggest}>
                <Wand2 size={15} /> Suggeriscili tu
              </Button>
            }
          />
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence>
          {entries.map(([c, budget], i) => {
            const s = spent[c] ?? 0
            const ratio = s / budget
            const ahead = ratio > elapsed + 0.1 && isCurrent
            const state = ratio > 1 ? 'Sforato' : ratio > 0.85 ? 'Quasi al limite' : ahead ? 'Sopra il ritmo' : 'In linea'
            return (
              <motion.div
                key={c}
                layout
                initial={{ opacity: 0, scale: 0.94, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0, transition: { delay: i * 0.04 } }}
                exit={{ opacity: 0, scale: 0.9 }}
              >
                <Card className="group p-4">
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <BudgetRing spent={s} budget={budget} size={68} />
                      <div className="absolute inset-0 grid place-items-center">
                        <CategoryIcon id={c} size={30} />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-fg">{category(c).label}</div>
                      <div className="text-sm text-fg-2 tabular-nums">
                        {money(s, { round: true })} di {money(budget, { round: true })}
                      </div>
                      <span
                        className={cx(
                          'mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold',
                          ratio > 1 ? 'bg-critical/15 text-critical-text' : ratio > 0.85 || ahead ? 'bg-warning/15 text-fg' : 'bg-good/15 text-good-text',
                        )}
                      >
                        {state}
                      </span>
                    </div>
                    <button
                      aria-label={`Rimuovi budget ${category(c).label}`}
                      onClick={() => setBudget(c, null)}
                      className="self-start rounded-full p-1 text-muted opacity-60 hover:bg-surface-3 hover:text-fg group-hover:opacity-100"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="mt-3 text-xs text-muted">
                    {s <= budget ? `Restano ${money(budget - s, { round: true })}` : `Oltre di ${money(s - budget, { round: true })}`}
                    {avg3[c] != null && ` · media 3 mesi ${money(avg3[c]!, { round: true })}`}
                  </div>
                </Card>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
      {entries.length > 0 && (
        <div className="mt-6">
          <p className="text-xs text-muted">L'anello diventa giallo oltre l'85% e rosso quando sfori. "Sopra il ritmo" vuol dire che hai già speso più di quanto suggerisce il giorno del mese.</p>
        </div>
      )}
    </>
  )
}
