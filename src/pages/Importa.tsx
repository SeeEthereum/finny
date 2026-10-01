import { ArrowLeftRight, Check, Copy, FileSearch, FileSpreadsheet, FileText, FileUp, KeyRound, Loader2, Lock, RotateCcw, ShieldCheck, TriangleAlert } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { AiCategorize } from '../components/AiCategorize'
import { Confetti } from '../components/Confetti'
import { PageHeader } from '../components/shared'
import { toast } from '../components/ui/toast'
import { Button, Card, cx } from '../components/ui/primitives'
import { money, shortDate } from '../lib/format'
import { PdfPasswordError, readPdf, type PdfResult } from '../lib/parse/pdf'
import { fileKind, ImportError, readCsv, readXlsx, type FileKind } from '../lib/parse/readers'
import { detectTable, mappingProblems, toDrafts, type DetectedTable, type DraftTx, type Mapping } from '../lib/parse/table'
import { cellText } from '../lib/parse/values'
import type { Account, TxSource } from '../lib/types'
import { useFinny, type ImportOutcome } from '../store/useFinny'

type Stage =
  | { kind: 'idle' }
  | { kind: 'reading'; name: string }
  | { kind: 'table'; name: string; fileKind: FileKind; table: DetectedTable }
  | { kind: 'pdf'; name: string; result: PdfResult }
  | { kind: 'done'; name: string; outcome: ImportOutcome }
  | { kind: 'password'; file: File; rest: File[]; incorrect: boolean }
  | { kind: 'nothing'; name: string; pages: number; text: string[] }
  | { kind: 'error'; name: string; detail: string }

function guessName(file: string) {
  const f = file.toLowerCase()
  const banks: [RegExp, string][] = [
    [/intesa|isp/, 'Intesa Sanpaolo'], [/unicredit/, 'UniCredit'], [/fineco/, 'Fineco'], [/revolut/, 'Revolut'],
    [/n26/, 'N26'], [/bbva/, 'BBVA'], [/hype/, 'Hype'], [/bper/, 'BPER'], [/bnl/, 'BNL'], [/poste|bancoposta/, 'BancoPosta'],
    [/mediolanum/, 'Mediolanum'], [/widiba/, 'Widiba'], [/credem/, 'Credem'], [/banco\s*bpm|bpm/, 'Banco BPM'], [/ing/, 'ING'],
    [/illimity/, 'illimity'], [/satispay/, 'Satispay'], [/paypal/, 'PayPal'], [/wise/, 'Wise'],
  ]
  return banks.find(([re]) => re.test(f))?.[1] ?? ''
}

