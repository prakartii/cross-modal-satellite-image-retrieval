import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MapPin, Eye, GitCompare, Pin, X, Leaf, Waves, Grid3X3, Map, Crosshair } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { getSimilarityColor, cn } from '@/lib/utils'
import SensorChip from '@/components/ui/SensorChip'
import CoordinateDisplay from '@/components/ui/CoordinateDisplay'
import type { RetrievalResult } from '@/types'

// Explainable retrieval dimensions
const EXPLAIN_DIMS = [
  { key: 'vegetation', label: 'Vegetation Similarity', icon: Leaf,      color: '#22C55E', desc: 'Riparian cover, NDVI pattern match' },
  { key: 'water',      label: 'Water-Body Similarity', icon: Waves,     color: '#3B82F6', desc: 'Channel morphology, flood extent'  },
  { key: 'texture',    label: 'Texture Similarity',    icon: Grid3X3,   color: '#14B8A6', desc: 'Surface roughness, alluvial texture' },
  { key: 'spatial',    label: 'Spatial Similarity',    icon: Map,       color: '#8B5CF6', desc: 'Geometric alignment in embed space' },
  { key: 'overall',    label: 'Overall Confidence',    icon: Crosshair, color: '#F8FAFC', desc: 'Weighted cross-modal retrieval score' },
] as const

