import { Copy, Database, Download, HardDrive, Sparkles, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTheme } from '../components/Shell'
import { PageHeader } from '../components/shared'
import { toast } from '../components/ui/toast'
import { Button, Card, SectionTitle, Segmented } from '../components/ui/primitives'
import { category } from '../lib/categories'
import { shortDate, todayISO } from '../lib/format'
import type { Snapshot } from '../lib/types'
import { useFinny } from '../store/useFinny'

export default function Impostazioni() {
  const s = useFinny()
  const [theme, setTheme] = useTheme()
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [confirmAcc, setConfirmAcc] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)

  const snapshot = (): Snapshot => ({
    version: 1,
    transactions: s.transactions,
    accounts: s.accounts,
    rules: s.rules,
    budgets: s.budgets,
    isDemo: s.isDemo,
  })

  const download = () => {
    try {
      const blob = new Blob([JSON.stringify(snapshot(), null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `finny-backup-${todayISO()}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 2000)
      toast('Backup scaricato')
    } catch {
      toast('Il download non è disponibile qui: usa "Copia backup".', 'error')
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(snapshot()))
      toast('Backup copiato negli appunti')
    } catch {
      toast('Il browser non permette di copiare: prova "Scarica backup".', 'error')
    }
  }

  const restore = async (f: File) => {
    try {
      const data = JSON.parse(await f.text()) as Snapshot
      if (data.version !== 1 || !Array.isArray(data.transactions)) throw new Error('bad')
      s.restore(data)
      toast(`Backup ripristinato: ${data.transactions.length} movimenti`)
    } catch {
      toast('Questo file non è un backup di Finny.', 'error')
    }
  }

  return (
    <>
      <PageHeader eyebrow="Impostazioni" title="I tuoi dati, le tue regole." />
      <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
        <Card className="p-5 sm:p-6">
          <SectionTitle eyebrow="Privacy" title="Dove sono i tuoi dati" />
          <div className="mt-4 flex items-start gap-3">
            <HardDrive className="mt-0.5 shrink-0 text-accent" size={20} />
            <p className="text-sm text-fg-2">
              Movimenti, regole e budget sono salvati solo in questo browser, nel suo database locale (IndexedDB). Finny non ha un server e non invia i tuoi dati a nessuno. Se cancelli i dati del sito o cambi dispositivo, ti serve un backup.
            </p>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-bg-2 px-3 py-2 text-sm">
            <span className={`size-2 rounded-full ${s.persistent ? 'bg-good' : 'bg-warning'}`} />
            <span className="text-fg-2">{s.persistent ? 'Salvataggio locale attivo' : 'Questo browser non permette di salvare: i dati spariranno chiudendo la pagina'}</span>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <SectionTitle eyebrow="Aspetto" title="Tema" />
          <div className="mt-4">
            <Segmented
              id="theme"
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'light', label: 'Chiaro' },
                { value: 'system', label: 'Automatico' },
                { value: 'dark', label: 'Scuro' },
              ]}
            />
          </div>
          <p className="mt-3 text-sm text-fg-2">Automatico segue il tema del dispositivo. Le animazioni si riducono da sole se hai attivato "Riduci movimento".</p>
        </Card>

        <Card className="p-5 sm:p-6">
          <SectionTitle eyebrow="Backup" title="Esporta o ripristina" />
          <p className="mt-2 text-sm text-fg-2">Un file JSON con movimenti, conti, regole e budget. Tienilo in un posto sicuro: contiene tutta la tua storia finanziaria.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={download}>
              <Download size={15} /> Scarica backup
            </Button>
            <Button variant="secondary" onClick={copy}>
              <Copy size={15} /> Copia backup
            </Button>
            <Button variant="secondary" onClick={() => file.current?.click()}>
              <Upload size={15} /> Ripristina
            </Button>
            <input
              id="restore-file"
              ref={file}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void restore(f)
                e.target.value = ''
              }}
            />
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <SectionTitle eyebrow="Conti" title={`${s.accounts.length} ${s.accounts.length === 1 ? 'conto' : 'conti'}`} />
          <ul className="mt-3 space-y-1">
            {s.accounts.map((a) => {
              const n = s.transactions.filter((t) => t.accountId === a.id).length
              return (
                <li key={a.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                  <Database size={16} className="text-muted" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-fg">{a.name}</div>
                    <div className="text-xs text-muted">
                      {a.institution || 'Banca non indicata'} · {n} movimenti · aggiunto il {shortDate(a.createdAt)}
                    </div>
                  </div>
                  {confirmAcc === a.id ? (
                    <div className="flex gap-1">
                      <Button variant="ghost" className="px-3 py-1.5" onClick={() => setConfirmAcc(null)}>
                        No
                      </Button>
                      <Button
                        variant="danger"
                        className="px-3 py-1.5"
                        onClick={() => {
                          s.deleteAccount(a.id)
                          setConfirmAcc(null)
                          toast(`${a.name} eliminato con ${n} movimenti`)
                        }}
                      >
                        Elimina
                      </Button>
                    </div>
                  ) : (
                    <button aria-label={`Elimina ${a.name}`} onClick={() => setConfirmAcc(a.id)} className="rounded-full p-2 text-muted hover:bg-surface-3 hover:text-critical-text">
                      <Trash2 size={15} />
                    </button>
                  )}
                </li>
              )
            })}
            {!s.accounts.length && <li className="px-2 py-3 text-sm text-muted">Nessun conto.</li>}
          </ul>
        </Card>

        <Card className="p-5 sm:p-6">
          <SectionTitle eyebrow="Categorie" title="Regole che hai insegnato a Finny" />
          <p className="mt-2 text-sm text-fg-2">Nascono quando correggi una categoria con "Applica a tutti". Valgono anche per i prossimi import.</p>
          <ul className="mt-3 space-y-1">
            {s.rules.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-mono text-fg">“{r.match}”</span>
                  <span className="text-muted"> → </span>
                  <span className="text-fg-2">{category(r.category).label}</span>
                </span>
                <button aria-label="Elimina regola" onClick={() => s.deleteRule(r.id)} className="rounded-full p-2 text-muted hover:bg-surface-3 hover:text-fg">
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
            {!s.rules.length && <li className="px-2 py-3 text-sm text-muted">Ancora nessuna regola.</li>}
          </ul>
        </Card>

        <Card className="p-5 sm:p-6">
          <SectionTitle eyebrow="Zona pericolosa" title="Ricomincia" />
          <p className="mt-2 text-sm text-fg-2">Puoi tornare ai dati di esempio o cancellare tutto da questo browser. Non si può annullare: fai prima un backup se ti serve.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                s.resetToDemo()
                toast('Dati di esempio caricati')
              }}
            >
              <Sparkles size={15} /> Carica dati di esempio
            </Button>
            {confirmWipe ? (
              <>
                <Button variant="ghost" onClick={() => setConfirmWipe(false)}>
                  Annulla
                </Button>
                <Button
                  variant="danger"
                  onClick={async () => {
                    await s.wipe()
                    setConfirmWipe(false)
                    toast('Tutti i dati sono stati cancellati')
                  }}
                >
                  Sì, cancella tutto
                </Button>
              </>
            ) : (
              <Button variant="danger" onClick={() => setConfirmWipe(true)}>
                <Trash2 size={15} /> Cancella tutti i dati
              </Button>
            )}
          </div>
        </Card>
      </div>
    </>
  )
}
