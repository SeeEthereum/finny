import { Check, FileUp, KeyRound, Landmark, Loader2, ShieldAlert, ShieldCheck, Timer } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { PageHeader } from '../components/shared'
import { toast } from '../components/ui/toast'
import { Button, Card, cx, SectionTitle } from '../components/ui/primitives'
import { useFinny } from '../store/useFinny'

/**
 * Two ways data reaches Finny. The diagram shows the hops each one adds:
 * the file path never leaves the device, the PSD2 path crosses two third parties.
 */
function FlowDiagram() {
  const reduce = useReducedMotion()
  const W = 760
  const node = (x: number, y: number, w: number, label: string, sub: string, hot = false) => (
    <g>
      <rect x={x} y={y} width={w} height={54} rx={14} fill="var(--surface-2)" stroke={hot ? 'var(--accent)' : 'var(--line-strong)'} strokeWidth={hot ? 1.5 : 1} />
      <text x={x + w / 2} y={y + 23} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--fg)">
        {label}
      </text>
      <text x={x + w / 2} y={y + 40} textAnchor="middle" fontSize={11} fill="var(--muted)">
        {sub}
      </text>
    </g>
  )
  const arrow = (x1: number, x2: number, y: number, label: string, hot = false, delay = 0) => (
    <g>
      <line x1={x1} y1={y} x2={x2 - 6} y2={y} stroke={hot ? 'var(--accent)' : 'var(--fg-2)'} strokeWidth={1.5} markerEnd={hot ? 'url(#arrow-hot)' : 'url(#arrow)'} />
      <text x={(x1 + x2) / 2} y={y - 9} textAnchor="middle" fontSize={11} fill={hot ? 'var(--accent)' : 'var(--fg-2)'}>
        {label}
      </text>
      {!reduce && (
        <motion.circle r={3} cy={y} fill={hot ? 'var(--accent)' : 'var(--series-1)'} initial={{ cx: x1 }} animate={{ cx: [x1, x2 - 8] }} transition={{ duration: 1.8, repeat: Infinity, delay, ease: 'easeInOut' }} />
      )}
    </g>
  )
  return (
    <figure className="m-0">
      <div className="scroll-thin overflow-x-auto">
        <svg viewBox={`0 0 ${W} 300`} className="h-auto w-full min-w-[640px]" role="img" aria-label="Con l'estratto conto i dati vanno dalla banca al tuo browser tramite un file che scarichi tu. Con il collegamento PSD2 passano da un fornitore autorizzato e da un server prima di arrivare al browser.">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,0 L10,5 L0,10 Z" fill="var(--fg-2)" />
            </marker>
            <marker id="arrow-hot" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,0 L10,5 L0,10 Z" fill="var(--accent)" />
            </marker>
          </defs>
          <text x={0} y={18} fontSize={11} letterSpacing="0.1em" fill="var(--muted)">
            A · ESTRATTO CONTO
          </text>
          {node(0, 34, 120, 'Banca', 'home banking')}
          {arrow(120, 560, 61, 'scarichi il file (CSV, Excel, PDF)', false, 0)}
          <rect x={548} y={20} width={212} height={84} rx={18} fill="none" stroke="var(--series-1)" strokeDasharray="5 5" />
          <text x={654} y={96} textAnchor="middle" fontSize={10.5} fill="var(--series-1)">
            il tuo dispositivo
          </text>
          {node(570, 30, 168, 'Finny nel browser', 'legge e salva in locale')}

          <text x={0} y={156} fontSize={11} letterSpacing="0.1em" fill="var(--muted)">
            B · COLLEGAMENTO PSD2
          </text>
          {node(0, 172, 120, 'Banca', 'API PSD2 + SCA')}
          {arrow(120, 196, 199, 'consenso', true, 0.2)}
          {node(196, 172, 140, 'Fornitore AISP', 'licenza PSD2')}
          {arrow(336, 420, 199, 'movimenti', true, 0.5)}
          {node(420, 172, 124, 'Server Finny', 'chiavi API')}
          {arrow(544, 570, 199, '', true, 0.8)}
          <rect x={548} y={158} width={212} height={84} rx={18} fill="none" stroke="var(--series-1)" strokeDasharray="5 5" />
          <text x={654} y={234} textAnchor="middle" fontSize={10.5} fill="var(--series-1)">
            il tuo dispositivo
          </text>
          {node(570, 168, 168, 'Finny nel browser', 'mostra i dati')}
          <text x={370} y={270} textAnchor="middle" fontSize={11} fill="var(--accent)">
            ↑ due soggetti in più vedono i tuoi movimenti
          </text>
          <line x1={196} y1={252} x2={544} y2={252} stroke="var(--accent)" strokeWidth={1} />
        </svg>
      </div>
      <figcaption className="mt-3 text-sm text-fg-2">
        Con il file, i movimenti non escono dal tuo dispositivo. Con il collegamento passano da un fornitore autorizzato e da un server che deve custodire le credenziali API: si guadagna l'aggiornamento automatico, si perde privacy.
      </figcaption>
    </figure>
  )
}

const STEPS = [
  { icon: Landmark, title: 'Reindirizzamento alla banca', body: 'Finny ti manda sul sito della tua banca: le credenziali le inserisci lì, mai in Finny.' },
  { icon: KeyRound, title: 'Autenticazione forte (SCA)', body: 'Confermi con app della banca, impronta o codice, come per un bonifico.' },
  { icon: Timer, title: 'Consenso per 180 giorni', body: 'Autorizzi la sola lettura di saldo e movimenti. Dopo 180 giorni la banca ti chiede di rinnovare.' },
  { icon: ShieldCheck, title: 'Scarico dei movimenti', body: 'Il fornitore consegna i movimenti al server di Finny, che li passa alla tua app.' },
]

