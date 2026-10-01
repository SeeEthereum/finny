import { Eye, EyeOff, KeyRound, Loader2, Server, ShieldAlert, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { AiError, DEFAULT_BASE_URL, listModels, SERVER_BASE_URL } from '../lib/ai/client'
import { useAi } from '../store/ai'
import { toast } from './ui/toast'
import { Button, cx, Segmented } from './ui/primitives'

const SRC_OPENAI_DATA = 'https://developers.openai.com/api/docs/guides/your-data'

export function AiDisclosure() {
  const mode = useAi((s) => s.mode)
  return (
    <div className="rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm text-fg">
      <div className="flex items-center gap-2 font-semibold">
        <ShieldAlert size={16} className="text-warning" /> Cosa succede ai dati quando usi l'AI
      </div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-fg-2">
        <li>
          La connessione è cifrata (HTTPS), ma OpenAI riceve e legge i dati <strong className="text-fg">in chiaro</strong> per elaborarli: non esiste un'elaborazione "cifrata" del contenuto.
        </li>
        <li>Finny non manda i movimenti grezzi. Il modello chiede solo i dati che gli servono (totali, categorie, singoli movimenti filtrati) e sotto ogni risposta vedi esattamente cosa è stato inviato.</li>
        <li>Causali originali, IBAN e nomi dei conti non vengono mai inviati.</li>
        <li>
          Secondo OpenAI, i dati inviati via API non vengono usati per addestrare i modelli, ma restano nei log fino a 30 giorni per il controllo degli abusi.{' '}
          <a className="underline underline-offset-4" href={SRC_OPENAI_DATA} target="_blank" rel="noreferrer">
            Fonte: OpenAI, Data controls
          </a>
        </li>
        {mode === 'server' ? (
          <li>La chiave resta nelle variabili di Netlify e il browser non la vede mai. I dati passano dalla funzione di Netlify prima di arrivare a OpenAI. Imposta comunque un limite di spesa nel pannello di OpenAI.</li>
        ) : (
          <li>La chiave resta solo in questo browser e non entra nel backup. Chi usa questo browser può usarla: imposta un limite di spesa nel pannello di OpenAI.</li>
        )}
      </ul>
    </div>
  )
}

export function AiSetup({ compact = false }: { compact?: boolean }) {
  const ai = useAi()
  const [key, setKey] = useState(ai.apiKey)
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [advanced, setAdvanced] = useState(ai.baseUrl !== DEFAULT_BASE_URL)
  const [baseUrl, setBaseUrl] = useState(ai.baseUrl)

  const [pass, setPass] = useState(ai.passphrase)
  const [showPass, setShowPass] = useState(!!ai.passphrase)
  const server = ai.mode === 'server'

  const verify = async () => {
    setBusy(true)
    try {
      const cfg = server
        ? { apiKey: '', baseUrl: SERVER_BASE_URL, passphrase: pass.trim() || undefined }
        : { apiKey: key.trim(), baseUrl: baseUrl.trim() || DEFAULT_BASE_URL }
      const models = await listModels(cfg)
      if (!models.length) throw new AiError('model', 'La chiave funziona ma non vedo modelli disponibili.')
      const model = models.includes(ai.model) ? ai.model : models[0]
      ai.update(
        server
          ? { passphrase: pass.trim(), models, model, enabled: true }
          : { apiKey: key.trim(), baseUrl: baseUrl.trim() || DEFAULT_BASE_URL, models, model, enabled: true },
      )
      toast(server ? `Collegamento con Netlify riuscito: ${models.length} modelli disponibili` : `Chiave verificata: ${models.length} modelli disponibili`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Verifica non riuscita', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <Segmented
        id="ai-mode"
        value={ai.mode}
        onChange={(mode) => ai.update({ mode, enabled: false, models: [], model: '' })}
        options={[
          { value: 'server', label: 'Chiave su Netlify' },
          { value: 'browser', label: 'Chiave nel browser' },
        ]}
      />
      {!compact && <AiDisclosure />}
      {server ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            void verify()
          }}
        >
          <div className="rounded-2xl border border-line bg-bg-2 p-4 text-sm text-fg-2">
            <div className="flex items-center gap-2 font-semibold text-fg">
              <Server size={16} className="text-accent" /> Una volta sola, su Netlify
            </div>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>
                <span className="text-fg">Site configuration → Environment variables → Add a variable</span>
              </li>
              <li>
                Nome <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[12px] text-fg">OPENAI_API_KEY</code>, valore: la tua chiave. Segnala come segreta se Netlify te lo propone.
              </li>
              <li>Non usare nomi che iniziano con VITE_: finirebbero nel codice pubblico del sito.</li>
              <li>Fai ripartire il deploy (Deploys → Trigger deploy) e torna qui.</li>
            </ol>
          </div>
          {showPass ? (
            <label className="flex flex-col gap-1 text-sm text-fg-2">
              Passphrase (solo se hai impostato FINNY_PASSPHRASE su Netlify)
              <input
                id="ai-pass"
                type="password"
                autoComplete="off"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                className="h-11 rounded-xl border border-line bg-bg-2 px-3 text-fg outline-none focus:border-accent/60"
              />
            </label>
          ) : (
            <button type="button" onClick={() => setShowPass(true)} className="block text-xs text-muted underline underline-offset-4 hover:text-fg-2">
              Ho impostato anche una passphrase
            </button>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : null}
            {ai.enabled ? 'Verifica di nuovo' : 'Verifica collegamento'}
          </Button>
        </form>
      ) : (
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (key.trim()) void verify()
        }}
      >
        <label className="flex flex-col gap-1 text-sm text-fg-2">
          Chiave API di OpenAI
          <div className="flex items-center gap-2 rounded-xl border border-line bg-bg-2 px-3 focus-within:border-accent/60">
            <KeyRound size={15} className="text-muted" />
            <input
              id="ai-key"
              type={show ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-…"
              className="h-11 min-w-0 flex-1 bg-transparent font-mono text-sm text-fg outline-none placeholder:text-muted"
            />
            <button type="button" aria-label={show ? 'Nascondi chiave' : 'Mostra chiave'} onClick={() => setShow((v) => !v)} className="text-muted hover:text-fg">
              {show ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </label>
        {advanced ? (
          <label className="flex flex-col gap-1 text-sm text-fg-2">
            Indirizzo dell'API (compatibile OpenAI)
            <input
              id="ai-base"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={DEFAULT_BASE_URL}
              className="h-11 rounded-xl border border-line bg-bg-2 px-3 font-mono text-sm text-fg outline-none focus:border-accent/60"
            />
            <span className="text-xs text-muted">Per esempio un modello locale con Ollama: http://localhost:11434/v1. In quel caso i dati non escono dal computer.</span>
          </label>
        ) : (
          <button type="button" onClick={() => setAdvanced(true)} className="text-xs text-muted underline underline-offset-4 hover:text-fg-2">
            Usa un altro servizio compatibile o un modello locale
          </button>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!key.trim() || busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : null}
            {ai.apiKey ? 'Verifica di nuovo' : 'Verifica e attiva'}
          </Button>
          {ai.apiKey && (
            <Button
              type="button"
              variant="ghost"
              onClick={async () => {
                await ai.forget()
                setKey('')
                toast('Chiave dimenticata da questo browser')
              }}
            >
              <Trash2 size={15} /> Dimentica la chiave
            </Button>
          )}
        </div>
      </form>
      )}

      {ai.models.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm text-fg-2">
            Modello
            <select
              id="ai-model"
              value={ai.model}
              onChange={(e) => ai.update({ model: e.target.value })}
              className="h-11 rounded-xl border border-line bg-bg-2 px-3 text-fg outline-none focus:border-accent/60"
            >
              {ai.models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted">La lista arriva dal tuo account. I modelli più grandi rispondono meglio ma costano di più.</span>
          </label>
          <div className="flex flex-col gap-2 text-sm text-fg-2">
            <span>Cosa può vedere</span>
            {[
              { v: true, t: 'Nomi degli esercenti', d: 'Risposte più utili ("quanto da Esselunga?")' },
              { v: false, t: 'Solo le categorie', d: 'Al posto del nome esce la categoria' },
            ].map((o) => (
              <button
                key={o.t}
                type="button"
                onClick={() => ai.update({ shareMerchants: o.v })}
                className={cx('rounded-xl border px-3 py-2 text-left transition-colors', ai.shareMerchants === o.v ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong')}
              >
                <div className="font-medium text-fg">{o.t}</div>
                <div className="text-xs text-muted">{o.d}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {(server ? ai.models.length > 0 : !!ai.apiKey) && (
        <label className="flex items-center gap-2 text-sm text-fg-2">
          <input id="ai-enabled" type="checkbox" checked={ai.enabled} onChange={(e) => ai.update({ enabled: e.target.checked })} className="size-4 accent-[var(--accent)]" />
          Assistente AI attivo
        </label>
      )}
    </div>
  )
}
