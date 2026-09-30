import { animate, motion, useMotionValue, useReducedMotion, useSpring, type HTMLMotionProps } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { category } from '../../lib/categories'
import { money } from '../../lib/format'
import type { CategoryId } from '../../lib/types'

export function cx(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(' ')
}

/** A card whose border and wash light up under the pointer */
export function Card({ className, children, tilt = false, ...rest }: HTMLMotionProps<'div'> & { tilt?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const rx = useSpring(0, { stiffness: 180, damping: 20 })
  const ry = useSpring(0, { stiffness: 180, damping: 20 })
  return (
    <motion.div
      ref={ref}
      className={cx('card', className)}
      style={tilt && !reduce ? { rotateX: rx, rotateY: ry, transformPerspective: 1100 } : undefined}
      onPointerMove={(e) => {
        const el = ref.current
        if (!el) return
        const r = el.getBoundingClientRect()
        el.style.setProperty('--mx', `${e.clientX - r.left}px`)
        el.style.setProperty('--my', `${e.clientY - r.top}px`)
        if (tilt && !reduce) {
          rx.set(((e.clientY - r.top) / r.height - 0.5) * -5)
          ry.set(((e.clientX - r.left) / r.width - 0.5) * 7)
        }
      }}
      onPointerLeave={() => {
        ref.current?.style.setProperty('--mx', '-999px')
        ref.current?.style.setProperty('--my', '-999px')
        rx.set(0)
        ry.set(0)
      }}
      {...rest}
    >
      {children as ReactNode}
    </motion.div>
  )
}

/** Counts up to the value with a spring, and keeps easing when the value changes */
export function AnimatedNumber({
  value,
  format = (n) => money(n),
  className,
  duration = 1.1,
}: {
  value: number
  format?: (n: number) => string
  className?: string
  duration?: number
}) {
  const reduce = useReducedMotion()
  const mv = useMotionValue(reduce ? value : 0)
  const [text, setText] = useState(format(reduce ? value : 0))
  useEffect(() => {
    if (reduce) {
      setText(format(value))
      return
    }
    const controls = animate(mv, value, { duration, ease: [0.16, 1, 0.3, 1] })
    const unsub = mv.on('change', (v) => setText(format(v)))
    return () => {
      controls.stop()
      unsub()
    }
    // format is usually an inline arrow; re-running on it would restart the count
  }, [value, reduce, duration])
  return <span className={cx('tabular-nums', className)}>{text}</span>
}

export function CategoryIcon({ id, size = 36 }: { id: CategoryId; size?: number }) {
  const c = category(id)
  const Icon = c.icon
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[12px] border border-line"
      style={{
        width: size,
        height: size,
        background: `color-mix(in oklab, hsl(${c.hue} 55% 50%) 16%, var(--surface-2))`,
        color: `color-mix(in oklab, hsl(${c.hue} 60% 62%) 80%, var(--fg))`,
      }}
      aria-hidden
    >
      <Icon size={size * 0.46} strokeWidth={1.8} />
    </span>
  )
}

/** Primary / secondary / ghost button with a magnetic pull on pointer devices */
export function Button({
  variant = 'primary',
  className,
  children,
  magnetic = variant === 'primary',
  ...rest
}: HTMLMotionProps<'button'> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; magnetic?: boolean }) {
  const x = useSpring(0, { stiffness: 250, damping: 15 })
  const y = useSpring(0, { stiffness: 250, damping: 15 })
  const reduce = useReducedMotion()
  const styles = {
    primary: 'sheen bg-accent text-accent-ink font-semibold shadow-[0_10px_30px_-10px_var(--accent)]',
    secondary: 'bg-surface-3 text-fg border border-line-strong hover:border-accent/60',
    ghost: 'text-fg-2 hover:text-fg hover:bg-surface-3',
    danger: 'bg-critical/15 text-critical-text border border-critical/40 hover:bg-critical/25',
  }[variant]
  return (
    <motion.button
      style={magnetic && !reduce ? { x, y } : undefined}
      whileTap={{ scale: 0.96 }}
      onPointerMove={(e) => {
        if (!magnetic || reduce || e.pointerType !== 'mouse') return
        const r = e.currentTarget.getBoundingClientRect()
        x.set((e.clientX - r.left - r.width / 2) * 0.18)
        y.set((e.clientY - r.top - r.height / 2) * 0.28)
      }}
      onPointerLeave={() => {
        x.set(0)
        y.set(0)
      }}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        styles,
        className,
      )}
      {...rest}
    >
      {children as ReactNode}
    </motion.button>
  )
}

/** Segmented control; the active pill slides between options */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  id,
  size = 'md',
}: {
  options: { value: T; label: ReactNode }[]
  value: T
  onChange: (v: T) => void
  id: string
  size?: 'sm' | 'md'
}) {
  return (
    <div role="tablist" className="inline-flex rounded-full border border-line bg-surface p-1">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cx(
              'relative rounded-full font-medium transition-colors',
              size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm',
              active ? 'text-accent-ink' : 'text-fg-2 hover:text-fg',
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-full bg-accent"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export function Delta({ value, goodWhenUp = true, suffix = '' }: { value: number; goodWhenUp?: boolean; suffix?: string }) {
  if (!Number.isFinite(value)) return null
  const up = value > 0
  const good = up === goodWhenUp
  const flat = Math.abs(value) < 0.005
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
        flat ? 'bg-surface-3 text-fg-2' : good ? 'bg-good/15 text-good-text' : 'bg-critical/15 text-critical-text',
      )}
    >
      <span aria-hidden>{flat ? '→' : up ? '↑' : '↓'}</span>
      {Math.abs(value * 100).toFixed(0)}%{suffix}
    </span>
  )
}

/** Staggered entrance for a list of children */
export const stagger = {
  container: {
    hidden: {},
    show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
  },
  item: {
    hidden: { opacity: 0, y: 18, filter: 'blur(6px)' },
    show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { type: 'spring' as const, stiffness: 260, damping: 26 } },
  },
}

export function SectionTitle({ eyebrow, title, action }: { eyebrow?: string; title: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h2 className="text-lg font-semibold text-fg sm:text-xl">{title}</h2>
      </div>
      {action}
    </div>
  )
}
