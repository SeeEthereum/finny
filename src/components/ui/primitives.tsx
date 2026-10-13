import { animate, motion, useMotionValue, useReducedMotion, useSpring, type HTMLMotionProps } from 'motion/react'
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { category } from '../../lib/categories'
import { money } from '../../lib/format'
import type { CategoryId } from '../../lib/types'

export function cx(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(' ')
}

/** White card with a large radius: the basic surface of the app */
export function Card({ className, children, ...rest }: HTMLMotionProps<'div'>) {
  return (
    <motion.div className={cx('card', className)} {...rest}>
      {children as ReactNode}
    </motion.div>
  )
}

function useCountUp(value: number, duration: number) {
  const reduce = useReducedMotion()
  const mv = useMotionValue(reduce ? value : 0)
  const [current, setCurrent] = useState(reduce ? value : 0)
  useEffect(() => {
    if (reduce) {
      setCurrent(value)
      return
    }
    const controls = animate(mv, value, { duration, ease: [0.16, 1, 0.3, 1] })
    const unsub = mv.on('change', setCurrent)
    return () => {
      controls.stop()
      unsub()
    }
  }, [value, reduce, duration, mv])
  return current
}

/** Counts up to the value, and keeps easing when the value changes */
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
  const current = useCountUp(value, duration)
  return <span className={cx('tabular-nums', className)}>{format(current)}</span>
}

const eurParts = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * The headline figure: "1.273" big, ",45 €" small and quiet, an optional unit after it
 * ("/ mese"). Counts up on first render.
 */
export function BigMoney({
  value,
  unit,
  size = 'xl',
  duration = 1.4,
  className,
}: {
  value: number
  unit?: string
  size?: 'md' | 'lg' | 'xl'
  duration?: number
  className?: string
}) {
  const current = useCountUp(value, duration)
  const text = eurParts.format(Math.abs(current) < 0.005 ? 0 : current)
  const [int, dec] = text.split(',')
  const big = { md: 'text-[34px]', lg: 'text-[46px]', xl: 'text-[56px] sm:text-[68px]' }[size]
  const small = { md: 'text-[18px]', lg: 'text-[22px]', xl: 'text-[24px] sm:text-[28px]' }[size]
  return (
    <span className={cx('figure inline-flex items-baseline leading-none whitespace-nowrap text-fg', className)}>
      <span className={big}>{int}</span>
      <span className={cx(small, 'text-muted')}>
        ,{dec} €{unit && <span className="ml-1.5 font-medium">{unit}</span>}
      </span>
    </span>
  )
}

const AVATAR_COLORS = ['#262625', '#4d7a80', '#4f9466', '#4a6bd1', '#c0674c', '#8565bd', '#b3842f', '#5f6670', '#a14f6e']

function initials(name: string) {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  if (words.length === 1) {
    const w = words[0]
    return w.length <= 3 && w === w.toUpperCase() ? w : w[0].toUpperCase() + (w[1] ?? '').toLowerCase()
  }
  return (words[0][0] + words[1][0]).toUpperCase()
}

function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Circular avatar with initials, colored by name so the same merchant always looks the same */
export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const label = initials(name)
  return (
    <span
      aria-hidden
      className="figure grid shrink-0 place-items-center rounded-full text-white"
      style={{ width: size, height: size, background: AVATAR_COLORS[hash(name) % AVATAR_COLORS.length], fontSize: size * (label.length > 2 ? 0.28 : 0.34) }}
    >
      {label}
    </span>
  )
}

export function CategoryIcon({ id, size = 40 }: { id: CategoryId; size?: number }) {
  const c = category(id)
  const Icon = c.icon
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full"
      style={{
        width: size,
        height: size,
        background: `color-mix(in oklab, hsl(${c.hue} 55% 55%) 13%, var(--surface-2))`,
        color: `color-mix(in oklab, hsl(${c.hue} 50% 42%) 75%, var(--fg))`,
      }}
      aria-hidden
    >
      <Icon size={size * 0.44} strokeWidth={1.9} />
    </span>
  )
}

