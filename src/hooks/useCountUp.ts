import { useEffect, useRef, useState } from 'react'

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/**
 * Animates from 0 to `target` over `duration` ms using requestAnimationFrame.
 * Pass `active: true` to trigger the animation (default true).
 */
export function useCountUp(
  target: number,
  duration = 1200,
  options: { active?: boolean; decimals?: number; delay?: number } = {}
): number {
  const { active = true, decimals = 0, delay = 0 } = options
  const [value, setValue] = useState(0)
  const startRef = useRef<number | null>(null)
  const rafRef   = useRef<number | null>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    if (!active) return
    if (startedRef.current) return
    startedRef.current = true

    const run = (t: number) => {
      const delayedStart = startRef.current! + delay
      if (t < delayedStart) { rafRef.current = requestAnimationFrame(run); return }
      const elapsed = t - delayedStart
      const progress = Math.min(elapsed / duration, 1)
      const eased = easeOutCubic(progress)
      const factor = Math.pow(10, decimals)
      setValue(Math.round(eased * target * factor) / factor)
      if (progress < 1) rafRef.current = requestAnimationFrame(run)
    }

    rafRef.current = requestAnimationFrame((t) => {
      startRef.current = t
      rafRef.current = requestAnimationFrame(run)
    })

    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [active, target, duration, decimals, delay])

  return active ? value : target
}
