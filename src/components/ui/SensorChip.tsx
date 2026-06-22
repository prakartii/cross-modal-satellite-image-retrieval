import { cn, getSensorColor } from '@/lib/utils'
import type { SensorType } from '@/types'

interface SensorChipProps {
  type: SensorType
  size?: 'sm' | 'md'
  className?: string
}

export default function SensorChip({ type, size = 'md', className }: SensorChipProps) {
  const color = getSensorColor(type)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-caption' : 'px-2.5 py-1 text-body-s',
        className
      )}
      style={{
        background: `${color}18`,
        border: `1px solid ${color}40`,
        color,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: color }}
      />
      {type}
    </span>
  )
}
