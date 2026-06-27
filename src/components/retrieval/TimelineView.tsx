import { useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MapPin, TrendingDown, Waves, Leaf, Building2 } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { getSimilarityColor, getSensorColor } from '@/lib/utils'
import type { RetrievalResult } from '@/types'

const ZOOM_LEVELS = ['All', '5 Years', '2 Years', '1 Year', '6 Months']

// Environmental change events — Brahmaputra flood mission timeline
const CHANGE_EVENTS = [
  { year: '2020', label: 'Baseline archive — pre-monsoon normal flow',      type: 'vegetation',   color: '#22C55E', icon: Leaf       },
  { year: '2021', label: 'Normal monsoon — seasonal channel expansion',      type: 'flood',        color: '#3B82F6', icon: Waves      },
  { year: '2022', label: 'Major inundation event — 8,400 km² submerged',    type: 'flood',        color: '#3B82F6', icon: Waves      },
  { year: '2023', label: 'River channel shifted +2.1 km east — geomorphic', type: 'deforestation',color: '#EF4444', icon: TrendingDown },
  { year: '2023', label: 'Post-monsoon vegetation recovery — NDVI +0.18',   type: 'vegetation',   color: '#22C55E', icon: Leaf       },
  { year: '2024', label: 'UPLOADED MISSION — Flood signature confirmed',    type: 'flood',        color: '#60A5FA', icon: Waves      },
  { year: '2024', label: 'Water extent exceeded 2022 levels — ongoing',     type: 'flood',        color: '#3B82F6', icon: Waves      },
  { year: '2025', label: 'Monitoring recommendation — 6-hour SAR intervals', type: 'urban',        color: '#F59E0B', icon: Building2 },
]

const YEAR_SUMMARY: Record<string, { sensors: string[]; scenes: number; highlight: string }> = {
  '2020': { sensors: ['Sentinel-1A', 'Sentinel-2A', 'Landsat-8'],              scenes: 4,  highlight: 'Baseline archive — normal monsoon discharge' },
  '2021': { sensors: ['RISAT-2B', 'Sentinel-1A'],                              scenes: 2,  highlight: 'Seasonal monitoring — limited cloud-free window' },
  '2022': { sensors: ['RISAT-2B', 'Sentinel-1A', 'Sentinel-2A'],               scenes: 5,  highlight: 'Major flood event — 8,400 km² inundated' },
  '2023': { sensors: ['RISAT-2B', 'Cartosat-3', 'Sentinel-2A', 'ALOS-2'],     scenes: 8,  highlight: 'River morphology shift + vegetation recovery' },
  '2024': { sensors: ['RISAT-2B', 'Cartosat-3', 'Sentinel-1A', 'Sentinel-2A', 'ALOS-2'], scenes: 11, highlight: 'Active flood monitoring — uploaded mission image' },
  '2025': { sensors: ['RISAT-2B', 'Sentinel-1A'],                              scenes: 2,  highlight: 'Projected monitoring — 6-hour acquisition cadence' },
}

function TrackRow({
  top, label, color, children,
}: { top: number; label: string; color: string; children?: ReactNode }) {
  return (
    <div className="absolute left-0 right-0" style={{ top, height: 28 }}>
      {/* Lane baseline */}
      <div className="absolute inset-x-0" style={{ top: '50%', height: 1, background: `${color}18` }} />
      {/* Lane label */}
      <div className="absolute -left-0 text-right" style={{ top: '50%', transform: 'translateY(-50%)', width: 0, overflow: 'visible' }}>
        <span className="font-mono whitespace-nowrap pr-2" style={{ fontSize: 8, color: `${color}80`, letterSpacing: '0.04em' }}>
          {label}
        </span>
      </div>
      {/* Children (markers) */}
      <div className="relative w-full h-full">{children}</div>
    </div>
  )
}

