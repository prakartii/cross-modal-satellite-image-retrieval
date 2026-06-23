import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MapPin, TrendingDown, Waves, Leaf, Building2 } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { getSimilarityColor, getSensorColor } from '@/lib/utils'
import type { RetrievalResult } from '@/types'

const ZOOM_LEVELS = ['All', '5 Years', '2 Years', '1 Year', '6 Months']

// Environmental change events layered on the timeline
const CHANGE_EVENTS = [
  { year: '2022', label: 'Major inundation event — 8,400 km²',  type: 'flood',       color: '#3B82F6', icon: Waves      },
  { year: '2023', label: 'Deforestation pulse detected — −420 km²', type: 'deforestation', color: '#EF4444', icon: TrendingDown },
  { year: '2023', label: 'Post-monsoon vegetation recovery',    type: 'vegetation',  color: '#22C55E', icon: Leaf       },
  { year: '2024', label: 'Flood extent exceeded 2022 levels',   type: 'flood',       color: '#3B82F6', icon: Waves      },
  { year: '2024', label: 'Urban footprint expanded +2.3%',       type: 'urban',       color: '#F59E0B', icon: Building2 },
]

const YEAR_SUMMARY: Record<string, { sensors: string[]; scenes: number; highlight: string }> = {
  '2020': { sensors: ['Sentinel-1A', 'Sentinel-2A'],                       scenes: 4,  highlight: 'Baseline archive — pre-monsoon' },
  '2021': { sensors: ['RISAT-2B', 'Sentinel-1A'],                          scenes: 2,  highlight: 'Limited coverage — cloud obstruction' },
  '2022': { sensors: ['RISAT-2B', 'Sentinel-1A', 'Sentinel-2A'],           scenes: 5,  highlight: 'Major flood event captured' },
  '2023': { sensors: ['RISAT-2B', 'Cartosat-3', 'Sentinel-2A', 'ALOS-2'], scenes: 8,  highlight: 'Deforestation + recovery pattern' },
  '2024': { sensors: ['RISAT-2B', 'Cartosat-3', 'Sentinel-1A', 'Sentinel-2A', 'ALOS-2'], scenes: 11, highlight: 'Flood exceeded 2022 — ongoing monitoring' },
}