export default function Importa() {
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const [queue, setQueue] = useState<File[]>([])
  const [confetti, setConfetti] = useState(0)

  const process = useCallback(async (file: File, rest: File[], password?: string) => {
    setQueue(rest)
    const kind = fileKind(file)
    if (!kind) {
      toast(`${file.name}: formato non supportato. Usa CSV, Excel (.xlsx) o PDF.`, 'error')
      if (rest.length) void process(rest[0], rest.slice(1))
      return
    }
    setStage({ kind: 'reading', name: file.name })
    try {
      if (kind === 'pdf') {
        const result = await readPdf(file, password)
        if (!result.drafts.length) {
          setStage({ kind: 'nothing', name: file.name, pages: result.pages, text: result.text })
          return
        }
        setStage({ kind: 'pdf', name: file.name, result })
      } else {
        const grid = kind === 'csv' ? await readCsv(file) : await readXlsx(file)
        setStage({ kind: 'table', name: file.name, fileKind: kind, table: detectTable(grid) })
      }
    } catch (e) {
      if (e instanceof PdfPasswordError) {
        setStage({ kind: 'password', file, rest, incorrect: e.incorrect })
      } else if (e instanceof ImportError) {
        toast(e.message, 'error')
        setStage({ kind: 'idle' })
      } else {
        const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
        setStage({ kind: 'error', name: file.name, detail })
      }
    }
  }, [])

  const onFiles = (files: File[]) => {
    if (!files.length) return
    void process(files[0], files.slice(1))
  }

  const finish = (name: string, outcome: ImportOutcome) => {
    setConfetti((c) => c + 1)
    setStage({ kind: 'done', name, outcome })
  }

  return (
    <>
      <PageHeader eyebrow="Importa" title="Il tuo estratto conto, letto qui." />
      <Confetti fire={confetti} />
      <AnimatePresence mode="wait">
        {stage.kind === 'idle' && (
          <motion.div key="idle" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
            <DropZone onFiles={onFiles} />
            <Guide />
          </motion.div>
        )}
        {stage.kind === 'reading' && (
          <motion.div key="reading" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <Card className="flex flex-col items-center px-6 py-16 text-center">
              <Loader2 className="animate-spin text-accent" size={32} />
              <div className="mt-4 font-semibold text-fg">Sto leggendo {stage.name}</div>
              <p className="mt-1 text-sm text-fg-2">Tutto avviene nel browser: il file non viene caricato da nessuna parte.</p>
            </Card>
          </motion.div>
        )}
        {stage.kind === 'table' && (
          <motion.div key={`table-${stage.name}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
            <TableReview stage={stage} onCancel={() => setStage({ kind: 'idle' })} onDone={finish} />
          </motion.div>
        )}
        {stage.kind === 'pdf' && (
          <motion.div key={`pdf-${stage.name}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
            <PdfReview stage={stage} onCancel={() => setStage({ kind: 'idle' })} onDone={finish} />
          </motion.div>
        )}
        {stage.kind === 'password' && (
          <motion.div key="password" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
            <PasswordStep stage={stage} onSubmit={(pw) => process(stage.file, stage.rest, pw)} onCancel={() => setStage({ kind: 'idle' })} />
          </motion.div>
        )}
        {stage.kind === 'nothing' && (
          <motion.div key="nothing" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
            <Diagnostic stage={stage} onBack={() => setStage({ kind: 'idle' })} />
          </motion.div>
        )}
        {stage.kind === 'error' && (
          <motion.div key="error" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
            <Card className="p-6 sm:p-8">
              <div className="flex items-start gap-3">
                <TriangleAlert className="mt-0.5 shrink-0 text-critical" size={22} />
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-fg">Non sono riuscito ad aprire {stage.name}</h2>
                  <p className="mt-1 text-sm text-fg-2">
                    Il problema è nella lettura del file, prima ancora di cercare i movimenti. Se il file si apre normalmente sul tuo computer, il dettaglio qui sotto mi serve per capire cosa non va: non contiene dati del conto.
                  </p>
                  <pre className="mt-3 overflow-x-auto rounded-xl border border-line bg-bg-2 p-3 font-mono text-xs whitespace-pre-wrap text-fg-2">{stage.detail}</pre>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <CopyButton text={`Finny · errore import · ${stage.detail} · ${navigator.userAgent}`} label="Copia dettaglio" />
                    <Button onClick={() => setStage({ kind: 'idle' })}>Riprova con un altro file</Button>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
        {stage.kind === 'done' && (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <Done stage={stage} next={queue[0]} onNext={() => (queue[0] ? process(queue[0], queue.slice(1)) : setStage({ kind: 'idle' }))} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function DropZone({ onFiles }: { onFiles: (f: File[]) => void }) {
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const reduce = useReducedMotion()
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        onFiles([...e.dataTransfer.files])
      }}
      className="relative rounded-[28px] p-[1.5px]"
    >
      <div className={cx('ring-spin absolute inset-0 rounded-[28px] transition-opacity', over ? 'opacity-100' : 'opacity-60')} />
      <motion.button
        type="button"
        onClick={() => input.current?.click()}
        animate={{ scale: over ? 1.01 : 1 }}
        className="relative flex w-full flex-col items-center rounded-[27px] border border-dashed border-line-strong bg-surface px-6 py-14 text-center sm:py-20"
      >
        <div className="relative">
          <motion.div
            className="grid size-20 place-items-center rounded-[24px] border border-accent/40 bg-accent-soft text-accent"
            animate={reduce ? undefined : over ? { y: -8, rotate: -4 } : { y: [0, -6, 0] }}
            transition={over ? { type: 'spring' } : { duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            <FileUp size={34} />
          </motion.div>
          {!reduce &&
            [FileSpreadsheet, FileText].map((Icon, i) => (
              <motion.div
                key={i}
                className="absolute top-3 grid size-10 place-items-center rounded-xl border border-line bg-surface-2 text-fg-2"
                style={{ [i ? 'right' : 'left']: -44 }}
                animate={{ y: [0, i ? 6 : -6, 0], rotate: i ? 8 : -8 }}
                transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.4 }}
              >
                <Icon size={18} />
              </motion.div>
            ))}
        </div>
        <div className="mt-6 font-display text-2xl font-semibold text-fg">{over ? 'Lascia pure qui' : 'Trascina qui il tuo estratto conto'}</div>
        <p className="mt-2 max-w-md text-sm text-fg-2">
          oppure <span className="font-semibold text-accent">sfoglia i file</span>. CSV ed Excel (.xlsx) danno i risultati migliori; il PDF funziona se contiene testo.
        </p>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-line bg-bg-2 px-3 py-1.5 text-xs text-fg-2">
          <Lock size={12} className="text-accent" /> Il file resta sul tuo dispositivo. Niente upload, niente server.
        </div>
      </motion.button>
      <input
        id="file-input"
        ref={input}
        type="file"
        multiple
        accept=".csv,.txt,.tsv,.xlsx,.xlsm,.pdf,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
    </div>
  )
}

function CopyButton({ text, label }: { text: string; label: string }) {
  return (
    <Button
      variant="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          toast('Copiato negli appunti')
        } catch {
          toast('Il browser non permette di copiare: seleziona il testo a mano.', 'error')
        }
      }}
    >
      <Copy size={15} /> {label}
    </Button>
  )
}

function PasswordStep({
  stage,
  onSubmit,
  onCancel,
}: {
  stage: Extract<Stage, { kind: 'password' }>
  onSubmit: (pw: string) => void
  onCancel: () => void
}) {
  const [pw, setPw] = useState('')
  return (
    <Card className="mx-auto max-w-lg p-6 sm:p-8">
      <motion.div
        animate={stage.incorrect ? { x: [0, -10, 10, -6, 6, 0] } : undefined}
        transition={{ duration: 0.4 }}
        className="grid size-14 place-items-center rounded-2xl border border-accent/40 bg-accent-soft text-accent"
      >
        <KeyRound size={26} />
      </motion.div>
      <h2 className="mt-5 text-xl font-semibold text-fg">{stage.incorrect ? 'Password non corretta' : 'Questo PDF è protetto'}</h2>
      <p className="mt-1 text-sm text-fg-2">
        Molte banche proteggono l'estratto conto con una password, spesso il codice fiscale o una parte di esso: la trovi nella mail o nell'area documenti della banca. La password serve solo ad aprire il file qui e non viene salvata.
      </p>
      <form
        className="mt-5 flex flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault()
          if (pw) onSubmit(pw)
        }}
      >
        <input
          id="pdf-password"
          type="password"
          autoFocus
          autoComplete="off"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="Password del PDF"
          className={cx(
            'h-11 flex-1 rounded-xl border bg-bg-2 px-3 text-fg outline-none placeholder:text-muted focus:border-accent/60',
            stage.incorrect ? 'border-critical/60' : 'border-line',
          )}
        />
        <Button type="submit" disabled={!pw}>
          Apri
        </Button>
      </form>
      <button onClick={onCancel} className="mt-4 text-sm text-muted hover:text-fg">
        Annulla
      </button>
    </Card>
  )
}

