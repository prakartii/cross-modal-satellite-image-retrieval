import { useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MapPin, Calendar, Eye, GitCompare, Pin } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { cn, formatTimestamp, getSimilarityColor } from '@/lib/utils'
import SensorChip from '@/components/ui/SensorChip'
import type { RetrievalResult } from '@/types'

// Rank tier colors — gold/silver/bronze for top 3
function getRankStyle(rank: number): { bg: string; color: string } {
  if (rank === 1) return { bg: 'rgba(251,191,36,0.15)', color: '#FBBF24' }
  if (rank === 2) return { bg: 'rgba(148,163,184,0.15)', color: '#94A3B8' }
  if (rank === 3) return { bg: 'rgba(180,120,60,0.15)', color: '#B47C3C' }
  return { bg: 'rgba(45,55,72,0.4)', color: '#4A5568' }
}

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

  // 3D cursor tilt — tracks mouse position within card
  const cardRef = useRef<HTMLDivElement>(null)

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const cx = (e.clientX - rect.left) / rect.width  - 0.5
    const cy = (e.clientY - rect.top)  / rect.height - 0.5
    cardRef.current.style.transform = `perspective(600px) rotateX(${cy * -8}deg) rotateY(${cx * 8}deg) translateY(${isSelected ? 0 : -2}px)`
  }

  const handleMouseLeave = () => {
    hoverResult(null)
    if (cardRef.current) {
      cardRef.current.style.transform = 'perspective(600px) rotateX(0deg) rotateY(0deg) translateY(0px)'
    }
  }

  // Rank-confidence weighted entrance delay
  const rankDelay = index * 0.06 + (result.rank <= 3 ? 0 : 0.04)

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rankDelay, duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
      style={{
        transformStyle: 'preserve-3d',
        transition: 'transform 0.15s ease-out, box-shadow 0.2s ease',
        ...(isSelected ? { borderLeftWidth: '3px' } : {}),
      }}
      onMouseEnter={() => hoverResult(result)}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'relative flex flex-col bg-card border rounded-xl overflow-hidden cursor-pointer flex-shrink-0',
        compact ? 'w-48' : 'w-52',
        isSelected
          ? 'border-blue-primary shadow-glow-blue'
          : isHovered
          ? 'border-blue-primary/40 shadow-panel'
          : 'border-border'
      )}
    >
      {/* Rank + similarity overlay */}
      <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5">
        {(() => {
          const { bg, color } = getRankStyle(result.rank)
          return (
            <span
              className="w-5 h-5 rounded flex items-center justify-center font-mono text-caption font-bold"
              style={{ background: bg, color, border: `1px solid ${color}40` }}
            >
              {result.rank}
            </span>
          )
        })()}
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

        {/* Primary similarity bar */}
        <div className="similarity-bar">
          <div
            className="similarity-bar-fill"
            style={{ width: `${result.similarityScore}%`, background: simColor }}
          />
        </div>

        {/* Multi-signal breakdown — visible on hover */}
        <AnimatePresence>
          {isHovered && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <div className="pt-1.5 space-y-1">
                {[
                  { label: 'Water',   value: result.featureSimilarity.water,      color: '#3B82F6' },
                  { label: 'Veg.',    value: result.featureSimilarity.vegetation, color: '#22C55E' },
                  { label: 'Terrain', value: result.featureSimilarity.terrain,    color: '#14B8A6' },
                ].map(({ label, value }) => {
                  const pct = Math.round(value)
                  const barColor = pct >= 85 ? '#22C55E' : pct >= 70 ? '#3B82F6' : '#F59E0B'
                  return (
                    <div key={label}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-overline text-text-tertiary">{label}</span>
                        <span className="font-mono text-overline" style={{ color: barColor }}>{pct}%</span>
                      </div>
                      <div style={{ height: 2, background: 'rgba(45,55,72,0.4)', borderRadius: 1, overflow: 'hidden' }}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.4, ease: 'easeOut' }}
                          style={{ height: '100%', background: barColor, borderRadius: 1 }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
