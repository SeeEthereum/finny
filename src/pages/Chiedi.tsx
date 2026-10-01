import { ArrowUp, Database, RotateCcw, Square } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { AiSetup } from '../components/AiSetup'
import { PageHeader } from '../components/shared'
import { Card, cx } from '../components/ui/primitives'
import { Orb } from '../components/Vocina'
import { ask, type Turn } from '../lib/ai/agent'
import { TOOL_LABELS } from '../lib/ai/tools'
import { monthLabel } from '../lib/format'
import { aiConfig, useAi, useAiReady } from '../store/ai'
import { useDerived } from '../store/derived'
import { useUi } from '../store/ui'
import { useFinny } from '../store/useFinny'

/** Bold, bullet lists and paragraphs, rendered as React nodes (no HTML injection) */
function Rich({ text }: { text: string }) {
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <strong key={i} className="font-semibold text-fg">
          {part.slice(2, -2)}
        </strong>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      ),
    )
  const blocks: ReactNode[] = []
  let list: string[] = []
  const flush = () => {
    if (!list.length) return
    blocks.push(
      <ul key={`l${blocks.length}`} className="my-2 space-y-1.5">
        {list.map((li, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-accent" />
            <span>{inline(li)}</span>
          </li>
        ))}
      </ul>,
    )
    list = []
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)/)
    if (bullet) list.push(bullet[1])
    else {
      flush()
      if (line) blocks.push(<p key={`p${blocks.length}`} className="my-2">{inline(line.replace(/^#+\s*/, ''))}</p>)
    }
  }
  flush()
  return <div className="text-[15px] leading-relaxed text-fg-2">{blocks}</div>
}

function Shared({ turn }: { turn: Turn }) {
  if (!turn.shared?.length) return <div className="mt-2 text-xs text-muted">Nessun dato inviato per questa risposta.</div>
  return (
    <details className="mt-3 rounded-xl border border-line bg-bg-2/60 text-xs">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-muted hover:text-fg-2">
        <Database size={13} /> Dati inviati: {[...new Set(turn.shared.map((s) => TOOL_LABELS[s.tool] ?? s.tool))].join(', ').toLowerCase()}
      </summary>
      <div className="space-y-2 border-t border-line p-3">
        {turn.shared.map((s, i) => (
          <div key={i}>
            <div className="font-medium text-fg-2">
              {TOOL_LABELS[s.tool] ?? s.tool} <span className="font-mono text-muted">{JSON.stringify(s.args)}</span>
            </div>
            <pre className="scroll-thin mt-1 max-h-40 overflow-auto rounded-lg bg-surface p-2 font-mono text-[11px] whitespace-pre-wrap text-muted">{s.result}</pre>
          </div>
        ))}
      </div>
    </details>
  )
}

const STEP_TEXT: Record<string, string> = {
  riepilogo_mensile: 'Guardo entrate e uscite mese per mese',
  spese_per_categoria: 'Sommo le spese per categoria',
  spese_per_esercente: 'Controllo gli esercenti',
  cerca_movimenti: 'Cerco tra i movimenti',
  ricorrenti: 'Ripasso gli abbonamenti',
  budget: 'Confronto con i budget',
  saldo: 'Leggo il saldo',
}

export default function Chiedi() {
  const ready = useAiReady()
  const ai = useAi()
  const txs = useFinny((s) => s.transactions)
  const accounts = useFinny((s) => s.accounts)
  const budgets = useFinny((s) => s.budgets)
  const isDemo = useFinny((s) => s.isDemo)
  const { cur } = useDerived()
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState('Ci penso')
  const [error, setError] = useState('')
  const abort = useRef<AbortController | null>(null)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turns, busy])

  // a question handed over from the dashboard brief
  const pending = useUi((s) => s.question)
  useEffect(() => {
    if (!ready || !pending) return
    useUi.getState().setQuestion('')
    void send(pending)
    // send is recreated every render; the pending question is what matters
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pending])

  const send = async (q: string) => {
    const question = q.trim()
    if (!question || busy) return
    setError('')
    setInput('')
    const history = turns
    setTurns((t) => [...t, { role: 'user', text: question }])
    setBusy(true)
    setStep('Ci penso')
    abort.current = new AbortController()
    try {
      const answer = await ask(
        aiConfig(ai),
        { transactions: txs, accounts, budgets, shareMerchants: ai.shareMerchants },
        history,
        question,
        (tool) => setStep(STEP_TEXT[tool] ?? 'Raccolgo i dati'),
        abort.current.signal,
      )
      setTurns((t) => [...t, answer])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Qualcosa non ha funzionato.')
    } finally {
      setBusy(false)
      abort.current = null
    }
  }

  const prev = monthLabel(cur, true)
  const suggestions = [
    `Fammi il report di ${prev}: cosa è andato bene e cosa no`,
    'Dove posso risparmiare 200 € al mese senza rinunciare a tutto?',
    'Quali abbonamenti potrei tagliare?',
    'Quanto spendo davvero per mangiare fuori, delivery compreso?',
    'Costruiscimi un piano per il fondo emergenza',
    'I miei budget sono realistici?',
  ]

  if (!ready) {
    return (
      <>
        <PageHeader eyebrow="Chiedi a Finny" title="Fai domande ai tuoi soldi." />
        <div className="grid gap-4 lg:grid-cols-12 lg:gap-5">
          <Card className="flex flex-col items-center p-8 text-center lg:col-span-5">
            <Orb size={96} />
            <h2 className="mt-6 text-xl font-semibold text-fg">Collega un modello AI</h2>
            <p className="mt-2 text-sm text-fg-2">
              Con la tua chiave OpenAI la vocina risponde a domande libere, prepara report e piani di risparmio usando i tuoi numeri. È disattivata finché non la configuri.
            </p>
          </Card>
          <Card className="p-5 sm:p-6 lg:col-span-7">
            <AiSetup />
          </Card>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader eyebrow={`Chiedi a Finny · ${ai.model}`} title="Fai domande ai tuoi soldi.">
        {turns.length > 0 && (
          <button
            onClick={() => {
              abort.current?.abort()
              setTurns([])
              setError('')
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm text-fg-2 hover:text-fg"
          >
            <RotateCcw size={14} /> Nuova conversazione
          </button>
        )}
      </PageHeader>
      {isDemo && <p className="-mt-3 mb-5 text-sm text-muted">Stai usando i dati di esempio: le risposte parlano di quelli, non dei tuoi conti.</p>}

      <div className="mx-auto max-w-3xl">
        {!turns.length && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center pt-4 pb-8 text-center">
            <Orb size={88} />
            <p className="mt-5 max-w-md text-fg-2">Chiedimi qualsiasi cosa sui tuoi movimenti. Prendo i numeri da Finny, non li invento, e sotto ogni risposta ti mostro quali dati ho usato.</p>
            <motion.div
              className="mt-6 flex flex-wrap justify-center gap-2"
              initial="hidden"
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.2 } } }}
            >
              {suggestions.map((s) => (
                <motion.button
                  key={s}
                  variants={{ hidden: { opacity: 0, y: 10, scale: 0.96 }, show: { opacity: 1, y: 0, scale: 1 } }}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => send(s)}
                  className="rounded-full border border-line bg-surface px-4 py-2 text-left text-sm text-fg-2 transition-colors hover:border-accent/50 hover:text-fg"
                >
                  {s}
                </motion.button>
              ))}
            </motion.div>
          </motion.div>
        )}

        <div className="space-y-5">
          <AnimatePresence initial={false}>
            {turns.map((t, i) =>
              t.role === 'user' ? (
                <motion.div key={i} initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="flex justify-end">
                  <div className="max-w-[85%] rounded-[20px] rounded-br-md bg-accent px-4 py-2.5 text-[15px] text-accent-ink">{t.text}</div>
                </motion.div>
              ) : (
                <motion.div key={i} initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} className="flex gap-3">
                  <div className="pt-1">
                    <Orb size={30} />
                  </div>
                  <Card className="min-w-0 flex-1 px-5 py-3">
                    <Rich text={t.text} />
                    <Shared turn={t} />
                  </Card>
                </motion.div>
              ),
            )}
          </AnimatePresence>
          {busy && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3">
              <Orb size={30} speaking />
              <AnimatePresence mode="wait">
                <motion.span key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="text-sm text-fg-2">
                  {step}…
                </motion.span>
              </AnimatePresence>
            </motion.div>
          )}
          {error && <div className="rounded-xl border border-critical/40 bg-critical/10 px-4 py-3 text-sm text-fg">{error}</div>}
          <div ref={end} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void send(input)
          }}
          className="sticky bottom-[calc(84px+env(safe-area-inset-bottom,0px))] z-20 mt-6 lg:bottom-6"
        >
          <div className={cx('flex items-end gap-2 rounded-[22px] border bg-surface/90 p-2 shadow-2xl backdrop-blur-xl transition-colors', busy ? 'border-line' : 'border-line-strong focus-within:border-accent/60')}>
            <textarea
              id="ask-input"
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send(input)
                }
              }}
              placeholder="Es. quanto ho speso in benzina quest'anno?"
              className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] text-fg outline-none placeholder:text-muted"
            />
            {busy ? (
              <button type="button" aria-label="Interrompi" onClick={() => abort.current?.abort()} className="grid size-11 place-items-center rounded-full bg-surface-3 text-fg">
                <Square size={15} />
              </button>
            ) : (
              <motion.button whileTap={{ scale: 0.9 }} type="submit" aria-label="Invia" disabled={!input.trim()} className="grid size-11 place-items-center rounded-full bg-accent text-accent-ink disabled:opacity-40">
                <ArrowUp size={18} />
              </motion.button>
            )}
          </div>
          <p className="mt-2 text-center text-[11px] text-muted">Le risposte sono generate da un modello AI e possono contenere errori. Non sono consulenza finanziaria.</p>
        </form>
      </div>
    </>
  )
}
