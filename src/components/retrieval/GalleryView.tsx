import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin, Eye, GitCompare, Pin, X,
  Leaf, Waves, Mountain, Map, Crosshair,
  Cloud, Radio, Clock, Hash, ChevronRight,
  ArrowLeftRight, TrendingUp, TrendingDown,
  AlertTriangle, Target, FileText, Activity,
  Layers, BarChart3,
} from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { getSimilarityColor, cn } from '@/lib/utils'
import SensorChip from '@/components/ui/SensorChip'
import CoordinateDisplay from '@/components/ui/CoordinateDisplay'
import type { RetrievalResult } from '@/types'

type Tab = 'overview' | 'compare' | 'timeline' | 'intel'

const TABS: { id: Tab; label: string; icon: typeof Eye }[] = [
  { id: 'overview',  label: 'Overview',  icon: FileText     },
  { id: 'compare',   label: 'Compare',   icon: ArrowLeftRight },
  { id: 'timeline',  label: 'Timeline',  icon: Activity     },
  { id: 'intel',     label: 'Intel',     icon: Target       },
]

const EXPLAIN_DIMS = [
  { key: 'water',      label: 'Water Body',  icon: Waves,    color: '#3B82F6', desc: 'Channel morphology · NDWI · flood extent'   },
  { key: 'vegetation', label: 'Vegetation',  icon: Leaf,     color: '#22C55E', desc: 'Riparian cover · NDVI · canopy signature'    },
  { key: 'terrain',    label: 'Terrain',     icon: Mountain, color: '#14B8A6', desc: 'Floodplain morphology · elevation · texture'  },
  { key: 'spatial',    label: 'Cross-Modal', icon: Map,      color: '#8B5CF6', desc: 'SAR↔Optical embedding space alignment'        },
  { key: 'overall',    label: 'Confidence',  icon: Crosshair,color: '#F8FAFC', desc: 'Weighted cross-modal retrieval confidence'    },
] as const

// Temporal evolution frames (simulated AOI history)
const TEMPORAL_FRAMES = [
  { date: '28 May', label: 'Pre-event',   ndwi: 0.08, extent: 24.1,  cloud: 67, sat: 'Landsat-9',    brightness: 1.12 },
  { date: '05 Jun', label: 'Early onset', ndwi: 0.31, extent: 71.8,  cloud: 34, sat: 'Sentinel-2A',  brightness: 1.02 },
  { date: '12 Jun', label: 'Rising',      ndwi: 0.54, extent: 198.4, cloud: 12, sat: 'Cartosat-3',   brightness: 0.92 },
  { date: '20 Jun', label: 'Peak flood',  ndwi: 0.74, extent: 397.2, cloud: 0,  sat: 'RISAT-2B',     brightness: 0.80 },
  { date: '24 Jun', label: 'Current',     ndwi: 0.62, extent: 342.6, cloud: 0,  sat: 'Sentinel-1A',  brightness: 0.88 },
]

// Change detection delta metrics
const CHANGE_METRICS = [
  { label: 'NDWI index',         before: '0.08',       after: '0.62',       delta: '+675%',  up: true,  color: '#3B82F6' },
  { label: 'SAR σ⁰ (VV pol)',    before: '−7.8 dB',    after: '−15.2 dB',   delta: '−7.4 dB', up: false, color: '#8B5CF6' },
  { label: 'Vegetation cover',   before: '71%',         after: '41%',        delta: '−30 pp', up: false, color: '#22C55E' },
  { label: 'Built area detects', before: '24%',         after: '18%',        delta: '−6 pp',  up: false, color: '#F59E0B' },
]

const QUERY_IMAGE_URL = 'https://images.unsplash.com/photo-1446776653964-20c1d3a81b06?w=800&h=500&fit=crop&sat=-100'

