import { get, set } from 'idb-keyval'
import { ArrowRight, Database, MessageCircle, RefreshCw } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { briefFingerprint, generateBrief, type StoredBrief } from '../lib/ai/brief'
import { TOOL_LABELS } from '../lib/ai/tools'
import { money } from '../lib/format'
import { aiConfig, useAi } from '../store/ai'
import { useUi } from '../store/ui'
import { useFinny } from '../store/useFinny'
import { Card, cx, stagger } from './ui/primitives'
import { Orb, TONE } from './Vocina'

const KEY = 'finny:ai:brief:v1'
const LABELS: Record<string, string> = { ...TOOL_LABELS, segnali: 'Segnali già calcolati da Finny' }
const VIEW_LABEL: Record<string, string> = { movimenti: 'Movimenti', analisi: 'Analisi', abbonamenti: 'Ricorrenti', budget: 'Budget' }

/**
 * The AI's monthly read of the dashboard. Generated once per change in the data (or on request)
 * and kept in this browser, so opening the app doesn't call the model every time.
 */
export function AiBrief() {
  const ai = useAi()
  const txs = useFinny((s) => s.transactions)
  const accounts = useFinny((s) => s.accounts)
  const budgets = useFinny((s) => s.budgets)
  const go = useFinny((s) => s.go)
  const ask = useUi((s) => s.setQuestion)
  const [stored, setStored] = useState<StoredBrief | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const running = useRef(false)

  const fingerprint = useMemo(
    () => briefFingerprint(txs, `${JSON.stringify(budgets)}|${ai.model}|${ai.shareMerchants}`),
    [txs, budgets, ai.model, ai.shareMerchants],
  )

  const run = useCallback(async () => {
    if (running.current) return
    running.current = true
    setBusy(true)
    setError('')
    try {
      const { brief, shared } = await generateBrief(aiConfig(ai), { transactions: txs, accounts, budgets, shareMerchants: ai.shareMerchants })
      const next: StoredBrief = { fingerprint, model: ai.model, createdAt: new Date().toISOString(), brief, shared }
      setStored(next)
      set(KEY, next).catch(() => {})
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Non sono riuscito a preparare il punto del mese.')
    } finally {
      running.current = false
      setBusy(false)
    }
  }, [ai, txs, accounts, budgets, fingerprint])

  useEffect(() => {
    get<StoredBrief>(KEY)
      .then((s) => s && setStored(s))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  // regenerate on its own only when the data behind it changed
  const stale = !stored || stored.fingerprint !== fingerprint
  useEffect(() => {
    if (loaded && stale && txs.length && !error) void run()
  }, [loaded, stale, txs.length, error, run])

  const brief = stored?.brief
  const when = stored ? new Date(stored.createdAt).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''

  return (
    <Card className="overflow-hidden p-5 sm:p-6">
      <div className="pointer-events-none absolute -top-32 -left-24 size-80 rounded-full bg-accent/10 blur-3xl" />
      <div className="flex items-start gap-4 sm:gap-5">
        <Orb speaking={busy} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow">Il punto della vocina</span>
            <span className="rounded-full border border-accent/40 bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">AI</span>
            {stale && stored && !busy && <span className="text-[11px] text-muted">i dati sono cambiati</span>}
          </div>
          <AnimatePresence mode="wait">
            {busy && !brief ? (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3 space-y-2.5">
                <p className="text-fg-2">Sto leggendo i tuoi numeri…</p>
                {[80, 95, 60].map((w, i) => (
                  <motion.div
                    key={i}
                    className="h-3 rounded-full bg-surface-3"
                    style={{ width: `${w}%` }}
                    animate={{ opacity: [0.4, 0.9, 0.4] }}
                    transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.15 }}
                  />
                ))}
              </motion.div>
            ) : brief ? (
              <motion.div key={stored!.createdAt} initial={{ opacity: 0, y: 8, filter: 'blur(6px)' }} animate={{ opacity: busy ? 0.55 : 1, y: 0, filter: 'blur(0px)' }}>
                <h3 className="mt-2 text-xl font-semibold text-fg sm:text-2xl">{brief.title}</h3>
                <p className="mt-2 max-w-[70ch] text-[15px] text-fg-2">{brief.summary}</p>
              </motion.div>
            ) : (
              <motion.p key="empty" className="mt-3 text-fg-2">
                {error ? '' : 'Importa dei movimenti per avere il punto del mese.'}
              </motion.p>
            )}
          </AnimatePresence>
          {error && (
            <div className="mt-3 rounded-xl border border-critical/40 bg-critical/10 px-3 py-2 text-sm text-fg">
              {error}{' '}
              <button onClick={() => void run()} className="font-semibold text-accent">
                Riprova
              </button>
            </div>
          )}
        </div>
      </div>

      {brief && brief.points.length > 0 && (
        <motion.div variants={stagger.container} initial="hidden" animate="show" className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {brief.points.map((p, i) => {
            const tone = TONE[p.tone]
            const Icon = tone.icon
            return (
              <motion.div key={`${stored!.createdAt}-${i}`} variants={stagger.item} className="flex flex-col rounded-2xl border border-line bg-surface/60 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: tone.text }}>
                    <Icon size={14} style={{ color: tone.color }} aria-hidden /> {tone.label}
                  </span>
                  {p.monthlySaving && <span className="text-sm font-semibold text-accent">−{money(p.monthlySaving, { round: true })}/mese</span>}
                </div>
                <div className="mt-2 font-semibold text-fg">{p.title}</div>
                <p className="mt-1 flex-1 text-sm text-fg-2">{p.text}</p>
                {p.action && (
                  <button onClick={() => go(p.action!)} className="group mt-3 inline-flex items-center gap-1 self-start text-sm font-semibold text-accent">
                    Apri {VIEW_LABEL[p.action] ?? p.action}
                    <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                  </button>
                )}
              </motion.div>
            )
          })}
        </motion.div>
      )}

      {stored && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          {brief?.question ? (
            <button
              onClick={() => {
                ask(brief.question)
                go('chiedi')
              }}
              className="group inline-flex min-w-0 items-center gap-2 rounded-full border border-line px-3 py-1.5 text-left text-sm text-fg-2 transition-colors hover:border-accent/50 hover:text-fg"
            >
              <MessageCircle size={14} className="shrink-0 text-accent" />
              <span className="truncate">{brief.question}</span>
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-3 text-xs text-muted">
            <details className="relative">
              <summary className="flex cursor-pointer items-center gap-1 hover:text-fg-2">
                <Database size={12} /> Dati inviati
              </summary>
              <div className="scroll-thin absolute right-0 bottom-7 z-20 max-h-80 w-[min(90vw,420px)] overflow-auto rounded-xl border border-line-strong bg-surface p-3 shadow-2xl">
                {stored.shared.map((s, i) => (
                  <div key={i} className="mb-2">
                    <div className="font-medium text-fg-2">
                      {LABELS[s.tool] ?? s.tool} <span className="font-mono text-muted">{JSON.stringify(s.args)}</span>
                    </div>
                    <pre className="mt-1 max-h-28 overflow-auto rounded-lg bg-bg-2 p-2 font-mono text-[11px] whitespace-pre-wrap">{s.result}</pre>
                  </div>
                ))}
              </div>
            </details>
            <span>
              {stored.model} · {when}
            </span>
            <button onClick={() => void run()} disabled={busy} aria-label="Aggiorna il punto del mese" className="grid size-7 place-items-center rounded-full hover:bg-surface-3 hover:text-fg disabled:opacity-50">
              <RefreshCw size={13} className={cx(busy && 'animate-spin')} />
            </button>
          </div>
        </div>
      )}
    </Card>
  )
}
