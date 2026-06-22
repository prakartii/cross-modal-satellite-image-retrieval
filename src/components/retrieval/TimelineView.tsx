import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAppStore } from '@/store/useAppStore'
import { getSimilarityColor, getSensorColor } from '@/lib/utils'
import type { RetrievalResult } from '@/types'

const ZOOM_LEVELS = ['All', '5 Years', '2 Years', '1 Year', '6 Months']

export default function TimelineView() {
  const results         = useAppStore((s) => s.results)
  const openExplainability = useAppStore((s) => s.openExplainability)
  const [zoom, setZoom] = useState('All')
  const [hovered, setHovered] = useState<RetrievalResult | null>(null)

  const sorted   = [...results].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  const minTime  = new Date('2020-01-01').getTime()
  const maxTime  = new Date('2026-06-22').getTime()
  const range    = maxTime - minTime
  const getX     = (ts: string) => ((new Date(ts).getTime() - minTime) / range) * 100
  const YEARS    = ['2020', '2021', '2022', '2023', '2024', '2025', '2026']

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div
        className="px-6 py-4 flex items-center justify-between flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(45,55,72,0.28)' }}
      >
        <div>
          <h2 className="text-heading-3 text-text-primary font-semibold">Temporal Analysis</h2>
          <p className="text-caption text-text-tertiary mt-0.5 font-mono">
            {results.length} observations · 2020 – 2026
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {ZOOM_LEVELS.map((z) => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              className="px-3 py-1.5 rounded-md text-caption transition-all"
              style={
                zoom === z
                  ? { background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)', color: '#3B82F6' }
                  : { background: 'transparent', border: '1px solid rgba(45,55,72,0.35)', color: '#64748B' }
              }
            >
              {z}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline canvas */}
      <div className="flex-1 flex flex-col px-8 py-8 overflow-hidden">
        {/* Year axis */}
        <div className="flex justify-between mb-2 select-none">
          {YEARS.map((y) => (
            <span key={y} className="font-mono text-caption text-text-tertiary">{y}</span>
          ))}
        </div>

        {/* Track */}
        <div className="relative h-20 mb-6">
          {/* Baseline */}
          <div
            className="absolute top-1/2 left-0 right-0"
            style={{ height: 1, background: 'rgba(45,55,72,0.4)' }}
          />

          {/* Year gridlines */}
          {YEARS.map((_, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0"
              style={{ left: `${(i / (YEARS.length - 1)) * 100}%`, width: 1, background: 'rgba(45,55,72,0.18)' }}
            />
          ))}

          {/* Query marker */}
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
            style={{ left: `${getX('2024-09-12')}%` }}
          >
            <div
              className="w-4 h-4 rounded-full flex items-center justify-center"
              style={{
                background: '#3B82F6',
                border: '2px solid rgba(8,13,22,1)',
                boxShadow: '0 0 0 3px rgba(59,130,246,0.2)',
              }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-white" />
            </div>
            <div className="text-caption text-blue-primary font-mono text-center mt-1 whitespace-nowrap -translate-x-2">
              Query
            </div>
          </motion.div>

          {/* Result dots */}
          {sorted.map((r, i) => (
            <motion.div
              key={r.id}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: i * 0.04 + 0.35 }}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 cursor-pointer z-5"
              style={{ left: `${getX(r.timestamp)}%` }}
              onMouseEnter={() => setHovered(r)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => openExplainability(r)}
            >
              <div
                className="rounded-full transition-all duration-150"
                style={{
                  width:  `${8 + (r.similarityScore / 100) * 8}px`,
                  height: `${8 + (r.similarityScore / 100) * 8}px`,
                  background: getSensorColor(r.sensorType),
                  border: '2px solid rgba(8,13,22,0.8)',
                  transform: hovered?.id === r.id ? 'scale(1.5)' : 'scale(1)',
                  boxShadow: hovered?.id === r.id ? `0 0 10px ${getSensorColor(r.sensorType)}60` : 'none',
                }}
              />
            </motion.div>
          ))}
        </div>

        {/* Hover tooltip */}
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 flex items-center gap-4 px-4 py-3 rounded-lg"
            style={{
              background: 'rgba(17,24,39,0.9)',
              border: '1px solid rgba(45,55,72,0.35)',
            }}
          >
            <img src={hovered.thumbnailUrl} alt="" className="w-14 h-10 object-cover rounded flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-body-s text-text-primary font-medium truncate">{hovered.satellite}</div>
              <div className="text-caption text-text-secondary truncate">{hovered.location.name}</div>
              <div className="font-mono text-caption text-text-tertiary">
                {new Date(hovered.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
            </div>
            <div
              className="font-mono text-body-s font-semibold flex-shrink-0"
              style={{ color: getSimilarityColor(hovered.similarityScore) }}
            >
              {hovered.similarityScore.toFixed(1)}%
            </div>
          </motion.div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-6">
          {[
            { label: 'Query',        color: '#3B82F6' },
            { label: 'Optical',      color: '#22C55E' },
            { label: 'SAR',          color: '#3B82F6' },
            { label: 'Multispectral',color: '#F59E0B' },
          ].map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
              <span className="text-caption text-text-secondary">{label}</span>
            </div>
          ))}
          <span className="ml-auto text-caption text-text-tertiary">Node size ∝ similarity score</span>
        </div>

        {/* Pattern detection */}
        <div
          className="mt-6 p-4 rounded-xl"
          style={{
            background: 'rgba(17,24,39,0.4)',
            border: '1px solid rgba(45,55,72,0.22)',
          }}
        >
          <div className="overline-label mb-2.5">Pattern Detection</div>
          <div className="space-y-2">
            {[
              { text: 'Observations cluster Sep–Oct (annual monsoon peak signature)', color: '#3B82F6' },
              { text: 'Archive gap: Jan 2020 – Mar 2021 (data availability)', color: '#F59E0B' },
            ].map(({ text, color }) => (
              <div key={text} className="flex items-start gap-2.5">
                <div className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ background: color }} />
                <span className="text-body-s text-text-secondary">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
