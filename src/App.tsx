import { AnimatePresence, motion, MotionConfig } from 'motion/react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { Shell } from './components/Shell'
import { Ambient } from './components/ui/Ambient'
import { Mark } from './components/ui/Brand'
import { Toaster } from './components/ui/toast'
import Home from './pages/Home'
import { useAi } from './store/ai'
import { useFinny } from './store/useFinny'

const Movimenti = lazy(() => import('./pages/Movimenti'))
const Analisi = lazy(() => import('./pages/Analisi'))
const Abbonamenti = lazy(() => import('./pages/Abbonamenti'))
const Budget = lazy(() => import('./pages/Budget'))
const Importa = lazy(() => import('./pages/Importa'))
const Collega = lazy(() => import('./pages/Collega'))
const Chiedi = lazy(() => import('./pages/Chiedi'))
const Impostazioni = lazy(() => import('./pages/Impostazioni'))

const PAGES = { home: Home, movimenti: Movimenti, analisi: Analisi, chiedi: Chiedi, abbonamenti: Abbonamenti, budget: Budget, importa: Importa, collega: Collega, impostazioni: Impostazioni }

/** Brand intro: the mark draws itself, then lifts away. Short, and it never blocks content for long. */
function Intro({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDone, 1250)
    return () => clearTimeout(id)
  }, [onDone])
  return (
    <motion.div
      className="fixed inset-0 z-[80] grid place-items-center bg-bg"
      exit={{ opacity: 0, filter: 'blur(12px)', scale: 1.04 }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      onClick={onDone}
    >
      <div className="flex flex-col items-center">
        <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 160, damping: 14 }}>
          <Mark size={76} />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12, letterSpacing: '0.2em' }} animate={{ opacity: 1, y: 0, letterSpacing: '-0.04em' }} transition={{ delay: 0.35, duration: 0.7, ease: [0.16, 1, 0.3, 1] }} className="mt-5 font-display text-4xl font-bold text-fg">
          Finny
        </motion.div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="mt-2 font-mono text-[11px] tracking-[0.2em] text-muted uppercase">
          by vocina
        </motion.div>
      </div>
    </motion.div>
  )
}

export default function App() {
  const view = useFinny((s) => s.view)
  const load = useFinny((s) => s.load)
  const [intro, setIntro] = useState(() => {
    try {
      return !sessionStorage.getItem('finny:intro')
    } catch {
      return true
    }
  })
  useEffect(() => {
    void load()
    void useAi.getState().load()
  }, [load])
  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.slice(1)
      if (h in PAGES && h !== useFinny.getState().view) useFinny.getState().go(h as keyof typeof PAGES)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const Page = PAGES[view] ?? Home

  return (
    <MotionConfig reducedMotion="user">
      <div className="grain">
        <Ambient />
        <Shell>
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 16, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -10, filter: 'blur(6px)' }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <Suspense fallback={<div className="h-[60vh]" />}>
                <Page />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </Shell>
        <Toaster />
        <AnimatePresence>
          {intro && (
            <Intro
              onDone={() => {
                setIntro(false)
                try {
                  sessionStorage.setItem('finny:intro', '1')
                } catch {
                  /* the intro may play again, that's fine */
                }
              }}
            />
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  )
}