function Simulation() {
  const [step, setStep] = useState(-1)
  const reduce = useReducedMotion()
  const reset = useFinny((s) => s.resetToDemo)
  const go = useFinny((s) => s.go)
  useEffect(() => {
    if (step < 0 || step >= STEPS.length) return
    const id = setTimeout(() => setStep((s) => s + 1), reduce ? 200 : 1300)
    return () => clearTimeout(id)
  }, [step, reduce])
  const done = step >= STEPS.length
  return (
    <Card className="p-5 sm:p-6">
      <SectionTitle
        eyebrow="Simulazione, nessuna banca reale"
        title="Come sarebbe il collegamento"
        action={
          <Button variant={step < 0 || done ? 'primary' : 'secondary'} disabled={step >= 0 && !done} onClick={() => setStep(0)}>
            {done ? 'Rivedi' : step < 0 ? 'Avvia la simulazione' : 'In corso…'}
          </Button>
        }
      />
      <ol className="relative mt-6 space-y-5">
        <span className="absolute top-2 bottom-2 left-[19px] w-px bg-line-strong" aria-hidden />
        {STEPS.map((s, i) => {
          const state = step > i ? 'done' : step === i ? 'active' : 'todo'
          return (
            <li key={s.title} className="relative flex gap-4">
              <motion.span
                animate={{ scale: state === 'active' ? 1.08 : 1 }}
                className={cx(
                  'relative z-10 grid size-10 shrink-0 place-items-center rounded-full border transition-colors',
                  state === 'done' ? 'border-accent bg-accent text-accent-ink' : state === 'active' ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface text-muted',
                )}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {state === 'done' ? (
                    <motion.span key="d" initial={{ scale: 0 }} animate={{ scale: 1 }}>
                      <Check size={17} />
                    </motion.span>
                  ) : state === 'active' ? (
                    <motion.span key="a" initial={{ scale: 0 }} animate={{ scale: 1 }}>
                      <Loader2 size={17} className="animate-spin" />
                    </motion.span>
                  ) : (
                    <motion.span key="t">
                      <s.icon size={17} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.span>
              <div className={cx('pt-1.5 transition-opacity', state === 'todo' && step >= 0 ? 'opacity-50' : '')}>
                <div className="font-semibold text-fg">{s.title}</div>
                <p className="mt-0.5 text-sm text-fg-2">{s.body}</p>
              </div>
            </li>
          )
        })}
      </ol>
      <AnimatePresence>
        {done && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent-soft p-4">
            <p className="text-sm text-fg">Fine della simulazione. Nessun conto è stato collegato: per vedere l'app all'opera puoi usare i dati di esempio o importare un file.</p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  reset()
                  toast('Dati di esempio caricati')
                  go('home')
                }}
              >
                Dati di esempio
              </Button>
              <Button onClick={() => go('importa')}>
                <FileUp size={15} /> Importa file
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}

const COMPARE: [string, string, string][] = [
  ['Dove passano i dati', 'Restano nel browser', 'Fornitore AISP + server'],
  ['Aggiornamento', 'Manuale, quando importi', 'Automatico'],
  ['Rinnovo del consenso', 'Non serve', 'Ogni 180 giorni'],
  ['Costo per chi gestisce l\'app', 'Zero', 'Canone del fornitore + server'],
  ['Cosa serve per partire', 'Niente', 'Contratto con un fornitore autorizzato'],
]

export default function Collega() {
  return (
    <>
      <PageHeader eyebrow="Collega conto" title="Collegare la banca non è la scelta più privata." />
      <div className="grid gap-4 lg:grid-cols-12 lg:gap-5">
        <Card className="p-5 sm:p-6 lg:col-span-12">
          <FlowDiagram />
        </Card>

        <Card className="p-5 sm:p-6 lg:col-span-7">
          <SectionTitle eyebrow="Confronto" title="File o collegamento?" />
          <div className="scroll-thin mt-4 overflow-x-auto">
            <table className="w-full min-w-[440px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="pb-2 font-medium" />
                  <th className="pb-2 font-medium">Estratto conto</th>
                  <th className="pb-2 font-medium">Collegamento PSD2</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map(([k, a, b]) => (
                  <tr key={k} className="border-t border-line">
                    <td className="py-2.5 pr-3 text-fg-2">{k}</td>
                    <td className="py-2.5 pr-3 font-medium text-fg">{a}</td>
                    <td className="py-2.5 text-fg">{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 flex items-start gap-2 rounded-xl border border-line bg-bg-2 p-3 text-sm text-fg-2">
            <ShieldAlert size={16} className="mt-0.5 shrink-0 text-warning" />
            <p>
              Per leggere i conti di altre persone serve una licenza da prestatore di servizi di informazione sui conti (AISP) oppure un fornitore che ce l'ha. Per attivarlo in Finny servono un contratto con un fornitore autorizzato e un piccolo server che custodisca le chiavi API. Finché non ci sono, l'import da file fa tutto il resto.
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <a className="underline decoration-line-strong underline-offset-4 hover:text-fg-2" href="https://eur-lex.europa.eu/eli/dir/2015/2366/oj" target="_blank" rel="noreferrer">
              Fonte: Direttiva (UE) 2015/2366 (PSD2)
            </a>
            <a className="underline decoration-line-strong underline-offset-4 hover:text-fg-2" href="https://eur-lex.europa.eu/eli/reg_del/2022/2360/oj/eng" target="_blank" rel="noreferrer">
              Regolamento delegato (UE) 2022/2360 (rinnovo a 180 giorni)
            </a>
          </div>
        </Card>

        <div className="lg:col-span-5">
          <Simulation />
        </div>
      </div>
    </>
  )
}
