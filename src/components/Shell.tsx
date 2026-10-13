import {
  ChartPie, ChevronRight, FileUp, Home, Landmark, LayoutGrid, ListOrdered, MessageCircle, Plus, Repeat, Search, Settings, Sparkles, Target,
  type LucideIcon,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { money } from '../lib/format'
import type { View } from '../lib/insights'
import { useAiReady } from '../store/ai'
import { useUi } from '../store/ui'
import { useFinny } from '../store/useFinny'
import { Mark } from './ui/Brand'
import { cx, IconButton } from './ui/primitives'

export const NAV: { id: View; label: string; short?: string; icon: LucideIcon; dock?: boolean; hint?: string }[] = [
  { id: 'home', label: 'Panoramica', short: 'Home', icon: Home, dock: true },
  { id: 'movimenti', label: 'Movimenti', icon: ListOrdered, dock: true },
  { id: 'abbonamenti', label: 'Ricorrenti', icon: Repeat, dock: true },
  { id: 'analisi', label: 'Analisi', icon: ChartPie, dock: true },
  { id: 'chiedi', label: 'Chiedi a Finny', short: 'Chiedi', icon: MessageCircle, hint: "Domande libere all'assistente AI" },
  { id: 'budget', label: 'Budget', icon: Target, hint: 'Un tetto per ogni categoria' },
  { id: 'importa', label: 'Importa estratto', short: 'Importa', icon: FileUp, hint: 'CSV, Excel o PDF' },
  { id: 'collega', label: 'Collega conto', short: 'Collega', icon: Landmark, hint: 'Come funziona il PSD2' },
  { id: 'impostazioni', label: 'Impostazioni', icon: Settings, hint: 'Tema, AI, backup, conti' },
]

type Theme = 'system' | 'light' | 'dark'
// v2: the redesign is light-first, so an untouched "system" choice from before doesn't carry over
const THEME_KEY = 'finny:theme:v2'

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem(THEME_KEY) as Theme) || 'light'
    } catch {
      return 'light'
    }
  })
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      /* remembered only for this visit */
    }
  }, [theme])
  return [theme, setTheme] as const
}