function getSceneId(r: RetrievalResult): string {
  const d   = new Date(r.timestamp)
  const ymd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`
  const sat = r.satellite.split(' ')[0].replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 5)
  const orb = String(r.orbitNumber ?? 0).padStart(5, '0')
  return `${sat}-${ymd}-${orb}`
}

function getProcessingDuration(r: RetrievalResult): string {
  return `${(0.8 + r.embeddingDistance * 3.2).toFixed(2)}s`
}

export default function GalleryView() {
  const results            = useAppStore((s) => s.results)
  const selectedResult     = useAppStore((s) => s.selectedResult)
  const selectResult       = useAppStore((s) => s.selectResult)
  const openExplainability = useAppStore((s) => s.openExplainability)
  const activeMission      = useAppStore((s) => s.activeMission)

  const [detailOpen, setDetailOpen] = useState(false)
  const [activeTab, setActiveTab]   = useState<Tab>('overview')
  const focused = selectedResult ?? results[0] ?? null

  const handleSelect = (r: RetrievalResult) => {
    selectResult(r)
    setDetailOpen(true)
    setActiveTab('overview')
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/* Result list */}
      <div className="flex flex-col overflow-hidden flex-shrink-0"
        style={{ width: detailOpen ? 360 : '100%', transition: 'width 0.3s cubic-bezier(0.4,0,0.2,1)' }}>

        <div className="px-5 py-3.5 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(45,55,72,0.28)', background: 'rgba(10,15,26,0.6)' }}>
          <div>
            <div className="text-heading-3 text-text-primary font-semibold">Intelligence Results</div>
            <div className="font-mono text-caption text-text-tertiary mt-0.5">
              {results.length} archive scenes · SAR→Cross-Modal · {activeMission?.id.slice(0, 14) ?? 'BHUVAN'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!detailOpen && (
              <div className="flex items-center gap-1.5">
                <div className="status-live" style={{ width: 5, height: 5 }} />
                <span className="text-caption text-teal-primary font-mono">BHUVAN</span>
              </div>
            )}
            {detailOpen && (
              <button onClick={() => setDetailOpen(false)} className="btn-ghost p-1.5">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <motion.div initial="hidden" animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.035 } } }}>
            {results.map((r, i) => (
              <ResultRow key={r.id} result={r} index={i}
                selected={focused?.id === r.id && detailOpen}
                onSelect={() => handleSelect(r)} />
            ))}
          </motion.div>
        </div>
      </div>

      {/* Detail panel — intelligence dossier */}
      <AnimatePresence>
        {detailOpen && focused && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.25 }}
            className="flex-1 flex flex-col overflow-hidden"
            style={{ borderLeft: '1px solid rgba(45,55,72,0.28)' }}>
            <IntelligenceDossier
              result={focused}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              onExplain={() => openExplainability(focused)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Result row ────────────────────────────────────────────────────────────────
function ResultRow({ result, index, selected, onSelect }: {
  result: RetrievalResult; index: number; selected: boolean; onSelect: () => void
}) {
  const simColor = getSimilarityColor(result.similarityScore)

  // Rank-weighted stagger: rank 1 enters fastest, lower ranks delayed slightly more
  const rankDelay = Math.log1p(result.rank - 1) * 0.04 + index * 0.028

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      whileHover={{ backgroundColor: selected ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.02)' }}
      transition={{ delay: rankDelay, duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
      onClick={onSelect}
      className="flex items-center gap-3.5 px-5 py-3 cursor-pointer group relative"
      style={{ borderBottom: '1px solid rgba(45,55,72,0.2)', background: selected ? 'rgba(59,130,246,0.06)' : 'transparent' }}>

      {selected && <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r" style={{ background: '#3B82F6' }} />}

      <div className="w-5 text-overline font-mono text-text-tertiary text-right flex-shrink-0">{result.rank}</div>

      <div className="w-16 h-11 rounded overflow-hidden flex-shrink-0"
        style={{ background: 'rgba(17,24,39,0.8)', border: '1px solid rgba(45,55,72,0.3)' }}>
        <img src={result.thumbnailUrl} alt={result.location.name}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          style={{
            filter: result.sensorType === 'SAR'
              ? 'grayscale(1) brightness(0.82) contrast(1.35)'
              : result.sensorType === 'Multispectral'
                ? 'saturate(1.3) hue-rotate(185deg) brightness(0.88) contrast(1.1)'
                : 'saturate(0.7) brightness(0.92) contrast(1.05)',
          }} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-body-s text-text-primary font-medium truncate">{result.location.name}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <SensorChip type={result.sensorType} size="sm" />
          <span className="font-mono text-caption text-text-tertiary">
            {new Date(result.timestamp).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}
          </span>
          {result.cloudCover > 0 && (
            <span className="flex items-center gap-0.5 font-mono text-caption text-text-tertiary">
              <Cloud className="w-2.5 h-2.5" /> {result.cloudCover.toFixed(0)}%
            </span>
          )}
        </div>
        {result.matchExplanation ? (
          <div className="text-overline mt-0.5 truncate" style={{ color: '#4A5568', fontStyle: 'italic' }}>
            {result.matchExplanation.split('·')[0].trim()}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="font-mono text-overline text-text-tertiary">{result.resolution}</span>
            {result.orbitNumber && (
              <span className="font-mono text-overline" style={{ color: '#4A5568' }}>· ORB#{result.orbitNumber}</span>
            )}
          </div>
        )}
        {/* Water / Vegetation / Terrain similarity chips */}
        <div className="flex items-center gap-1 mt-1">
          {([
            { label: 'Water',   value: result.featureSimilarity.water,      color: '#3B82F6' },
            { label: 'Veg',     value: result.featureSimilarity.vegetation, color: '#22C55E' },
            { label: 'Terrain', value: result.featureSimilarity.terrain,    color: '#14B8A6' },
          ] as const).map(({ label, value, color }) => (
            <span key={label}
              className="px-1.5 py-0.5 rounded font-mono leading-none"
              style={{ fontSize: 9, background: `${color}14`, color, border: `1px solid ${color}28` }}>
              {label} {Math.round(value)}%
            </span>
          ))}
        </div>
      </div>

      <div className="flex-shrink-0 text-right">
        <div className="font-mono text-body-s font-bold" style={{ color: simColor }}>
          {result.similarityScore.toFixed(1)}%
        </div>
        <div className="mt-1.5 w-16 h-1 rounded-full" style={{ background: 'rgba(45,55,72,0.45)', overflow: 'hidden' }}>
          <motion.div className="h-full rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${result.similarityScore}%` }}
            transition={{ delay: index * 0.035 + 0.15, duration: 0.5, ease: 'easeOut' }}
            style={{ background: simColor }} />
        </div>
        <div className="font-mono text-overline mt-1" style={{ color: '#4A5568' }}>
          d={result.embeddingDistance.toFixed(3)}
        </div>
      </div>

      {selected && <ChevronRight className="w-3.5 h-3.5 text-blue-primary flex-shrink-0" />}
    </motion.div>
  )
}

