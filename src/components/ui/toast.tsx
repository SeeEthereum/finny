import { CheckCircle2, Info, OctagonAlert } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { create } from 'zustand'

type Kind = 'success' | 'info' | 'error'
interface Toast {
  id: number
  kind: Kind
  text: string
}

const useToasts = create<{ items: Toast[] }>(() => ({ items: [] }))
let seq = 0

export function toast(text: string, kind: Kind = 'success') {
  const id = ++seq
  useToasts.setState((s) => ({ items: [...s.items, { id, kind, text }] }))
  setTimeout(() => useToasts.setState((s) => ({ items: s.items.filter((t) => t.id !== id) })), 4200)
}

const ICON = { success: CheckCircle2, info: Info, error: OctagonAlert }
const COLOR = { success: 'var(--good)', info: 'var(--series-1)', error: 'var(--critical)' }

export function Toaster() {
  const items = useToasts((s) => s.items)
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(88px+env(safe-area-inset-bottom,0px))] z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
      <AnimatePresence>
        {items.map((t) => {
          const Icon = ICON[t.kind]
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 24, scale: 0.9, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              className="pointer-events-auto flex max-w-md items-center gap-2.5 rounded-full border border-line-strong bg-surface/95 px-4 py-2.5 text-sm text-fg shadow-2xl backdrop-blur"
            >
              <Icon size={16} style={{ color: COLOR[t.kind] }} aria-hidden />
              {t.text}
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
