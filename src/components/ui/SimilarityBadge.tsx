import { getSimilarityColor } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface SimilarityBadgeProps {
  score: number
  showBar?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export default function SimilarityBadge({
  score, showBar = false, size = 'md', className
}: SimilarityBadgeProps) {
  const color = getSimilarityColor(score)

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div
        className={cn(
          'inline-flex items-center justify-center font-mono font-semibold rounded-md',
          size === 'sm'  && 'text-caption px-1.5 py-0.5',
          size === 'md'  && 'text-body-s  px-2   py-1',
          size === 'lg'  && 'text-heading-3 px-3 py-1.5',
        )}
        style={{
          color,
          background: `${color}15`,
          border: `1px solid ${color}30`,
        }}
      >
        {score.toFixed(1)}%
      </div>
      {showBar && (
        <div className="similarity-bar w-full">
          <div
            className="similarity-bar-fill"
            style={{ width: `${score}%`, background: color }}
          />
        </div>
      )}
    </div>
  )
}