export default function TimelineView() {
  const results            = useAppStore((s) => s.results)
  const openExplainability = useAppStore((s) => s.openExplainability)
  const [zoom, setZoom]    = useState('All')
  const [hovered, setHovered] = useState<RetrievalResult | null>(null)
  const [selectedYear, setSelectedYear] = useState<string | null>('2024')

  const sorted   = [...results].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  const minTime  = new Date('2020-01-01').getTime()
  const maxTime  = new Date('2026-06-22').getTime()
  const range    = maxTime - minTime
  const getX     = (ts: string) => ((new Date(ts).getTime() - minTime) / range) * 100
  const YEARS    = ['2020', '2021', '2022', '2023', '2024', '2025', '2026']

  const filteredEvents = selectedYear
    ? CHANGE_EVENTS.filter((e) => e.year === selectedYear)
    : CHANGE_EVENTS

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div
        className="px-6 py-4 flex items-center justify-between flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(45,55,72,0.28)' }}
      >
        <div>
          <h2 className="text-heading-3 text-text-primary font-semibold">Intelligence Timeline</h2>
          <p className="text-caption text-text-tertiary mt-0.5 font-mono">
            {results.length} sensor observations · Brahmaputra Basin · 2020–2026
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
      <div className="flex px-8 py-6 gap-6 overflow-hidden flex-1 min-h-0">

        {/* Main timeline column */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Year axis */}
          <div className="flex justify-between mb-2 select-none">
            {YEARS.map((y) => (
              <button
                key={y}
                onClick={() => setSelectedYear(selectedYear === y ? null : y)}
                className="font-mono text-caption transition-all"
                style={{ color: selectedYear === y ? '#3B82F6' : '#4A5568' }}
              >
                {y}
              </button>
            ))}
          </div>

          {/* Track */}
          <div className="relative h-24 mb-4">
            {/* Baseline */}
            <div
              className="absolute top-1/2 left-0 right-0"
              style={{ height: 1, background: 'rgba(45,55,72,0.4)' }}
            />

            {/* Year gridlines */}
            {YEARS.map((y, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0 transition-all"
                style={{
                  left: `${(i / (YEARS.length - 1)) * 100}%`,
                  width: 1,
                  background: selectedYear === y ? 'rgba(59,130,246,0.3)' : 'rgba(45,55,72,0.18)',
                }}
              />
            ))}

            {/* Environmental change markers */}
            {CHANGE_EVENTS.map((evt, i) => {
              const yearIdx = YEARS.indexOf(evt.year)
              if (yearIdx < 0) return null
              const pct = (yearIdx / (YEARS.length - 1)) * 100
              return (
                <div
                  key={i}
                  className="absolute top-0 -translate-x-1/2"
                  style={{ left: `${pct}%` }}
                >
                  <div
                    className="w-px h-8"
                    style={{ background: `${evt.color}40` }}
                  />
                  <div
                    className="w-1.5 h-1.5 rounded-full -translate-x-[2px]"
                    style={{ background: evt.color }}
                  />
                </div>
              )
            })}

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
          <AnimatePresence>
            {hovered && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                className="mb-4 flex items-center gap-4 px-4 py-3 rounded-lg flex-shrink-0"
                style={{ background: 'rgba(17,24,39,0.9)', border: '1px solid rgba(45,55,72,0.35)' }}
              >
                <img src={hovered.thumbnailUrl} alt="" className="w-14 h-10 object-cover rounded flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-body-s text-text-primary font-medium truncate">{hovered.satellite}</div>
                  <div className="text-caption text-text-secondary truncate">{hovered.location.name}</div>
                  <div className="font-mono text-caption text-text-tertiary">
                    {new Date(hovered.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </div>
                </div>
                <div className="font-mono text-body-s font-semibold flex-shrink-0" style={{ color: getSimilarityColor(hovered.similarityScore) }}>
                  {hovered.similarityScore.toFixed(1)}%
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Legend */}
          <div className="flex items-center gap-5 flex-shrink-0 mb-4">
            {[
              { label: 'Query',         color: '#3B82F6' },
              { label: 'Optical',       color: '#22C55E' },
              { label: 'SAR',           color: '#3B82F6' },
              { label: 'Multispectral', color: '#F59E0B' },
            ].map(({ label, color }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                <span className="text-caption text-text-secondary">{label}</span>
              </div>
            ))}
            <span className="ml-auto text-caption text-text-tertiary">Node size ∝ confidence</span>
          </div>

          {/* Environmental change events */}
          <div
            className="rounded-xl overflow-hidden flex-1 min-h-0 overflow-y-auto scrollbar-hide"
            style={{ background: 'rgba(17,24,39,0.4)', border: '1px solid rgba(45,55,72,0.22)' }}
          >
            <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(45,55,72,0.2)' }}>
              <div className="overline-label">Environmental Change Events</div>
            </div>
            {filteredEvents.map((evt, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-3 hover:bg-white-3 transition-colors"
                style={i < filteredEvents.length - 1 ? { borderBottom: '1px solid rgba(45,55,72,0.15)' } : {}}
              >
                <evt.icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: evt.color }} />
                <div className="flex-1 min-w-0">
                  <div className="text-body-s text-text-secondary">{evt.label}</div>
                </div>
                <div className="font-mono text-caption flex-shrink-0" style={{ color: evt.color }}>
                  {evt.year}
                </div>
              </div>
            ))}
            {filteredEvents.length === 0 && (
              <div className="px-4 py-4 text-body-s text-text-tertiary text-center">
                No events for selected year
              </div>
            )}
          </div>
        </div>

        {/* Year detail sidebar */}
        <AnimatePresence>
          {selectedYear && YEAR_SUMMARY[selectedYear] && (
            <motion.div
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.22 }}
              className="w-52 flex-shrink-0 flex flex-col gap-3"
            >
              <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(17,24,39,0.5)', border: '1px solid rgba(45,55,72,0.25)' }}>
                <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(45,55,72,0.2)' }}>
                  <div className="font-mono font-bold text-heading-2 text-text-primary">{selectedYear}</div>
                  <div className="text-caption text-text-tertiary mt-0.5">Annual Summary</div>
                </div>
                <div className="px-4 py-3 space-y-3">
                  <div>
                    <div className="overline-label mb-1.5">Scenes acquired</div>
                    <div className="font-mono text-heading-3 font-bold text-text-primary">
                      {YEAR_SUMMARY[selectedYear].scenes}
                    </div>
                  </div>
                  <div>
                    <div className="overline-label mb-1.5">Sensors active</div>
                    <div className="space-y-1">
                      {YEAR_SUMMARY[selectedYear].sensors.map((s) => (
                        <div key={s} className="flex items-center gap-1.5">
                          <div className="w-1 h-1 rounded-full bg-text-tertiary flex-shrink-0" />
                          <span className="text-caption text-text-secondary">{s}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="overline-label mb-1.5">Key observation</div>
                    <div className="text-body-s text-text-secondary leading-snug">
                      {YEAR_SUMMARY[selectedYear].highlight}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl p-4" style={{ background: 'rgba(17,24,39,0.5)', border: '1px solid rgba(45,55,72,0.25)' }}>
                <div className="overline-label mb-2">Location</div>
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3 h-3 text-text-tertiary flex-shrink-0" />
                  <span className="text-caption text-text-secondary">Brahmaputra Basin</span>
                </div>
                <div className="font-mono text-caption text-text-tertiary mt-1.5">26.12°N  91.74°E</div>
                <div className="text-overline text-text-tertiary mt-1">Assam, India</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
