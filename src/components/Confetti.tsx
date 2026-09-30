import { useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'

/** A short burst of brass and teal flakes, drawn on a canvas and gone in ~2s */
export function Confetti({ fire }: { fire: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const reduce = useReducedMotion()
  useEffect(() => {
    if (!fire || reduce) return
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const w = (canvas.width = window.innerWidth)
    const h = (canvas.height = window.innerHeight)
    const s = getComputedStyle(document.documentElement)
    const colors = ['--accent', '--accent-2', '--series-1', '--series-3'].map((t) => s.getPropertyValue(t).trim())
    const parts = Array.from({ length: 140 }, () => ({
      x: w / 2 + (Math.random() - 0.5) * 120,
      y: h * 0.42,
      vx: (Math.random() - 0.5) * 16,
      vy: -Math.random() * 15 - 5,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      size: 5 + Math.random() * 7,
      color: colors[Math.floor(Math.random() * colors.length)],
    }))
    let raf = 0
    const start = performance.now()
    const tick = (t: number) => {
      const life = (t - start) / 2200
      ctx.clearRect(0, 0, w, h)
      for (const p of parts) {
        p.vy += 0.42
        p.vx *= 0.985
        p.x += p.vx
        p.y += p.vy
        p.r += p.vr
        ctx.save()
        ctx.globalAlpha = Math.max(0, 1 - life)
        ctx.translate(p.x, p.y)
        ctx.rotate(p.r)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        ctx.restore()
      }
      if (life < 1) raf = requestAnimationFrame(tick)
      else ctx.clearRect(0, 0, w, h)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [fire, reduce])
  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[70]" />
}