function Diagnostic({ stage, onBack }: { stage: Extract<Stage, { kind: 'nothing' }>; onBack: () => void }) {
  const empty = stage.text.length === 0
  const sample = stage.text.slice(0, 80).join('\n')
  return (
    <Card className="p-6 sm:p-8">
      <div className="flex items-start gap-3">
        <FileSearch className="mt-0.5 shrink-0 text-warning" size={22} />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-fg">{empty ? 'Questo PDF non contiene testo' : 'Ho letto il PDF ma non riconosco i movimenti'}</h2>
          {empty ? (
            <p className="mt-1 text-sm text-fg-2">
              È una scansione o un'immagine: per leggerla servirebbe il riconoscimento ottico (OCR), che Finny non fa. Scarica dall'home banking lo stesso periodo in CSV o Excel.
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm text-fg-2">
                Qui sotto c'è il testo che ho estratto da {stage.pages} {stage.pages === 1 ? 'pagina' : 'pagine'}, così come lo vedo io. Finny cerca righe che iniziano con una data e contengono un importo: se il tuo estratto è impaginato diversamente, da questo testo si capisce come adattarlo.
              </p>
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-fg">
                <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warning" />
                Il testo contiene dati personali (nome, IBAN, movimenti). Se lo condividi per farmi sistemare il formato, prima cancella o sostituisci quei dati: bastano 10-15 righe con intestazione e qualche movimento.
              </div>
              <pre className="scroll-thin mt-3 max-h-[360px] overflow-auto rounded-xl border border-line bg-bg-2 p-3 font-mono text-[11.5px] leading-relaxed whitespace-pre text-fg-2">{sample}</pre>
            </>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {!empty && <CopyButton text={sample} label="Copia il testo estratto" />}
            <Button onClick={onBack}>Prova un altro file</Button>
          </div>
        </div>
      </div>
    </Card>
  )
}

function Guide() {
  const steps = [
    { t: "Apri l'home banking dal computer", d: 'Le app spesso non permettono di esportare; il sito web sì.' },
    { t: 'Vai nella lista movimenti', d: 'Di solito si chiama "Movimenti", "Lista movimenti" o "Estratto conto".' },
    { t: 'Scegli il periodo ed esporta', d: 'Più mesi carichi, più precisi diventano abbonamenti, medie e consigli. Scegli Excel o CSV se disponibili.' },
  ]
  return (
    <div className="mt-6 grid gap-3 md:grid-cols-3">
      {steps.map((s, i) => (
        <Card key={s.t} className="p-5">
          <div className="font-mono text-xs text-accent">Passo {i + 1}</div>
          <div className="mt-2 font-semibold text-fg">{s.t}</div>
          <p className="mt-1 text-sm text-fg-2">{s.d}</p>
        </Card>
      ))}
      <Card className="flex items-start gap-3 p-5 md:col-span-3">
        <ShieldCheck className="mt-0.5 shrink-0 text-good" size={20} />
        <p className="text-sm text-fg-2">
          Finny legge il file con JavaScript dentro questa pagina e salva i movimenti nel database del browser (IndexedDB). Se reimporti lo stesso periodo, i movimenti già presenti vengono riconosciuti e saltati.
        </p>
      </Card>
    </div>
  )
}

interface Overlap {
  account: Account
  count: number
}

type Picker = ReturnType<typeof useCommit>['picker']

/** Where the movements go: an existing account (with how much of this period it already holds) or a new one */
function AccountPicker({ picker }: { picker: Picker }) {
  const { overlaps, targetId, setTarget, replace, setReplace, targetOverlap, range, name, setName, bank, setBank } = picker
  const target = overlaps.find((o) => o.account.id === targetId)
  return (
    <div className="space-y-2">
      <div className="text-sm text-fg-2">Importa in</div>
      {overlaps.map((o) => (
        <label key={o.account.id} className={cx('flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-colors', targetId === o.account.id ? 'border-accent/50 bg-accent-soft' : 'border-line')}>
          <input type="radio" name="target" checked={targetId === o.account.id} onChange={() => setTarget(o.account.id)} className="accent-[var(--accent)]" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-fg">{o.account.name}</span>
            <span className="text-xs text-muted">{o.count ? `${o.count} movimenti già presenti in questo periodo` : 'nessun movimento in questo periodo'}</span>
          </span>
        </label>
      ))}
      <label className={cx('flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-colors', targetId === 'new' ? 'border-accent/50 bg-accent-soft' : 'border-line')}>
        <input type="radio" name="target" checked={targetId === 'new'} onChange={() => setTarget('new')} className="accent-[var(--accent)]" />
        <span className="text-fg">Nuovo conto</span>
      </label>
      {targetId === 'new' && (
        <div className="grid gap-3 pt-1 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm text-fg-2">
            Nome del conto
            <input
              id="acc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={bank ? `Conto ${bank}` : 'Conto principale'}
              className="h-11 rounded-xl border border-line bg-bg-2 px-3 text-fg outline-none placeholder:text-muted focus:border-accent/60"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-fg-2">
            Banca
            <input
              id="acc-bank"
              value={bank}
              onChange={(e) => setBank(e.target.value)}
              placeholder="Es. Intesa Sanpaolo"
              className="h-11 rounded-xl border border-line bg-bg-2 px-3 text-fg outline-none placeholder:text-muted focus:border-accent/60"
            />
          </label>
        </div>
      )}
      {target && targetOverlap > 0 && (
        <label className={cx('mt-1 flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm', replace ? 'border-good/40 bg-good/10' : 'border-warning/40 bg-warning/10')}>
          <input id="replace" type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
          <span className="text-fg">
            Sostituisci i {targetOverlap} movimenti di {target.account.name} dal {shortDate(range.from)} al {shortDate(range.to)} <span className="text-muted">(consigliato)</span>
            <span className="mt-1 block text-xs text-fg-2">
              {replace
                ? "L'estratto conto fa fede per il suo periodo: i movimenti già presenti, anche quelli importati male in passato, vengono sostituiti. Le regole di categoria restano."
                : 'Verranno aggiunti solo i movimenti che non risultano già presenti. Se i dati esistenti sono sbagliati, resteranno.'}
            </span>
          </span>
        </label>
      )}
    </div>
  )
}

function useCommit(source: TxSource, fileName: string, onDone: (name: string, o: ImportOutcome) => void, drafts: DraftTx[], detectedBank?: string) {
  const importDrafts = useFinny((s) => s.importDrafts)
  const accounts = useFinny((s) => s.accounts)
  const transactions = useFinny((s) => s.transactions)
  const isDemo = useFinny((s) => s.isDemo)
  const [name, setName] = useState('')
  const [bank, setBank] = useState(detectedBank || guessName(fileName))
  const [chosen, setTarget] = useState<string | null>(null)
  const [replace, setReplace] = useState(true)

  const range = useMemo(() => {
    let from = '9999-12-31'
    let to = ''
    for (const d of drafts) {
      if (d.date < from) from = d.date
      if (d.date > to) to = d.date
    }
    return { from, to }
  }, [drafts])

  const overlaps: Overlap[] = useMemo(() => {
    if (isDemo) return []
    return accounts
      .map((account) => ({ account, count: transactions.filter((t) => t.accountId === account.id && t.date >= range.from && t.date <= range.to).length }))
      .sort((a, b) => b.count - a.count)
  }, [accounts, transactions, range, isDemo])

  // the same statement imported again lands where most of its period already is
  const suggested = overlaps[0] && overlaps[0].count >= Math.max(5, drafts.length * 0.3) ? overlaps[0].account.id : 'new'
  const targetId = chosen ?? suggested
  const targetOverlap = overlaps.find((o) => o.account.id === targetId)?.count ?? 0

  const commit = (ds: DraftTx[], balance?: { amount: number; date: string }, holder?: string) => {
    const existing = targetId === 'new' ? undefined : accounts.find((a) => a.id === targetId)
    const outcome = importDrafts({
      accountId: existing?.id,
      accountName: existing?.name ?? (name.trim() || (bank ? `Conto ${bank}` : 'Conto principale')),
      institution: bank,
      source,
      drafts: ds,
      balance,
      holder,
      replaceRange: existing && replace && targetOverlap > 0 ? range : undefined,
    })
    onDone(fileName, outcome)
  }
  return { commit, picker: { overlaps, targetId, setTarget, replace, setReplace, targetOverlap, range, name, setName, bank, setBank } }
}

const FIELDS: { key: keyof Mapping; label: string; multi?: boolean }[] = [
  { key: 'date', label: 'Data' },
  { key: 'description', label: 'Descrizione', multi: true },
  { key: 'amount', label: 'Importo (con segno)' },
  { key: 'debit', label: 'Uscite / Dare' },
  { key: 'credit', label: 'Entrate / Avere' },
  { key: 'balance', label: 'Saldo' },
]

function TableReview({
  stage,
  onCancel,
  onDone,
}: {
  stage: Extract<Stage, { kind: 'table' }>
  onCancel: () => void
  onDone: (name: string, o: ImportOutcome) => void
}) {
  const [mapping, setMapping] = useState<Mapping>(stage.table.mapping)
  const [invert, setInvert] = useState(false)
  const [dateOrder, setDateOrder] = useState(stage.table.dateOrder)
  const problems = mappingProblems(mapping)
  const result = useMemo(
    () => (problems.length ? null : toDrafts({ rows: stage.table.rows, mapping, dateOrder }, { invertSign: invert })),
    [stage.table.rows, mapping, dateOrder, invert, problems.length],
  )
  const headers = stage.table.headers
  const { commit, picker } = useCommit(stage.fileKind, stage.name, onDone, result?.drafts ?? [])

  const setField = (key: keyof Mapping, value: string) => {
    setMapping((m) => {
      const v = value === '' ? null : Number(value)
      if (key === 'description') return { ...m, description: v == null ? [] : [v] }
      const next = { ...m, [key]: v }
      // amount and debit/credit are alternatives
      if (key === 'amount' && v != null) Object.assign(next, { debit: null, credit: null })
      if ((key === 'debit' || key === 'credit') && v != null) next.amount = null
      return next
    })
  }

  const inc = result?.drafts.filter((d) => d.amount > 0).reduce((a, d) => a + d.amount, 0) ?? 0
  const out = result?.drafts.filter((d) => d.amount < 0).reduce((a, d) => a - d.amount, 0) ?? 0
  const range = result?.drafts.length ? [result.drafts.reduce((a, d) => (d.date < a ? d.date : a), '9999'), result.drafts.reduce((a, d) => (d.date > a ? d.date : a), '')] : null

  return (
    <div className="grid gap-4 lg:grid-cols-12 lg:gap-5">
      <Card className="p-5 sm:p-6 lg:col-span-5">
        <div className="flex items-center gap-2 text-sm text-fg-2">
          <FileSpreadsheet size={16} className="text-accent" />
          <span className="truncate font-medium text-fg">{stage.name}</span>
        </div>
        <h2 className="mt-4 text-lg font-semibold text-fg">Controlla le colonne</h2>
        <p className="mt-1 text-sm text-fg-2">
          {stage.table.headerRow >= 0 ? `Ho trovato l'intestazione alla riga ${stage.table.headerRow + 1}` : 'Il file non ha intestazione: ho riconosciuto le colonne dal contenuto'}. Correggi se qualcosa non torna.
        </p>
        <div className="mt-4 grid gap-2.5">
          {FIELDS.map((f) => {
            const current = f.key === 'description' ? mapping.description[0] : (mapping[f.key] as number | null)
            return (
              <label key={f.key} className="grid grid-cols-[130px_1fr] items-center gap-3 text-sm text-fg-2">
                {f.label}
                <select
                  id={`map-${f.key}`}
                  value={current ?? ''}
                  onChange={(e) => setField(f.key, e.target.value)}
                  className={cx(
                    'h-10 min-w-0 rounded-xl border bg-bg-2 px-3 text-fg outline-none focus:border-accent/60',
                    current != null ? 'border-accent/40' : 'border-line',
                  )}
                >
                  <option value="">—</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            )
          })}
        </div>
        <div className="mt-4 grid gap-2 text-sm text-fg-2">
          <label className="flex items-center gap-2">
            <input id="invert" type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} className="size-4 accent-[var(--accent)]" />
            Inverti il segno (se le uscite risultano positive)
          </label>
          <label className="flex items-center gap-2">
            <input id="mdy" type="checkbox" checked={dateOrder === 'mdy'} onChange={(e) => setDateOrder(e.target.checked ? 'mdy' : 'dmy')} className="size-4 accent-[var(--accent)]" />
            Le date sono nel formato americano (mese/giorno)
          </label>
        </div>
        <div className="mt-5">
          <AccountPicker picker={picker} />
        </div>
      </Card>

      <Card className="flex flex-col p-5 sm:p-6 lg:col-span-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-fg">Anteprima</h2>
          {result && (
            <div className="flex gap-3 text-sm tabular-nums">
              <span className="text-good-text">+{money(inc, { round: true })}</span>
              <span className="text-fg">−{money(out, { round: true })}</span>
            </div>
          )}
        </div>
        {problems.length > 0 ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-fg">
            <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warning" />
            <div>{problems.map((p) => <div key={p}>{p}</div>)}</div>
          </div>
        ) : (
          result && (
            <>
              <p className="mt-1 text-sm text-fg-2">
                {result.drafts.length} movimenti{range && ` dal ${shortDate(range[0])} al ${shortDate(range[1])}`}
                {result.skipped > 0 && ` · ${result.skipped} righe saltate (saldi, totali, righe vuote o annullate)`}
              </p>
              <DraftTable drafts={result.drafts} />
            </>
          )
        )}
        <details className="mt-4 text-sm text-fg-2">
          <summary className="cursor-pointer text-muted hover:text-fg">Righe originali del file</summary>
          <div className="scroll-thin mt-2 max-h-56 overflow-auto rounded-xl border border-line">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface-2">
                <tr>
                  {headers.map((h, i) => (
                    <th key={i} className="px-2 py-1.5 text-left font-medium whitespace-nowrap text-muted">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stage.table.rows.slice(0, 12).map((r, i) => (
                  <tr key={i} className="border-t border-line">
                    {headers.map((_, j) => (
                      <td key={j} className="px-2 py-1.5 whitespace-nowrap text-fg-2">
                        {cellText(r[j])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        <div className="mt-auto flex flex-wrap justify-end gap-2 pt-5">
          <Button variant="ghost" onClick={onCancel}>
            Annulla
          </Button>
          <Button disabled={!result?.drafts.length} onClick={() => result && commit(result.drafts, result.latestBalance)}>
            <Check size={16} /> Importa {result?.drafts.length ?? 0} movimenti
          </Button>
        </div>
      </Card>
    </div>
  )
}

function DraftTable({ drafts, onFlip }: { drafts: DraftTx[]; onFlip?: (key: string) => void }) {
  const [all, setAll] = useState(false)
  const shown = all ? drafts : drafts.slice(0, 10)
  return (
    <div className="mt-3">
      <div className="scroll-thin max-h-[380px] overflow-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <tbody className="tabular">
            {shown.map((d, i) => (
              <motion.tr key={d.key} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 10) * 0.025 }} className="border-t border-line first:border-t-0">
                <td className="px-3 py-2 whitespace-nowrap text-muted">{shortDate(d.date)}</td>
                <td className="max-w-[260px] truncate px-3 py-2 text-fg" title={d.description}>
                  {d.description}
                </td>
                <td className={cx('px-3 py-2 text-right font-semibold whitespace-nowrap', d.amount > 0 ? 'text-good-text' : 'text-fg')}>{money(d.amount, { sign: true })}</td>
                {onFlip && (
                  <td className="w-8 pr-2">
                    <button aria-label="Inverti segno" title="Inverti segno" onClick={() => onFlip(d.key)} className="grid size-7 place-items-center rounded-full text-muted hover:bg-surface-3 hover:text-fg">
                      <ArrowLeftRight size={13} />
                    </button>
                  </td>
                )}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      {drafts.length > 10 && (
        <button onClick={() => setAll((v) => !v)} className="mt-2 text-xs font-semibold text-accent">
          {all ? 'Mostra meno' : `Mostra tutti i ${drafts.length}`}
        </button>
      )}
    </div>
  )
}

function PdfReview({
  stage,
  onCancel,
  onDone,
}: {
  stage: Extract<Stage, { kind: 'pdf' }>
  onCancel: () => void
  onDone: (name: string, o: ImportOutcome) => void
}) {
  const [all, setAll] = useState(stage.result.drafts)
  const sections = stage.result.sections
  const [included, setIncluded] = useState(() => new Set(sections.filter((x) => x.includeByDefault).map((x) => x.name)))
  const drafts = useMemo(() => all.filter((d) => included.has(d.section ?? 'Movimenti')), [all, included])
  const setDrafts = setAll
  const totals = useMemo(() => {
    const out = drafts.filter((d) => d.amount < 0).reduce((a, d) => a - d.amount, 0)
    const inc = drafts.filter((d) => d.amount > 0).reduce((a, d) => a + d.amount, 0)
    return { out, inc }
  }, [drafts])
  const { commit, picker } = useCommit('pdf', stage.name, onDone, drafts, stage.result.institution)
  const flip = (key: string) => setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, amount: -d.amount } : d)))
  const note = {
    columns: { tone: 'good', text: 'Ho riconosciuto le colonne Dare/Avere: il segno dei movimenti dovrebbe essere corretto.' },
    explicit: { tone: 'good', text: 'Gli importi hanno il segno scritto nel PDF.' },
    guess: {
      tone: 'warning',
      text: 'Il PDF non indica chiaramente entrate e uscite: le ho dedotte dalle parole della causale. Controlla i segni e usa le frecce per correggerli.',
    },
  }[stage.result.signSource]
  return (
    <div className="grid gap-4 lg:grid-cols-12 lg:gap-5">
      <Card className="p-5 sm:p-6 lg:col-span-5">
        <div className="flex items-center gap-2 text-sm text-fg-2">
          <FileText size={16} className="text-accent" />
          <span className="truncate font-medium text-fg">{stage.name}</span>
          <span className="ml-auto shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px]">PDF · beta</span>
        </div>
        <h2 className="mt-4 text-lg font-semibold text-fg">
          {drafts.length} movimenti in {stage.result.pages} {stage.result.pages === 1 ? 'pagina' : 'pagine'}
        </h2>
        {sections.length > 1 && (
          <div className="mt-3 space-y-1.5">
            <div className="text-sm text-fg-2">Sezioni dell'estratto: importo solo il conto. Movimenti in sospeso, stornati e del conto deposito sono esclusi per non contarli due volte.</div>
            {sections.map((x) => {
              const on = included.has(x.name)
              return (
                <label key={x.name} className={cx('flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-colors', on ? 'border-accent/50 bg-accent-soft' : 'border-line')}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      setIncluded((cur) => {
                        const n = new Set(cur)
                        if (n.has(x.name)) n.delete(x.name)
                        else n.add(x.name)
                        return n
                      })
                    }
                    className="size-4 accent-[var(--accent)]"
                  />
                  <span className="flex-1 text-fg">{x.name}</span>
                  <span className="text-muted tabular-nums">{x.count}</span>
                </label>
              )
            })}
          </div>
        )}
        {stage.result.holder && (
          <p className="mt-3 text-sm text-fg-2">
            Intestatario: <span className="font-medium text-fg">{stage.result.holder}</span>. I movimenti verso o da questo nome li considero giroconti tra i tuoi conti, non spese né entrate.
          </p>
        )}
        <div className={cx('mt-3 flex items-start gap-2 rounded-xl border p-3 text-sm', note.tone === 'good' ? 'border-good/40 bg-good/10' : 'border-warning/40 bg-warning/10')}>
          {note.tone === 'good' ? <Check size={16} className="mt-0.5 shrink-0 text-good" /> : <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warning" />}
          <span className="text-fg">{note.text}</span>
        </div>
        <p className="mt-3 text-sm text-fg-2">
          I PDF delle banche hanno impaginazioni molto diverse tra loro. Se l'anteprima è sbagliata, esporta lo stesso periodo in CSV o Excel: è più affidabile.
        </p>
        <Button variant="secondary" className="mt-3" onClick={() => setDrafts((ds) => ds.map((d) => ({ ...d, amount: -d.amount })))}>
          <RotateCcw size={15} /> Inverti tutti i segni
        </Button>
        <div className="mt-5">
          <AccountPicker picker={picker} />
        </div>
      </Card>
      <Card className="flex flex-col p-5 sm:p-6 lg:col-span-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-fg">Anteprima</h2>
          <div className="flex gap-3 text-sm tabular-nums">
            <span className="text-good-text">+{money(totals.inc)}</span>
            <span className="text-fg">−{money(totals.out)}</span>
          </div>
        </div>
        <p className="mt-1 text-xs text-muted">Confronta questi totali con il riepilogo stampato nell'estratto: devono coincidere.</p>
        {stage.result.latestBalance && <p className="mt-1 text-xs text-muted">Saldo di chiusura letto: {money(stage.result.latestBalance.amount)} al {shortDate(stage.result.latestBalance.date)}</p>}
        <DraftTable drafts={drafts} onFlip={flip} />
        <div className="mt-auto flex flex-wrap justify-end gap-2 pt-5">
          <Button variant="ghost" onClick={onCancel}>
            Annulla
          </Button>
          <Button disabled={!drafts.length} onClick={() => commit(drafts, included.size === 1 && included.has(sections.find((x) => x.includeByDefault)?.name ?? '') ? stage.result.latestBalance : undefined, stage.result.holder)}>
            <Check size={16} /> Importa {drafts.length} movimenti
          </Button>
        </div>
      </Card>
    </div>
  )
}

function Done({ stage, next, onNext }: { stage: Extract<Stage, { kind: 'done' }>; next?: File; onNext: () => void }) {
  const go = useFinny((s) => s.go)
  return (
    <Card className="flex flex-col items-center px-6 py-14 text-center">
      <motion.div
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 14 }}
        className="grid size-20 place-items-center rounded-full bg-accent text-accent-ink shadow-[0_0_60px_-10px_var(--accent)]"
      >
        <motion.svg width="36" height="36" viewBox="0 0 24 24" fill="none">
          <motion.path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.25, duration: 0.5 }} />
        </motion.svg>
      </motion.div>
      <h2 className="mt-6 text-3xl font-semibold text-fg">
        {stage.outcome.added} {stage.outcome.added === 1 ? 'movimento importato' : 'movimenti importati'}
      </h2>
      <p className="mt-2 max-w-md text-fg-2">
        {stage.outcome.replaced > 0 ? `Ho sostituito i ${stage.outcome.replaced} movimenti che c'erano già per questo periodo. ` : ''}
        {stage.outcome.duplicates > 0 ? `${stage.outcome.duplicates} erano già presenti e li ho saltati. ` : ''}
        Ho assegnato le categorie in automatico: se qualcuna è sbagliata, correggila da Movimenti e Finny se lo ricorderà.
      </p>
      <div className="mt-4">
        <AiCategorize auto />
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {next ? (
          <Button onClick={onNext}>Prosegui con {next.name}</Button>
        ) : (
          <Button onClick={() => go('home')}>Vedi la panoramica</Button>
        )}
        <Button variant="secondary" onClick={() => (next ? go('home') : onNext())}>
          {next ? 'Vai alla panoramica' : 'Importa un altro file'}
        </Button>
      </div>
    </Card>
  )
}