export default function GalleryView() {
  const results            = useAppStore((s) => s.results)
  const selectedResult     = useAppStore((s) => s.selectedResult)
  const selectResult       = useAppStore((s) => s.selectResult)
  const openExplainability = useAppStore((s) => s.openExplainability)

  const [detailOpen, setDetailOpen] = useState(false)
  const focused = selectedResult ?? results[0] ?? null

  const handleSelect = (r: RetrievalResult) => {
    selectResult(r)
    setDetailOpen(true)
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Result list — left column */}
      <div
        className="flex flex-col overflow-hidden flex-shrink-0"
        style={{ width: detailOpen ? 380 : '100%', transition: 'width 0.3s cubic-bezier(0.4,0,0.2,1)' }}
      >
        {/* Header */}
        <div
          className="px-6 py-4 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(45,55,72,0.28)' }}
        >
          <div>
            <h2 className="text-heading-3 text-text-primary font-semibold">Intelligence Results</h2>
            <p className="text-caption text-text-tertiary mt-0.5 font-mono">
              {results.length} matches · SAR → Cross-modal retrieval
            </p>
          </div>
          {detailOpen && (
            <button onClick={() => setDetailOpen(false)} className="btn-ghost p-1.5">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Result rows */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
          >
            {results.map((r, i) => (
              <ResultRow
                key={r.id}
                result={r}
                index={i}
                selected={focused?.id === r.id && detailOpen}
                onSelect={() => handleSelect(r)}
              />
            ))}
          </motion.div>
        </div>
      </div>

      {/* Detail panel — right column */}
      <AnimatePresence>
        {detailOpen && focused && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            className="flex-1 flex flex-col overflow-hidden"
            style={{ borderLeft: '1px solid rgba(45,55,72,0.28)' }}
          >
            <ResultDetail result={focused} onExplain={() => openExplainability(focused)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ResultRow({ result, index, selected, onSelect }: {
  result: RetrievalResult
  index: number
  selected: boolean
  onSelect: () => void
}) {
  const simColor = getSimilarityColor(result.similarityScore)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25 }}
      onClick={onSelect}
      className="flex items-center gap-4 px-6 py-3.5 cursor-pointer transition-all duration-150 group relative"
      style={{
        borderBottom: '1px solid rgba(45,55,72,0.2)',
        background: selected ? 'rgba(59,130,246,0.06)' : 'transparent',
      }}
    >
      {selected && (
        <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r" style={{ background: '#3B82F6' }} />
      )}

      <div className="w-5 text-caption font-mono text-text-tertiary text-right flex-shrink-0">{result.rank}</div>

      <div className="w-14 h-10 rounded overflow-hidden flex-shrink-0 bg-surface">
        <img
          src={result.thumbnailUrl}
          alt={result.location.name}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-body-s text-text-primary font-medium truncate">{result.location.name}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <SensorChip type={result.sensorType} size="sm" />
          <span className="font-mono text-caption text-text-tertiary">
            {new Date(result.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
        </div>
      </div>

      <div className="flex-shrink-0 text-right">
        <div className="font-mono text-body-s font-semibold" style={{ color: simColor }}>
          {result.similarityScore.toFixed(1)}%
        </div>
        <div className="mt-1 w-16 similarity-bar">
          <div className="similarity-bar-fill" style={{ width: `${result.similarityScore}%`, background: simColor }} />
        </div>
      </div>
    </motion.div>
  )
}

function ExplainDimension({ dim, value, delay }: {
  dim: typeof EXPLAIN_DIMS[number]
  value: number
  delay: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.25 }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <dim.icon className="w-3 h-3 flex-shrink-0" style={{ color: dim.color }} />
          <span className="text-body-s text-text-secondary">{dim.label}</span>
        </div>
        <span className="font-mono text-caption font-semibold" style={{ color: dim.color }}>
          {value.toFixed(1)}%
        </span>
      </div>
      <div className="similarity-bar mb-1">
        <motion.div
          className="similarity-bar-fill"
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.75, delay: delay + 0.1, ease: 'easeOut' }}
          style={{ background: dim.color }}
        />
      </div>
      <div className="text-overline text-text-tertiary">{dim.desc}</div>
    </motion.div>
  )
}

function ResultDetail({ result, onExplain }: { result: RetrievalResult; onExplain: () => void }) {
  const addToCompare = useAppStore((s) => s.addToCompare)
  const simColor = getSimilarityColor(result.similarityScore)

  const spatialSim = result.embeddingDistance ? (1 - result.embeddingDistance) * 100 : 91.0
  const dimValues: Record<string, number> = {
    vegetation: result.featureSimilarity.vegetation,
    water:      result.featureSimilarity.water,
    texture:    result.featureSimilarity.texture,
    spatial:    spatialSim,
    overall:    result.similarityScore,
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-hide">
      {/* Image */}
      <div className="relative flex-shrink-0" style={{ height: 200 }}>
        <img
          src={result.thumbnailUrl}
          alt={result.location.name}
          className="w-full h-full object-cover"
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to top, rgba(8,13,22,0.92) 0%, transparent 55%)' }}
        />
        <div className="absolute bottom-0 left-0 right-0 px-5 pb-4">
          <div className="text-heading-3 text-white font-semibold">{result.location.name}</div>
          <div className="flex items-center gap-2 mt-1.5">
            <SensorChip type={result.sensorType} size="sm" />
            <span className="font-mono text-caption" style={{ color: simColor }}>
              {result.similarityScore.toFixed(1)}% match
            </span>
          </div>
        </div>
        <div
          className="absolute top-3 left-3 w-6 h-6 rounded flex items-center justify-center font-mono text-caption text-text-tertiary"
          style={{ background: 'rgba(8,13,22,0.85)', border: '1px solid rgba(45,55,72,0.4)' }}
        >
          {result.rank}
        </div>
      </div>

      {/* Metadata */}
      <div className="px-5 py-5 space-y-5 flex-1">
        {/* Observation metadata */}
        <div>
          <div className="overline-label mb-3">Observation Metadata</div>
          <div>
            {[
              { label: 'Satellite',   value: result.satellite ?? '—'       },
              { label: 'Sensor',      value: result.sensorType              },
              { label: 'Resolution',  value: result.resolution ?? '—'       },
              { label: 'Acquisition', value: new Date(result.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) },
              { label: 'Archive',     value: 'ISRO Bhuvan · Copernicus'    },
            ].map(({ label, value }) => (
              <div key={label} className="data-row">
                <span className="text-caption text-text-tertiary">{label}</span>
                <span className="text-body-s text-text-secondary font-medium">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Location */}
        <div>
          <div className="overline-label mb-3">Geolocation</div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />
              <span className="text-body-s text-text-secondary">{result.location.name}</span>
            </div>
            <CoordinateDisplay coords={result.location.coords} />
          </div>
        </div>

        {/* Explainable retrieval */}
        <div>
          <div className="overline-label mb-3">Explainable Retrieval</div>
          <div className="space-y-4">
            {EXPLAIN_DIMS.map((dim, i) => (
              <ExplainDimension
                key={dim.key}
                dim={dim}
                value={dimValues[dim.key] ?? 0}
                delay={i * 0.06}
              />
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onExplain}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-body-s font-medium transition-all"
            style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)', color: '#3B82F6' }}
          >
            <Eye className="w-3.5 h-3.5" />
            Deep Explain
          </button>
          <button
            onClick={() => addToCompare(result.id)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-body-s font-medium transition-all"
            style={{ background: 'rgba(26,35,51,0.6)', border: '1px solid rgba(45,55,72,0.45)', color: '#94A3B8' }}
          >
            <GitCompare className="w-3.5 h-3.5" />
            Compare
          </button>
          <button
            className="flex items-center justify-center p-2.5 rounded-md transition-all"
            style={{ background: 'rgba(26,35,51,0.6)', border: '1px solid rgba(45,55,72,0.45)', color: '#64748B' }}
            title="Pin on globe"
          >
            <Pin className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