/** Near-black pill for the main action, gray pill for the alternative */
export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  magnetic = variant === 'primary',
  ...rest
}: HTMLMotionProps<'button'> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent'; size?: 'sm' | 'md' | 'lg'; magnetic?: boolean }) {
  const x = useSpring(0, { stiffness: 250, damping: 18 })
  const y = useSpring(0, { stiffness: 250, damping: 18 })
  const reduce = useReducedMotion()
  const styles = {
    primary: 'bg-ink text-ink-fg font-semibold hover:opacity-90',
    secondary: 'bg-surface-3 text-fg font-medium hover:bg-line-strong',
    ghost: 'text-fg-2 font-medium hover:text-fg hover:bg-surface-3',
    danger: 'border border-accent/60 text-accent font-semibold hover:bg-accent-soft',
    accent: 'bg-accent text-accent-ink font-semibold hover:opacity-90',
  }[variant]
  const sizes = { sm: 'h-9 px-4 text-sm', md: 'h-11 px-5 text-[15px]', lg: 'h-14 px-7 text-base' }[size]
  return (
    <motion.button
      style={magnetic && !reduce ? { x, y } : undefined}
      whileTap={{ scale: 0.97 }}
      onPointerMove={(e) => {
        if (!magnetic || reduce || e.pointerType !== 'mouse') return
        const r = e.currentTarget.getBoundingClientRect()
        x.set((e.clientX - r.left - r.width / 2) * 0.12)
        y.set((e.clientY - r.top - r.height / 2) * 0.2)
      }}
      onPointerLeave={() => {
        x.set(0)
        y.set(0)
      }}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-full transition-[background,opacity,color] disabled:cursor-not-allowed disabled:opacity-40',
        sizes,
        styles,
        className,
      )}
      {...rest}
    >
      {children as ReactNode}
    </motion.button>
  )
}

/** Round white button for header actions (search, add, back) */
export function IconButton({ label, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cx('grid size-11 shrink-0 place-items-center rounded-full bg-surface text-fg shadow-[var(--shadow)] transition-transform hover:scale-105 active:scale-95', className)}
      {...rest}
    >
      {children}
    </button>
  )
}

/** Pill tag: black when active, white otherwise; "flag" is the coral outline used for things to check */
export function Chip({
  children,
  active,
  tone = 'default',
  onClick,
  className,
}: {
  children: ReactNode
  active?: boolean
  tone?: 'default' | 'flag' | 'muted'
  onClick?: () => void
  className?: string
}) {
  const look =
    tone === 'flag'
      ? 'border border-accent text-accent-text bg-transparent'
      : tone === 'muted'
        ? 'bg-surface-3 text-fg-2'
        : active
          ? 'bg-ink text-ink-fg'
          : 'bg-surface text-fg shadow-[var(--shadow)] hover:bg-surface-2'
  const Tag = onClick ? 'button' : 'span'
  return (
    <Tag onClick={onClick} className={cx('inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors', look, className)}>
      {children}
    </Tag>
  )
}

/** Segmented control on a gray track; the white pill slides to the active option */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  id,
  size = 'md',
  stretch = false,
}: {
  options: { value: T; label: ReactNode; count?: number }[]
  value: T
  onChange: (v: T) => void
  id: string
  size?: 'sm' | 'md'
  stretch?: boolean
}) {
  return (
    <div role="tablist" className={cx('rounded-full bg-track p-1', stretch ? 'flex w-full' : 'inline-flex')}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cx(
              'relative rounded-full font-medium whitespace-nowrap transition-colors',
              stretch && 'flex-1',
              size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-2 text-sm',
              active ? 'text-fg' : 'text-fg-2 hover:text-fg',
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-full bg-surface shadow-[0_1px_3px_rgb(0_0_0/0.08)]"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative">
              {o.label}
              {o.count != null && <span className="ml-1.5 text-muted tabular-nums">{o.count}</span>}
            </span>
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
    <span className={cx('inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums', flat ? 'text-fg-2' : good ? 'text-good-text' : 'text-critical-text')}>
      <span aria-hidden>{flat ? '→' : up ? '↑' : '↓'}</span>
      {Math.abs(value * 100).toFixed(0)}%{suffix}
    </span>
  )
}

/** Staggered entrance for a list of children */
export const stagger = {
  container: {
    hidden: {},
    show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
  },
  item: {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 28 } },
  },
}

export function SectionTitle({ eyebrow, title, action }: { eyebrow?: string; title: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h2 className="text-[19px] text-fg">{title}</h2>
      </div>
      {action}
    </div>
  )
}
