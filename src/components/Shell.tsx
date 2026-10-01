import {
  ChartPie, Command, FileUp, Home, Landmark, ListOrdered, MessageCircle, Monitor, Moon, Repeat, Search, Settings, Sun, Target,
  type LucideIcon,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { money } from '../lib/format'
import type { View } from '../lib/insights'
import { useUi } from '../store/ui'
import { useFinny } from '../store/useFinny'
import { Mark, Wordmark } from './ui/Brand'
import { cx } from './ui/primitives'

export const NAV: { id: View; label: string; icon: LucideIcon; mobile?: boolean }[] = [
  { id: 'home', label: 'Panoramica', icon: Home, mobile: true },
  { id: 'movimenti', label: 'Movimenti', icon: ListOrdered, mobile: true },
  { id: 'analisi', label: 'Analisi', icon: ChartPie, mobile: true },
  { id: 'chiedi', label: 'Chiedi', icon: MessageCircle, mobile: true },
  { id: 'abbonamenti', label: 'Ricorrenti', icon: Repeat },
  { id: 'budget', label: 'Budget', icon: Target },
  { id: 'importa', label: 'Importa', icon: FileUp, mobile: true },
  { id: 'collega', label: 'Collega conto', icon: Landmark },
  { id: 'impostazioni', label: 'Impostazioni', icon: Settings },
]

type Theme = 'system' | 'light' | 'dark'

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem('finny:theme') as Theme) || 'system'
    } catch {
      return 'system'
    }
  })
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    try {
      localStorage.setItem('finny:theme', theme)
    } catch {
      /* remembered only for this visit */
    }
  }, [theme])
  return [theme, setTheme] as const
}

function ThemeSwitch() {
  const [theme, setTheme] = useTheme()
  const opts: { v: Theme; icon: LucideIcon; label: string }[] = [
    { v: 'light', icon: Sun, label: 'Tema chiaro' },
    { v: 'system', icon: Monitor, label: 'Tema di sistema' },
    { v: 'dark', icon: Moon, label: 'Tema scuro' },
  ]
  return (
    <div className="inline-flex rounded-full border border-line bg-surface p-0.5">
      {opts.map((o) => (
        <button
          key={o.v}
          aria-label={o.label}
          aria-pressed={theme === o.v}
          onClick={() => setTheme(o.v)}
          className={cx('relative grid size-7 place-items-center rounded-full', theme === o.v ? 'text-accent-ink' : 'text-muted hover:text-fg')}
        >
          {theme === o.v && <motion.span layoutId="theme-pill" className="absolute inset-0 rounded-full bg-accent" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />}
          <o.icon size={14} className="relative" />
        </button>
      ))}
    </div>
  )
}

function Sidebar({ onSearch }: { onSearch: () => void }) {
  const view = useFinny((s) => s.view)
  const go = useFinny((s) => s.go)
  const isDemo = useFinny((s) => s.isDemo)
  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-line bg-bg/60 px-4 py-6 backdrop-blur-xl lg:flex">
      <div className="px-2">
        <Wordmark />
      </div>
      <button
        onClick={onSearch}
        className="mt-8 flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-muted transition-colors hover:border-line-strong hover:text-fg-2"
      >
        <Search size={15} />
        Cerca o vai a…
        <kbd className="ml-auto inline-flex items-center gap-0.5 rounded-md border border-line px-1.5 font-mono text-[10px]">
          <Command size={10} />K
        </kbd>
      </button>
      <nav className="mt-6 flex flex-col gap-0.5" aria-label="Sezioni">
        {NAV.map((n) => {
          const active = view === n.id
          return (
            <button
              key={n.id}
              onClick={() => go(n.id)}
              aria-current={active ? 'page' : undefined}
              className={cx('relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors', active ? 'text-fg' : 'text-fg-2 hover:text-fg')}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-xl border border-line-strong bg-surface-2"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
              <n.icon size={17} className={cx('relative', active && 'text-accent')} />
              <span className="relative">{n.label}</span>
            </button>
          )
        })}
      </nav>
      <div className="mt-auto space-y-4 px-2">
        {isDemo && (
          <div className="rounded-2xl border border-accent/30 bg-accent-soft p-3 text-xs text-fg-2">
            <div className="font-semibold text-fg">Stai guardando dati di esempio</div>
            <p className="mt-1">Importa un estratto conto per vedere i tuoi. Resta tutto nel browser.</p>
            <button onClick={() => go('importa')} className="mt-2 font-semibold text-accent">
              Importa ora →
            </button>
          </div>
        )}
        <ThemeSwitch />
      </div>
    </aside>
  )
}