export default function TimelineView() {
  const results            = useAppStore((s) => s.results)
  const openExplainability = useAppStore((s) => s.openExplainability)
  const activeMission      = useAppStore((s) => s.activeMission)
  const uploadedImage      = useAppStore((s) => s.uploadedImage)
  const [zoom, setZoom]    = useState('All')
  const [hovered, setHovered] = useState<RetrievalResult | null>(null)
  const [selectedYear, setSelectedYear] = useState<string | null>('2024')

  // Use uploaded image timestamp (or today) as the "Current Observation" anchor
  const queryDate = uploadedImage?.acquisitionDate ?? new Date().toISOString()

  const sorted   = [...results].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  const minTime  = new Date('2020-01-01').getTime()
  const maxTime  = new Date('2025-12-31').getTime()
  const range    = maxTime - minTime
  const getX     = (ts: string) => Math.max(0, Math.min(100, ((new Date(ts).getTime() - minTime) / range) * 100))
  const YEARS    = ['2020', '2021', '2022', '2023', '2024', '2025']

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
            {results.length} archive observations · Brahmaputra Basin · 2020–2026
            {activeMission && <> · <span style={{ color: '#3B82F6' }}>Current: {activeMission.name.split('·')[0].trim()}</span></>}
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

          {/* ── 4-Track Timeline ───────────────────────────────────── */}
          <div className="relative mb-4" style={{ height: 140 }}>

            {/* Year gridlines */}
            {YEARS.map((y, i) => (
              <div key={i} className="absolute top-0 bottom-0"
                style={{ left: `${(i / (YEARS.length - 1)) * 100}%`, width: 1, background: selectedYear === y ? 'rgba(59,130,246,0.25)' : 'rgba(45,55,72,0.14)' }} />
            ))}

            {/* Track 1 — Satellite Acquisitions (top) */}
            <TrackRow top={4} label="Satellite Acquisitions" color="#8B5CF6">
              {CHANGE_EVENTS.filter(e => !e.label.includes('UPLOADED')).map((evt, i) => {
                const yearIdx = YEARS.indexOf(evt.year)
                if (yearIdx < 0) return null
                const pct = (yearIdx / (YEARS.length - 1)) * 100
                return (
                  <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${pct + (i % 3) * 2}%`, top: '50%' }}>
                    <div className="w-2 h-2 rounded-full" style={{ background: evt.color, opacity: 0.8 }} />
                  </div>
                )
              })}
            </TrackRow>

            {/* Track 2 — Flood Events */}
            <TrackRow top={40} label="Flood Events" color="#3B82F6">
              {CHANGE_EVENTS.filter(e => e.type === 'flood').map((evt, i) => {
                const yearIdx = YEARS.indexOf(evt.year)
                if (yearIdx < 0) return null
                const pct = (yearIdx / (YEARS.length - 1)) * 100
                return (
                  <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${pct}%`, top: '50%' }}>
                    <div className="w-2.5 h-2.5 rounded-sm rotate-45 flex-shrink-0"
                      style={{ background: evt.color, boxShadow: `0 0 6px ${evt.color}40` }} />
                  </div>
                )
              })}
            </TrackRow>

            {/* Track 3 — Retrieved Matches */}
            <TrackRow top={76} label="Retrieved Matches" color="#14B8A6">
              {sorted.map((r, i) => (
                <motion.div key={r.id}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: i * 0.04 + 0.2 }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                  style={{ left: `${getX(r.timestamp)}%`, top: '50%' }}
                  onMouseEnter={() => setHovered(r)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => openExplainability(r)}>
                  <div className="rounded-full transition-all duration-150"
                    style={{
                      width:  `${6 + (r.similarityScore / 100) * 6}px`,
                      height: `${6 + (r.similarityScore / 100) * 6}px`,
                      background: getSensorColor(r.sensorType),
                      border: '1.5px solid rgba(8,13,22,0.8)',
                      transform: hovered?.id === r.id ? 'scale(1.6)' : 'scale(1)',
                      boxShadow: hovered?.id === r.id ? `0 0 8px ${getSensorColor(r.sensorType)}60` : 'none',
                    }} />
                </motion.div>
              ))}
            </TrackRow>

            {/* Track 4 — Mission Events */}
            <TrackRow top={112} label="Mission Events" color="#F59E0B">
              {/* Query upload marker */}
              <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.15 }}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-10"
                style={{ left: `${getX(queryDate)}%`, top: '50%' }}>
                <div className="w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: '#3B82F6', border: '2px solid rgba(8,13,22,1)', boxShadow: '0 0 0 3px rgba(59,130,246,0.3), 0 0 10px rgba(59,130,246,0.5)' }}>
                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                </div>
                <div className="font-mono text-center whitespace-nowrap -translate-x-5 leading-tight"
                  style={{ fontSize: 8, color: '#60A5FA', marginTop: 2 }}>
                  RISAT-2B<br /><span style={{ color: '#3B82F6', fontWeight: 700 }}>Query</span>
                </div>
              </motion.div>
            </TrackRow>
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
            {filteredEvents.map((evt, i) => {
              const isCurrent = evt.label.includes('UPLOADED MISSION')
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-white-3 transition-colors"
                  style={{
                    borderBottom: i < filteredEvents.length - 1 ? '1px solid rgba(45,55,72,0.15)' : 'none',
                    background: isCurrent ? 'rgba(59,130,246,0.06)' : 'transparent',
                  }}
                >
                  <evt.icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: evt.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-body-s" style={{ color: isCurrent ? '#60A5FA' : '#94A3B8', fontWeight: isCurrent ? 600 : 400 }}>
                      {evt.label}
                    </div>
                    {isCurrent && (
                      <div className="text-overline mt-0.5" style={{ color: '#3B82F6' }}>
                        BF2024-RISAT2B-001 · 87% confidence · RISAT-2B SAR · C-band
                      </div>
                    )}
                  </div>
                  <div className="font-mono text-caption flex-shrink-0" style={{ color: evt.color }}>
                    {evt.year}
                  </div>
                </div>
              )
            })}
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