// ── Intelligence Dossier ──────────────────────────────────────────────────────
function IntelligenceDossier({ result, activeTab, setActiveTab, onExplain }: {
  result: RetrievalResult
  activeTab: Tab
  setActiveTab: (t: Tab) => void
  onExplain: () => void
}) {
  const simColor = getSimilarityColor(result.similarityScore)

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Hero image */}
      <div className="relative flex-shrink-0" style={{ height: 165 }}>
        <img src={result.thumbnailUrl} alt={result.location.name} className="w-full h-full object-cover"
          style={{ filter: result.sensorType === 'SAR' ? 'grayscale(40%)' : 'none' }} />
        <div className="absolute inset-0"
          style={{ background: 'linear-gradient(to top, rgba(8,13,22,0.97) 0%, rgba(8,13,22,0.25) 55%, transparent 100%)' }} />
        <div className="absolute top-3 left-3 w-7 h-7 rounded-md flex items-center justify-center font-mono text-caption text-text-tertiary"
          style={{ background: 'rgba(8,13,22,0.88)', border: '1px solid rgba(45,55,72,0.5)' }}>
          #{result.rank}
        </div>
        <div className="absolute top-3 right-3 px-2.5 py-1 rounded-md font-mono text-caption font-bold"
          style={{ background: 'rgba(8,13,22,0.88)', border: `1px solid ${simColor}44`, color: simColor }}>
          {result.similarityScore.toFixed(1)}%
        </div>
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-3">
          <div className="text-heading-3 text-white font-semibold leading-tight">{result.location.name}</div>
          <div className="flex items-center gap-2 mt-1">
            <SensorChip type={result.sensorType} size="sm" />
            <span className="font-mono text-caption" style={{ color: simColor }}>{result.similarityScore.toFixed(1)}% match</span>
            <span className="font-mono text-caption text-text-tertiary">· {result.resolution}</span>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex flex-shrink-0" style={{ borderBottom: '1px solid rgba(45,55,72,0.28)', background: 'rgba(10,15,26,0.7)' }}>
        {TABS.map((tab) => {
          const Icon = tab.icon
          const active = activeTab === tab.id
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-caption transition-all relative"
              style={{ color: active ? '#3B82F6' : '#64748B' }}>
              <Icon className="w-3 h-3" />
              {tab.label}
              {active && (
                <motion.div layoutId="tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5"
                  style={{ background: '#3B82F6' }} />
              )}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }} className="px-4 py-4 space-y-5">
              <OverviewTab result={result} onExplain={onExplain} />
            </motion.div>
          )}
          {activeTab === 'compare' && (
            <motion.div key="compare" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }} className="px-4 py-4 space-y-4">
              <CompareTab result={result} />
            </motion.div>
          )}
          {activeTab === 'timeline' && (
            <motion.div key="timeline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }} className="px-4 py-4 space-y-4">
              <TimelineTab result={result} />
            </motion.div>
          )}
          {activeTab === 'intel' && (
            <motion.div key="intel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }} className="px-4 py-4 space-y-4">
              <IntelTab result={result} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ── Overview tab (condensed metadata + explainability) ────────────────────────
function OverviewTab({ result, onExplain }: { result: RetrievalResult; onExplain: () => void }) {
  const addToCompare = useAppStore((s) => s.addToCompare)
  const sceneId  = getSceneId(result)
  const procTime = getProcessingDuration(result)
  const spatSim  = (1 - result.embeddingDistance) * 100

  const dimValues: Record<string, number> = {
    water:      result.featureSimilarity.water,
    vegetation: result.featureSimilarity.vegetation,
    terrain:    result.featureSimilarity.terrain,
    spatial:    spatSim,
    overall:    result.similarityScore,
  }

  return (
    <>
      {/* Scene metadata */}
      <div>
        <div className="overline-label mb-2.5">Scene Metadata</div>
        <div>
          {[
            { label: 'Scene ID',    value: sceneId,    icon: Hash,  mono: true },
            { label: 'Satellite',   value: result.satellite,        mono: false },
            { label: 'Sensor mode', value: result.acquisitionMode ?? result.sensorType, mono: false },
            { label: 'Resolution',  value: result.resolution,       mono: true  },
            { label: 'Bands',       value: result.bands ?? '—',     mono: false },
          ].map(({ label, value, icon: Icon, mono }) => (
            <div key={label} className="flex items-center justify-between py-2"
              style={{ borderBottom: '1px solid rgba(45,55,72,0.2)' }}>
              <div className="flex items-center gap-1.5">
                {Icon && <Icon className="w-3 h-3 text-text-tertiary" />}
                <span className="text-caption text-text-tertiary">{label}</span>
              </div>
              <span className={cn('text-body-s text-text-secondary font-medium', mono && 'font-mono text-caption')}>
                {value}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid rgba(45,55,72,0.2)' }}>
            <div className="flex items-center gap-1.5">
              <Cloud className="w-3 h-3 text-text-tertiary" />
              <span className="text-caption text-text-tertiary">Cloud cover</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-16 h-1 rounded-full" style={{ background: 'rgba(45,55,72,0.4)', overflow:'hidden' }}>
                <div className="h-full rounded-full" style={{ width: `${result.cloudCover}%`, background: result.cloudCover > 30 ? '#F59E0B' : '#22C55E' }} />
              </div>
              <span className="font-mono text-caption text-text-secondary">{result.cloudCover.toFixed(1)}%</span>
            </div>
          </div>
          <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid rgba(45,55,72,0.2)' }}>
            <div className="flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-text-tertiary" />
              <span className="text-caption text-text-tertiary">Acquired</span>
            </div>
            <span className="font-mono text-caption text-text-secondary">
              {new Date(result.timestamp).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })} UTC
            </span>
          </div>
          <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid rgba(45,55,72,0.2)' }}>
            <span className="text-caption text-text-tertiary">Archive</span>
            <span className="text-body-s text-text-secondary">{result.archiveSource}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-1.5">
              <Radio className="w-3 h-3 text-text-tertiary" />
              <span className="text-caption text-text-tertiary">Processing</span>
            </div>
            <span className="font-mono text-caption" style={{ color: '#14B8A6' }}>{procTime}</span>
          </div>
        </div>
      </div>

      {/* Geolocation */}
      <div>
        <div className="overline-label mb-2.5">Geolocation</div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />
            <span className="text-body-s text-text-secondary">{result.location.name}</span>
          </div>
          <CoordinateDisplay coords={result.location.coords} />
        </div>
      </div>

      {/* Explainable retrieval */}
      <div>
        <div className="overline-label mb-3">Similarity Evidence</div>
        <div className="space-y-3.5">
          {EXPLAIN_DIMS.map((dim, i) => {
            const value = dimValues[dim.key] ?? 0
            return (
              <motion.div key={dim.key} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.055 }}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <dim.icon className="w-3 h-3 flex-shrink-0" style={{ color: dim.color }} />
                    <span className="text-caption text-text-secondary">{dim.label}</span>
                  </div>
                  <span className="font-mono text-caption font-semibold" style={{ color: dim.color }}>{value.toFixed(0)}%</span>
                </div>
                <div className="h-1 rounded-full mb-1" style={{ background: 'rgba(45,55,72,0.45)', overflow:'hidden' }}>
                  <motion.div className="h-full rounded-full" initial={{ width: 0 }}
                    animate={{ width: `${value}%` }} transition={{ duration: 0.65, delay: i * 0.055 + 0.08 }}
                    style={{ background: dim.color }} />
                </div>
                <div className="text-overline text-text-tertiary">{dim.desc}</div>
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1 pb-2">
        <button onClick={onExplain}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-body-s font-medium"
          style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.28)', color: '#3B82F6' }}>
          <Eye className="w-3.5 h-3.5" />
          Deep Explain
        </button>
        <button onClick={() => addToCompare(result.id)}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-body-s font-medium"
          style={{ background: 'rgba(26,35,51,0.7)', border: '1px solid rgba(45,55,72,0.45)', color: '#94A3B8' }}>
          <GitCompare className="w-3.5 h-3.5" />
          Compare
        </button>
        <button className="flex items-center justify-center p-2.5 rounded-md"
          style={{ background: 'rgba(26,35,51,0.7)', border: '1px solid rgba(45,55,72,0.45)', color: '#64748B' }}>
          <Pin className="w-3.5 h-3.5" />
        </button>
      </div>
    </>
  )
}

// ── Compare tab (swipe comparison: query vs result) ───────────────────────────
function CompareTab({ result }: { result: RetrievalResult }) {
  const [pos, setPos] = useState(50)

  return (
    <>
      <div>
        <div className="overline-label mb-1">Cross-Modal Comparison</div>
        <div className="text-caption text-text-tertiary mb-3">
          SAR query (left) ↔ {result.sensorType} result (right) · Drag divider to compare
        </div>

        {/* Swipe comparison */}
        <div className="relative rounded-lg overflow-hidden select-none" style={{ height: 220, touchAction: 'none' }}>
          {/* Result image (right / back) */}
          <img src={result.thumbnailUrl} alt="Result"
            className="absolute inset-0 w-full h-full object-cover"
            style={{
              filter: result.sensorType === 'SAR'
                ? 'grayscale(1) brightness(0.82) contrast(1.35)'
                : result.sensorType === 'Multispectral'
                  ? 'saturate(1.3) hue-rotate(185deg) brightness(0.88) contrast(1.1)'
                  : 'saturate(0.7) brightness(0.92) contrast(1.05)',
            }} />

          {/* Query image (left / front) — clipped, SAR appearance */}
          <div className="absolute inset-0 overflow-hidden" style={{ width: `${pos}%` }}>
            <img src={QUERY_IMAGE_URL} alt="Query"
              className="absolute inset-0 h-full object-cover"
              style={{ width: `${10000 / pos}%`, maxWidth: 'none', filter: 'grayscale(1) brightness(0.8) contrast(1.35)' }} />
            <div className="absolute inset-0" style={{ background: 'rgba(15,30,60,0.3)', mixBlendMode: 'multiply' }} />
          </div>

          {/* Divider line */}
          <div className="absolute top-0 bottom-0 pointer-events-none"
            style={{ left: `${pos}%`, width: 2, background: 'rgba(255,255,255,0.85)', transform: 'translateX(-50%)' }}>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.92)', boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
              <ArrowLeftRight className="w-4 h-4 text-gray-900" />
            </div>
          </div>

          {/* Range input overlay */}
          <input type="range" min="5" max="95" value={pos} onChange={(e) => setPos(+e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize" style={{ zIndex: 10 }} />

          {/* Labels */}
          <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded pointer-events-none"
            style={{ background: 'rgba(0,0,0,0.72)', border: '1px solid rgba(255,255,255,0.12)' }}>
            <span className="font-mono text-overline text-white">SAR Query</span>
          </div>
          <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded pointer-events-none"
            style={{ background: 'rgba(0,0,0,0.72)', border: '1px solid rgba(255,255,255,0.12)' }}>
            <span className="font-mono text-overline text-white">{result.sensorType} Result</span>
          </div>
        </div>
      </div>

      {/* Metadata comparison */}
      <div>
        <div className="overline-label mb-2">Scene Comparison</div>
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(45,55,72,0.28)' }}>
          <div className="grid grid-cols-3 gap-0" style={{ borderBottom: '1px solid rgba(45,55,72,0.28)', background: 'rgba(17,24,39,0.6)' }}>
            <div className="px-3 py-2 overline-label">Property</div>
            <div className="px-3 py-2 overline-label border-l" style={{ borderColor: 'rgba(45,55,72,0.28)' }}>Query</div>
            <div className="px-3 py-2 overline-label border-l" style={{ borderColor: 'rgba(45,55,72,0.28)' }}>Result #{result.rank}</div>
          </div>
          {[
            { prop: 'Sensor',    q: 'SAR · RISAT-2B',  r: result.sensorType + ' · ' + result.satellite.split(' ')[0] },
            { prop: 'Date',      q: '12 Sep 2024',       r: new Date(result.timestamp).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'2-digit' }) },
            { prop: 'Resolution',q: '3m GSD',            r: result.resolution },
            { prop: 'Cloud',     q: '0%',                r: result.cloudCover.toFixed(0) + '%' },
            { prop: 'Similarity',q: '—',                 r: result.similarityScore.toFixed(1) + '%', color: getSimilarityColor(result.similarityScore) },
          ].map(({ prop, q, r: rv, color }, i, arr) => (
            <div key={prop} className="grid grid-cols-3 gap-0"
              style={i < arr.length - 1 ? { borderBottom: '1px solid rgba(45,55,72,0.18)' } : {}}>
              <div className="px-3 py-2 text-caption text-text-tertiary">{prop}</div>
              <div className="px-3 py-2 font-mono text-caption text-text-secondary border-l" style={{ borderColor: 'rgba(45,55,72,0.18)' }}>{q}</div>
              <div className="px-3 py-2 font-mono text-caption border-l" style={{ borderColor: 'rgba(45,55,72,0.18)', color: color ?? '#94A3B8' }}>{rv}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Embedding space distance */}
      <div className="p-3 rounded-lg" style={{ background: 'rgba(20,184,166,0.06)', border: '1px solid rgba(20,184,166,0.2)' }}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-caption text-text-secondary font-medium">Embedding Space Distance</span>
          <span className="font-mono text-caption font-bold text-teal-primary">d = {result.embeddingDistance.toFixed(3)}</span>
        </div>
        <div className="h-1.5 rounded-full" style={{ background: 'rgba(45,55,72,0.4)', overflow: 'hidden' }}>
          <motion.div className="h-full rounded-full"
            initial={{ width: 0 }} animate={{ width: `${(1 - result.embeddingDistance) * 100}%` }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            style={{ background: '#14B8A6' }} />
        </div>
        <div className="text-overline text-text-tertiary mt-1.5">
          32-dim cross-modal embedding space (SatMAE-v1) · FAISS L2 Flat · cosine distance
        </div>
      </div>
    </>
  )
}

// ── Timeline tab (temporal evolution of AOI) ──────────────────────────────────
function TimelineTab({ result }: { result: RetrievalResult }) {
  const [frame, setFrame] = useState(4)
  const f = TEMPORAL_FRAMES[frame]
  const maxExtent = Math.max(...TEMPORAL_FRAMES.map(x => x.extent))

  return (
    <>
      <div>
        <div className="overline-label mb-1">Temporal Evolution</div>
        <div className="text-caption text-text-tertiary mb-3">
          AOI: {result.location.name} · Drag slider or click dates
        </div>

        {/* Main image display */}
        <div className="relative rounded-lg overflow-hidden" style={{ height: 190 }}>
          <AnimatePresence mode="wait">
            <motion.img key={frame} src={result.thumbnailUrl} alt={f.label}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: `brightness(${f.brightness}) ${result.sensorType === 'SAR' ? 'grayscale(50%)' : ''}` }} />
          </AnimatePresence>

          {/* NDWI overlay tint when flooded */}
          {f.ndwi > 0.5 && (
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: `rgba(37,99,235,${(f.ndwi - 0.5) * 0.35})` }} />
          )}

          <div className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(to top, rgba(8,13,22,0.9) 0%, transparent 55%)' }} />

          <div className="absolute bottom-0 left-0 right-0 px-3 pb-3 pointer-events-none">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-body-s text-white font-semibold">{f.label}</div>
                <div className="font-mono text-caption text-white/70">{f.date} 2024 · {f.sat}</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-caption font-bold" style={{ color: f.ndwi > 0.5 ? '#60A5FA' : '#22C55E' }}>
                  NDWI {f.ndwi.toFixed(2)}
                </div>
                <div className="font-mono text-caption text-white/60">CC {f.cloud}%</div>
              </div>
            </div>
          </div>

          {/* Frame badge */}
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded"
            style={{ background: 'rgba(0,0,0,0.72)', border: '1px solid rgba(255,255,255,0.12)' }}>
            <span className="font-mono text-overline text-white">{frame + 1} / {TEMPORAL_FRAMES.length}</span>
          </div>
        </div>
      </div>

      {/* Timeline scrubber */}
      <div>
        <input type="range" min="0" max={TEMPORAL_FRAMES.length - 1} step="1" value={frame}
          onChange={(e) => setFrame(+e.target.value)} className="w-full accent-blue-500 mb-2" />
        <div className="flex items-center justify-between">
          {TEMPORAL_FRAMES.map((t, i) => (
            <button key={i} onClick={() => setFrame(i)}
              className="flex flex-col items-center gap-0.5 transition-all"
              style={{ opacity: i === frame ? 1 : 0.45 }}>
              <div className="w-1.5 h-1.5 rounded-full"
                style={{ background: i === frame ? '#3B82F6' : 'rgba(45,55,72,0.7)', transform: i === frame ? 'scale(1.4)' : 'scale(1)' }} />
              <span className="font-mono" style={{ fontSize: 9, color: i === frame ? '#3B82F6' : '#64748B' }}>{t.date}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Flood extent bar chart */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="overline-label">Inundation Extent (km²)</div>
          <span className="font-mono text-caption font-bold" style={{ color: '#3B82F6' }}>{f.extent} km²</span>
        </div>
        <div className="flex items-end gap-1" style={{ height: 56 }}>
          {TEMPORAL_FRAMES.map((t, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
              <motion.div className="w-full rounded-sm"
                initial={{ height: 0 }}
                animate={{ height: `${(t.extent / maxExtent) * 44}px` }}
                transition={{ duration: 0.5, delay: i * 0.05 }}
                style={{
                  background: i === frame ? '#3B82F6' : 'rgba(59,130,246,0.25)',
                  minHeight: 3,
                  borderRadius: '2px 2px 0 0',
                }} />
              {i === frame && (
                <span className="font-mono text-overline text-blue-primary">{t.extent}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* NDWI trend */}
      <div>
        <div className="overline-label mb-2">NDWI Trend</div>
        <div className="flex items-center gap-2">
          {TEMPORAL_FRAMES.map((t, i) => (
            <div key={i} className="flex-1">
              <div className="h-1 rounded-full" style={{ background: 'rgba(45,55,72,0.4)', overflow: 'hidden' }}>
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${t.ndwi * 100}%`, background: i === frame ? '#3B82F6' : 'rgba(59,130,246,0.4)' }} />
              </div>
              <div className="text-overline font-mono mt-0.5 text-center"
                style={{ fontSize: 8, color: i === frame ? '#3B82F6' : '#4A5568' }}>
                {t.ndwi.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1 mt-2">
          {f.ndwi > TEMPORAL_FRAMES[0].ndwi
            ? <TrendingUp className="w-3 h-3 text-red-400" />
            : <TrendingDown className="w-3 h-3 text-green-400" />}
          <span className="text-caption text-text-secondary">
            NDWI {f.ndwi > TEMPORAL_FRAMES[0].ndwi ? '+' : ''}{(f.ndwi - TEMPORAL_FRAMES[0].ndwi).toFixed(2)} vs pre-event baseline
          </span>
        </div>
      </div>
    </>
  )
}

// ── Intel tab (change detection + anomaly analysis) ───────────────────────────
function IntelTab({ result }: { result: RetrievalResult }) {
  const anomalyScore = 8.7

  return (
    <>
      {/* Change detection visualization */}
      <div>
        <div className="overline-label mb-1">Change Detection</div>
        <div className="text-caption text-text-tertiary mb-2">
          Compared to 2023 seasonal baseline · {result.sensorType} SAR amplitude
        </div>
        <div className="relative rounded-lg overflow-hidden" style={{ height: 185 }}>
          <img src={result.thumbnailUrl} alt="Change detection"
            className="w-full h-full object-cover"
            style={{ filter: result.sensorType === 'SAR' ? 'grayscale(50%) brightness(0.85)' : 'brightness(0.85)' }} />

          {/* Simulated change detection heat overlay */}
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse 60% 45% at 38% 62%, rgba(239,68,68,0.50) 0%, rgba(245,158,11,0.25) 45%, transparent 75%)' }} />
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse 30% 25% at 65% 35%, rgba(239,68,68,0.30) 0%, transparent 65%)' }} />

          {/* Change legend */}
          <div className="absolute top-2 right-2 space-y-1 pointer-events-none">
            {[
              { label: 'High Δ', color: 'rgba(239,68,68,0.85)' },
              { label: 'Med Δ',  color: 'rgba(245,158,11,0.85)' },
              { label: 'No Δ',   color: 'rgba(100,116,139,0.65)' },
            ].map(({ label, color }) => (
              <div key={label} className="flex items-center gap-1.5 px-2 py-0.5 rounded"
                style={{ background: 'rgba(0,0,0,0.65)' }}>
                <div className="w-2 h-2 rounded-sm" style={{ background: color }} />
                <span className="font-mono text-overline text-white">{label}</span>
              </div>
            ))}
          </div>

          <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded pointer-events-none"
            style={{ background: 'rgba(239,68,68,0.85)', border: '1px solid rgba(255,255,255,0.15)' }}>
            <span className="font-mono text-overline text-white font-bold">CHANGE DETECTED</span>
          </div>
        </div>
      </div>

      {/* Delta metrics */}
      <div>
        <div className="overline-label mb-2">Spectral Δ Metrics vs 2023 Baseline</div>
        <div className="space-y-0">
          {CHANGE_METRICS.map((m, i) => (
            <div key={m.label} className="flex items-center gap-3 py-2"
              style={i < CHANGE_METRICS.length - 1 ? { borderBottom: '1px solid rgba(45,55,72,0.2)' } : {}}>
              <div className="flex-1 min-w-0">
                <div className="text-caption text-text-secondary">{m.label}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="font-mono text-overline text-text-tertiary">{m.before}</span>
                  <span className="text-overline text-text-tertiary">→</span>
                  <span className="font-mono text-overline text-text-secondary">{m.after}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {m.up ? <TrendingUp className="w-3 h-3" style={{ color: m.color }} /> : <TrendingDown className="w-3 h-3" style={{ color: m.color }} />}
                <span className="font-mono text-caption font-semibold" style={{ color: m.color }}>{m.delta}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Anomaly score */}
      <div className="p-3 rounded-lg" style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)' }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            <span className="text-caption text-text-secondary font-medium">Anomaly Score</span>
          </div>
          <span className="font-mono text-caption font-bold text-red-400">{anomalyScore}/10 · HIGH</span>
        </div>
        <div className="h-1.5 rounded-full mb-2" style={{ background: 'rgba(45,55,72,0.4)', overflow: 'hidden' }}>
          <motion.div className="h-full rounded-full" initial={{ width: 0 }}
            animate={{ width: `${anomalyScore * 10}%` }} transition={{ duration: 0.8, ease: 'easeOut' }}
            style={{ background: 'linear-gradient(to right, #F59E0B, #EF4444)' }} />
        </div>
        <div className="space-y-1">
          {[
            'SAR backscatter anomaly exceeds 3σ detection threshold',
            'NDWI 0.62 classified as active inundation (threshold: 0.50)',
            '94.1% similarity to 2022 Brahmaputra flood event',
          ].map((reason, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <div className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ background: '#EF4444' }} />
              <span className="text-overline text-text-secondary leading-relaxed">{reason}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Processing lineage */}
      <div>
        <div className="overline-label mb-2">Processing Lineage</div>
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(45,55,72,0.28)' }}>
          {[
            { stage: 'Raw Ingest',       level: 'L0',  status: 'complete', src: 'ISTRAC Bangalore' },
            { stage: 'Radiometric Cal.', level: 'L1A', status: 'complete', src: 'NRSC ISRO'         },
            { stage: 'Geometric Corr.',  level: 'L1B', status: 'complete', src: 'NRSC ISRO'         },
            { stage: 'ML Embed.',        level: 'L2',  status: 'complete', src: 'AKSHA v2.4'        },
          ].map(({ stage, level, status, src }, i, arr) => (
            <div key={stage} className="flex items-center gap-3 px-3 py-2"
              style={i < arr.length - 1 ? { borderBottom: '1px solid rgba(45,55,72,0.18)' } : {}}>
              <span className="font-mono text-overline px-1.5 py-0.5 rounded flex-shrink-0"
                style={{ background: 'rgba(20,184,166,0.12)', color: '#14B8A6', border: '1px solid rgba(20,184,166,0.2)' }}>
                {level}
              </span>
              <span className="text-caption text-text-secondary flex-1">{stage}</span>
              <span className="font-mono text-overline text-text-tertiary">{src}</span>
              <Layers className="w-3 h-3 text-text-tertiary" style={{ color: '#22C55E' }} />
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pb-2">
        <button className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-body-s font-medium"
          style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.28)', color: '#3B82F6' }}>
          <BarChart3 className="w-3.5 h-3.5" />
          Full Analysis Report
        </button>
        <button className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-body-s font-medium"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#EF4444' }}>
          <AlertTriangle className="w-3.5 h-3.5" />
          Raise Alert
        </button>
      </div>
    </>
  )
}
