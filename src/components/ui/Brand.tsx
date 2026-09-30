import { motion, useReducedMotion } from 'motion/react'
import { useId } from 'react'

/**
 * Finny's mark: a speech bubble with an F,
 * because the product is a little voice (vocina) that talks about money.
 */
export function Mark({ size = 34, animate = true }: { size?: number; animate?: boolean }) {
  const reduce = useReducedMotion()
  const draw = animate && !reduce
  // unique per instance: a gradient defined inside a hidden copy of the logo would not paint
  const grad = `finny-brass-${useId().replace(/:/g, '')}`
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden>
      <defs>
        <linearGradient id={grad} x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--accent-2)" />
          <stop offset="1" stopColor="var(--accent)" />
        </linearGradient>
      </defs>
      <motion.path
        d="M20 4.5c8.6 0 15.5 6.6 15.5 14.8S28.6 34 20 34c-1.9 0-3.7-.3-5.4-.9L7 35.5l2.2-6.3C6.3 26.6 4.5 23.1 4.5 19.3 4.5 11.1 11.4 4.5 20 4.5Z"
        stroke={`url(#${grad})`}
        strokeWidth="2.4"
        strokeLinejoin="round"
        fill="var(--accent-soft)"
        initial={draw ? { pathLength: 0, opacity: 0 } : false}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.1, ease: [0.65, 0, 0.35, 1] }}
      />
      <motion.path
        d="M16.5 25V13.8h8.2M16.5 19.3h6.4"
        stroke={`url(#${grad})`}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={draw ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.7, delay: 0.6, ease: 'easeOut' }}
      />
    </svg>
  )
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <Mark />
      {!compact && (
        <div className="leading-none">
          <div className="font-display text-[22px] font-bold tracking-[-0.04em] text-fg">Finny</div>
          <div className="mt-1 font-mono text-[10px] tracking-[0.18em] text-muted uppercase">by vocina</div>
        </div>
      )}
    </div>
  )
}
