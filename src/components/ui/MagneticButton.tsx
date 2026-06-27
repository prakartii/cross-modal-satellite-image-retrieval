import { useRef, type ComponentPropsWithoutRef } from 'react'

interface MagneticButtonProps extends ComponentPropsWithoutRef<'button'> {
  strength?: number
}

/**
 * Wraps a <button> and applies a subtle magnetic pull toward the cursor.
 * The button body shifts toward the mouse; on leave it springs back.
 */
export default function MagneticButton({
  strength = 0.28,
  children,
  style,
  onMouseMove,
  onMouseLeave,
  ...props
}: MagneticButtonProps) {
  const ref = useRef<HTMLButtonElement>(null)

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    onMouseMove?.(e)
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const dx = (e.clientX - (rect.left + rect.width  / 2)) * strength
    const dy = (e.clientY - (rect.top  + rect.height / 2)) * strength
    ref.current.style.transform = `translate(${dx}px, ${dy}px)`
    ref.current.style.transition = 'transform 0.1s ease-out'
  }

  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    onMouseLeave?.(e)
    if (!ref.current) return
    ref.current.style.transform = 'translate(0px, 0px)'
    ref.current.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
  }

  return (
    <button
      ref={ref}
      style={{ willChange: 'transform', ...style }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      {children}
    </button>
  )
}