/** Floating dark dock: round buttons, the active one opens into a white pill with its label */
function Dock() {
  const view = useFinny((s) => s.view)
  const go = useFinny((s) => s.go)
  const [more, setMore] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const main = NAV.filter((n) => n.dock)
  const secondary = NAV.filter((n) => !n.dock)
  const current = secondary.find((n) => n.id === view)

  useEffect(() => {
    if (!more) return
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMore(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMore(false)
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [more])

  const items: { id: string; label: string; icon: LucideIcon; active: boolean; onClick: () => void }[] = [
    ...main.map((n) => ({ id: n.id, label: n.short ?? n.label, icon: n.icon, active: view === n.id, onClick: () => go(n.id) })),
    { id: 'more', label: current ? (current.short ?? current.label) : 'Altro', icon: current ? current.icon : LayoutGrid, active: !!current, onClick: () => setMore((m) => !m) },
  ]

  return (
    <div ref={ref} className="fixed inset-x-0 bottom-[calc(14px+env(safe-area-inset-bottom,0px))] z-40 flex justify-center px-3">
      <AnimatePresence>
        {more && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="absolute bottom-[calc(100%+10px)] w-[min(92vw,360px)] origin-bottom rounded-[28px] bg-surface p-2 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.35)]"
          >
            {secondary.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  setMore(false)
                  go(n.id)
                }}
                className={cx('flex w-full items-center gap-3 rounded-[20px] px-3 py-2.5 text-left transition-colors hover:bg-surface-2', view === n.id && 'bg-surface-2')}
              >
                <span className="grid size-10 place-items-center rounded-full bg-surface-3 text-fg">
                  <n.icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium text-fg">{n.label}</span>
                  <span className="block truncate text-xs text-fg-2">{n.hint}</span>
                </span>
                <ChevronRight size={16} className="text-muted" />
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <nav aria-label="Sezioni" className="flex items-center gap-1.5 rounded-full bg-dock p-1.5 shadow-[0_18px_40px_-16px_rgb(0_0_0/0.45)]">
        {items.map((it) => (
          <button
            key={it.id}
            onClick={it.onClick}
            aria-current={it.active ? 'page' : undefined}
            aria-label={it.label}
            aria-expanded={it.id === 'more' ? more : undefined}
            className={cx('relative flex h-12 items-center justify-center rounded-full transition-colors', it.active ? 'px-5' : 'w-12 bg-dock-btn text-dock-fg hover:brightness-125')}
          >
            {it.active && <motion.span layoutId="dock-active" className="absolute inset-0 rounded-full bg-white" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
            <span className={cx('relative flex items-center gap-2', it.active && 'text-[#1b1b1a]')}>
              <it.icon size={19} strokeWidth={1.9} />
              {it.active && <span className="text-[15px] font-medium whitespace-nowrap">{it.label}</span>}
            </span>
          </button>
        ))}
      </nav>
    </div>
  )
}

function TopBar({ onSearch }: { onSearch: () => void }) {
  const go = useFinny((s) => s.go)
  const aiReady = useAiReady()
  return (
    <header className="mx-auto flex w-full max-w-[1120px] items-center justify-between px-4 pt-[calc(14px+env(safe-area-inset-top,0px))] sm:px-6 lg:px-8">
      <button onClick={() => go('home')} className="flex items-center gap-2" aria-label="Finny, torna alla panoramica">
        <Mark size={30} />
        <span className="leading-none">
          <span className="figure block text-[19px] text-fg">Finny</span>
          <span className="block text-[10px] font-medium tracking-[0.12em] text-muted uppercase">by vocina</span>
        </span>
      </button>
      <div className="flex items-center gap-2">
        {aiReady && (
          <IconButton label="Chiedi a Finny" onClick={() => go('chiedi')}>
            <Sparkles size={18} />
          </IconButton>
        )}
        <IconButton label="Cerca (⌘K)" onClick={onSearch}>
          <Search size={19} />
        </IconButton>
        <IconButton label="Importa un estratto conto" onClick={() => go('importa')}>
          <Plus size={20} />
        </IconButton>
      </div>
    </header>
  )
}

function Palette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const go = useFinny((s) => s.go)
  const txs = useFinny((s) => s.transactions)
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const pages = NAV.filter((n) => !needle || n.label.toLowerCase().includes(needle)).map((n) => ({
      key: n.id,
      icon: n.icon,
      label: n.label,
      hint: 'Vai',
      run: () => go(n.id),
    }))
    const merchants = needle.length > 1
      ? [...new Map(txs.filter((t) => t.merchant.toLowerCase().includes(needle)).map((t) => [t.merchant, t])).values()].slice(0, 6).map((t) => ({
          key: `m-${t.merchant}`,
          icon: ListOrdered,
          label: t.merchant,
          hint: money(txs.filter((x) => x.merchant === t.merchant).reduce((a, x) => a + x.amount, 0), { round: true }),
          run: () => {
            useUi.getState().setCategory('all')
            useUi.getState().setSearch(t.merchant)
            go('movimenti')
          },
        }))
      : []
    return [...pages, ...merchants]
  }, [q, txs, go])

  useEffect(() => {
    if (open) {
      setQ('')
      setIdx(0)
      setTimeout(() => input.current?.focus(), 30)
    }
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-label="Cerca"
            initial={{ y: -16, scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: -10, scale: 0.98, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="relative w-full max-w-lg overflow-hidden rounded-[28px] bg-surface shadow-[0_30px_80px_-24px_rgb(0_0_0/0.4)]"
          >
            <div className="flex items-center gap-2 px-5">
              <Search size={17} className="text-muted" />
              <input
                id="palette-q"
                ref={input}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value)
                  setIdx(0)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') setIdx((i) => Math.min(results.length - 1, i + 1))
                  if (e.key === 'ArrowUp') setIdx((i) => Math.max(0, i - 1))
                  if (e.key === 'Enter' && results[idx]) {
                    results[idx].run()
                    onClose()
                  }
                  if (e.key === 'Escape') onClose()
                }}
                placeholder="Cerca un esercente o una sezione"
                className="h-14 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-muted"
              />
            </div>
            <ul className="scroll-thin max-h-[50vh] overflow-auto border-t border-line p-2">
              {results.map((r, i) => (
                <li key={r.key}>
                  <button
                    onMouseEnter={() => setIdx(i)}
                    onClick={() => {
                      r.run()
                      onClose()
                    }}
                    className={cx('flex w-full items-center gap-3 rounded-[18px] px-3 py-2.5 text-left text-[15px]', i === idx ? 'bg-surface-2 text-fg' : 'text-fg-2')}
                  >
                    <span className={cx('grid size-9 place-items-center rounded-full', i === idx ? 'bg-ink text-ink-fg' : 'bg-surface-3 text-fg-2')}>
                      <r.icon size={16} />
                    </span>
                    <span className="flex-1 truncate">{r.label}</span>
                    <span className="text-xs text-muted tabular-nums">{r.hint}</span>
                  </button>
                </li>
              ))}
              {!results.length && <li className="px-3 py-6 text-center text-sm text-muted">Nessun risultato per “{q}”.</li>}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function Shell({ children }: { children: ReactNode }) {
  const [palette, setPalette] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div className="min-h-dvh">
      <TopBar onSearch={() => setPalette(true)} />
      <main className="mx-auto w-full max-w-[1120px] px-4 pt-5 pb-[calc(120px+env(safe-area-inset-bottom,0px))] sm:px-6 lg:px-8 lg:pt-8">{children}</main>
      <footer className="mx-auto flex max-w-[1120px] items-center gap-2 px-4 pb-[calc(100px+env(safe-area-inset-bottom,0px))] text-xs text-muted sm:px-6 lg:px-8">
        <Mark size={14} animate={false} /> Finny by vocina · i tuoi dati restano in questo browser, salvo ciò che chiedi all'assistente AI se lo attivi
      </footer>
      <Dock />
      <Palette open={palette} onClose={() => setPalette(false)} />
    </div>
  )
}
