import { Loader2, Wand2 } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { proposeCategories, type CategoryProposal } from '../lib/ai/agent'
import { category } from '../lib/categories'
import { aiConfig, useAi, useAiReady } from '../store/ai'
import { useFinny } from '../store/useFinny'
import { Sheet } from './ui/Sheet'
import { toast } from './ui/toast'
import { Button, CategoryIcon, cx } from './ui/primitives'

/** Lets the model suggest categories for merchants filed under "Altro"; the user reviews before anything changes */
export function AiCategorize({ auto = false }: { auto?: boolean }) {
  const ready = useAiReady()
  const ai = useAi()
  const txs = useFinny((s) => s.transactions)
  const setCategory = useFinny((s) => s.setCategory)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [items, setItems] = useState<CategoryProposal[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())

  const pending = useMemo(() => new Set(txs.filter((t) => t.category === 'altro' || t.category === 'entrate').map((t) => t.merchant)).size, [txs])
  const started = useRef(false)
  // right after an import: ask straight away instead of waiting for a click
  useEffect(() => {
    if (!auto || !ready || !pending || started.current) return
    started.current = true
    void run()
    // run only once per mount
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, ready, pending])
  if (!ready || !pending) return null

  const run = async () => {
    setOpen(true)
    setBusy(true)
    setItems([])
    try {
      const res = await proposeCategories(aiConfig(ai), txs)
      setItems(res)
      setPicked(new Set(res.filter((r) => r.confidence !== 'bassa').map((r) => r.merchant)))
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Non sono riuscito a chiedere le categorie.', 'error')
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  const apply = () => {
    let moved = 0
    for (const p of items) {
      if (!picked.has(p.merchant)) continue
      const tx = txs.find((t) => t.merchant === p.merchant && (t.category === 'altro' || t.category === 'entrate'))
      if (tx) moved += setCategory(tx.id, p.category, true)
    }
    toast(`${moved} movimenti ricategorizzati. Le scelte valgono anche per i prossimi import.`)
    setOpen(false)
  }

  return (
    <>
      <button
        onClick={run}
        className="group inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-soft px-3 py-1 text-xs font-semibold text-accent transition-colors hover:bg-accent/20"
      >
        <Wand2 size={13} className="transition-transform group-hover:rotate-12" />
        Sistema {pending} esercenti generici con l'AI
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Categorie proposte dall'AI">
        {busy ? (
          <div className="flex flex-col items-center py-10 text-center">
            <Loader2 className="animate-spin text-accent" size={28} />
            <p className="mt-3 text-sm text-fg-2">Invio solo i nomi degli esercenti, senza importi né date.</p>
          </div>
        ) : items.length ? (
          <>
            <p className="text-sm text-fg-2">Seleziona le proposte da applicare. Quelle poco sicure sono deselezionate.</p>
            <ul className="scroll-thin mt-3 max-h-[50vh] space-y-1 overflow-auto">
              {items.map((p, i) => {
                const on = picked.has(p.merchant)
                return (
                  <motion.li key={p.merchant} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 12) * 0.03 }}>
                    <label className={cx('flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition-colors', on ? 'border-accent/50 bg-accent-soft' : 'border-line')}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setPicked((s) => {
                            const n = new Set(s)
                            if (n.has(p.merchant)) n.delete(p.merchant)
                            else n.add(p.merchant)
                            return n
                          })
                        }
                        className="size-4 accent-[var(--accent)]"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-fg">{p.merchant}</span>
                      <CategoryIcon id={p.category} size={26} />
                      <span className="w-32 truncate text-sm text-fg-2">{category(p.category).label}</span>
                      <span className={cx('w-12 text-right text-[11px]', p.confidence === 'alta' ? 'text-good-text' : 'text-muted')}>{p.confidence}</span>
                    </label>
                  </motion.li>
                )
              })}
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Annulla
              </Button>
              <Button disabled={!picked.size} onClick={apply}>
                Applica {picked.size}
              </Button>
            </div>
          </>
        ) : (
          <p className="py-8 text-center text-sm text-fg-2">Il modello non ha trovato categorie migliori di "Altro" per questi esercenti.</p>
        )}
      </Sheet>
    </>
  )
}
