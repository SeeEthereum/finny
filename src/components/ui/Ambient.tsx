import { useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'

/**
 * Slow-drifting light behind the app: three soft glows (brass, teal, violet)
 * painted on a canvas. Colors come from CSS tokens so both themes work.
 */
export function Ambient() {
  const ref = useRef<HTMLCanvasElement>(null)
  const reduce = useReducedMotion()

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    let raf = 0
    let w = 0
    let h = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    const resize = () => {
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const tokens = () => {
      const s = getComputedStyle(document.documentElement)
      return ['--glow-a', '--glow-b', '--glow-c'].map((t) => s.getPropertyValue(t).trim() || 'transparent')
    }
    let colors = tokens()
    const mo = new MutationObserver(() => (colors = tokens()))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onScheme = () => (colors = tokens())
    mq.addEventListener('change', onScheme)

    const blobs = [
      { x: 0.18, y: 0.12, r: 0.55, sx: 0.00011, sy: 0.00007, p: 0 },
      { x: 0.85, y: 0.3, r: 0.5, sx: 0.00008, sy: 0.00012, p: 2 },
      { x: 0.55, y: 0.95, r: 0.6, sx: 0.00006, sy: 0.00009, p: 4 },
    ]
    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'lighter'
      blobs.forEach((b, i) => {
        const x = (b.x + Math.sin(t * b.sx + b.p) * 0.12) * w
        const y = (b.y + Math.cos(t * b.sy + b.p) * 0.1) * h
        const r = b.r * Math.max(w, h)
        const g = ctx.createRadialGradient(x, y, 0, x, y, r)
        g.addColorStop(0, colors[i])
        g.addColorStop(1, 'transparent')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, w, h)
      })
      ctx.globalCompositeOperation = 'source-over'
    }
    if (reduce) draw(0)
    else {
      const loop = (t: number) => {
        draw(t)
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
    }
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      mq.removeEventListener('change', onScheme)
      mo.disconnect()
    }
  }, [reduce])

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 -z-10 h-full w-full" />
}