function MobileBar() {
  const view = useFinny((s) => s.view)
  const go = useFinny((s) => s.go)
  return (
    <nav
      aria-label="Sezioni"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/85 px-2 pt-1.5 pb-[calc(6px+env(safe-area-inset-bottom,0px))] backdrop-blur-xl lg:hidden"
    >
      <div className="mx-auto flex max-w-md justify-between">
        {NAV.filter((n) => n.mobile).map((n) => {
          const active = view === n.id
          return (
            <button key={n.id} onClick={() => go(n.id)} aria-current={active ? 'page' : undefined} className="relative flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10.5px] font-medium">
              {active && <motion.span layoutId="mob-active" className="absolute top-0 h-[3px] w-8 rounded-full bg-accent" />}
              <n.icon size={20} className={active ? 'text-accent' : 'text-muted'} />
              <span className={active ? 'text-fg' : 'text-muted'}>{n.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function MobileTop({ onSearch }: { onSearch: () => void }) {
  const go = useFinny((s) => s.go)
  return (
    <header className="sticky top-[env(safe-area-inset-top,0px)] z-30 flex items-center justify-between border-b border-line bg-bg/75 px-4 py-3 backdrop-blur-xl lg:hidden">
      <Wordmark />
      <div className="flex items-center gap-1">
        <button aria-label="Cerca" onClick={onSearch} className="grid size-9 place-items-center rounded-full text-fg-2 hover:bg-surface-3">
          <Search size={18} />
        </button>
        <button aria-label="Impostazioni" onClick={() => go('impostazioni')} className="grid size-9 place-items-center rounded-full text-fg-2 hover:bg-surface-3">
          <Settings size={18} />
        </button>
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
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-label="Cerca"
            initial={{ y: -20, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: -10, scale: 0.98, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b border-line px-4">
              <Search size={16} className="text-muted" />
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
                className="h-12 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-muted"
              />
            </div>
            <ul className="scroll-thin max-h-[50vh] overflow-auto p-2">
              {results.map((r, i) => (
                <li key={r.key}>
                  <button
                    onMouseEnter={() => setIdx(i)}
                    onClick={() => {
                      r.run()
                      onClose()
                    }}
                    className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm', i === idx ? 'bg-surface-3 text-fg' : 'text-fg-2')}
                  >
                    <r.icon size={16} className={i === idx ? 'text-accent' : 'text-muted'} />
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
    <div className="flex min-h-dvh">
      <Sidebar onSearch={() => setPalette(true)} />
      <div className="min-w-0 flex-1">
        <MobileTop onSearch={() => setPalette(true)} />
        <main className="mx-auto w-full max-w-[1180px] px-4 pt-6 pb-[calc(110px+env(safe-area-inset-bottom,0px))] sm:px-6 lg:px-10 lg:pt-10 lg:pb-16">{children}</main>
        <footer className="mx-auto hidden max-w-[1180px] items-center gap-2 px-10 pb-8 text-xs text-muted lg:flex">
          <Mark size={16} animate={false} /> Finny by vocina · i tuoi dati restano in questo browser, salvo ciò che chiedi all'assistente AI se lo attivi
        </footer>
      </div>
      <MobileBar />
      <Palette open={palette} onClose={() => setPalette(false)} />
    </div>
  )
}
