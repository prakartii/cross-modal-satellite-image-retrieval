import { motion } from 'framer-motion'
import { MapPin, Calendar, Eye, GitCompare, Pin } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { cn, formatTimestamp, getSimilarityColor } from '@/lib/utils'
import SensorChip from '@/components/ui/SensorChip'
import type { RetrievalResult } from '@/types'

interface ResultCardProps {
  result: RetrievalResult
  index: number
  compact?: boolean
}

export default function ResultCard({ result, index, compact = false }: ResultCardProps) {
  const selectedResult = useAppStore((s) => s.selectedResult)
  const hoveredResult  = useAppStore((s) => s.hoveredResult)
  const hoverResult    = useAppStore((s) => s.hoverResult)
  const openExplainability = useAppStore((s) => s.openExplainability)
  const addToCompare   = useAppStore((s) => s.addToCompare)

  const isSelected = selectedResult?.id === result.id
  const isHovered  = hoveredResult?.id === result.id
  const simColor   = getSimilarityColor(result.similarityScore)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.3 }}
      onMouseEnter={() => hoverResult(result)}
      onMouseLeave={() => hoverResult(null)}
      className={cn(
        'relative flex flex-col bg-card border rounded-xl overflow-hidden transition-all duration-200 cursor-pointer flex-shrink-0',
        compact ? 'w-48' : 'w-52',
        isSelected
          ? 'border-blue-primary shadow-glow-blue'
          : isHovered
          ? 'border-blue-primary/40 shadow-panel -translate-y-0.5'
          : 'border-border'
      )}
      style={isSelected ? { borderLeftWidth: '3px' } : {}}
    >
      {/* Rank + similarity overlay */}
      <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5">
        <span className="w-5 h-5 rounded bg-canvas/80 flex items-center justify-center font-mono text-caption text-text-tertiary">
          {result.rank}
        </span>
      </div>
      <div className="absolute top-2 right-2 z-10">
        <span
          className="px-2 py-0.5 rounded font-mono text-caption font-semibold"
          style={{ background: `${simColor}22`, color: simColor, border: `1px solid ${simColor}40` }}
        >
          {result.similarityScore.toFixed(1)}%
        </span>
      </div>

      {/* Image */}
      <div className={cn('w-full bg-surface overflow-hidden', compact ? 'h-28' : 'h-32')}>
        <img
          src={result.thumbnailUrl}
          alt={result.location.name}
          className="w-full h-full object-cover transition-transform duration-300"
          style={{ transform: isHovered ? 'scale(1.04)' : 'scale(1)' }}
        />
      </div>

      {/* Content */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <SensorChip type={result.sensorType} size="sm" />

        <div>
          <div className="text-body-s text-text-primary font-medium truncate leading-tight">
            {result.location.name}
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <MapPin className="w-2.5 h-2.5 text-text-tertiary flex-shrink-0" />
            <span className="font-mono text-caption text-text-tertiary truncate">
              {result.location.coords.lat.toFixed(2)}°{result.location.coords.lat >= 0 ? 'N' : 'S'}
              · {result.location.coords.lng.toFixed(2)}°{result.location.coords.lng >= 0 ? 'E' : 'W'}
            </span>
          </div>
        </div>

        {/* Similarity bar */}
        <div className="similarity-bar">
          <div
            className="similarity-bar-fill"
            style={{ width: `${result.similarityScore}%`, background: simColor }}
          />
        </div>

        {!compact && (
          <div className="flex items-center gap-1">
            <Calendar className="w-2.5 h-2.5 text-text-tertiary" />
            <span className="text-caption text-text-tertiary truncate">
              {new Date(result.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 mt-auto pt-1 border-t border-border">
          <button
            onClick={(e) => { e.stopPropagation(); openExplainability(result) }}
            className="flex-1 flex items-center justify-center gap-1 py-1 rounded-md hover:bg-white/5 text-text-tertiary hover:text-text-secondary transition-colors"
            title="View explanation"
          >
            <Eye className="w-3 h-3" />
            <span className="text-caption">Explain</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); addToCompare(result.id) }}
            className="flex-1 flex items-center justify-center gap-1 py-1 rounded-md hover:bg-white/5 text-text-tertiary hover:text-text-secondary transition-colors"
            title="Compare"
          >
            <GitCompare className="w-3 h-3" />
            <span className="text-caption">Compare</span>
          </button>
          <button
            className="p-1 rounded-md hover:bg-white/5 text-text-tertiary hover:text-text-secondary transition-colors"
            title="Pin on globe"
          >
            <Pin className="w-3 h-3" />
          </button>
        </div>
      </div>
    </motion.div>
  )
}
