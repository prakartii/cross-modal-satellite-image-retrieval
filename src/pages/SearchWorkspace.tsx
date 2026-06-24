import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, SlidersHorizontal, Database, Activity,
  Satellite, Clock, Zap, AlertTriangle, Waves,
  Leaf, Building2, CheckCircle2, ChevronRight,
  Brain, Timer, BarChart3, FlameKindling,
} from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import EarthGlobe from '@/components/earth/EarthGlobe'
import UploadZone from '@/components/search/UploadZone'
import ProcessingPipeline from '@/components/search/ProcessingPipeline'
import MissionReportPanel from '@/components/intelligence/MissionReport'
import { archiveStats } from '@/data/mockResults'
import { acquisitionQueue } from '@/data/satellites'
import type { QueryImage } from '@/types'

const MODALITIES = [
  { id: 'cross',    label: 'Cross-Modal',   desc: 'SAR ↔ Optical ↔ Multispectral' },
  { id: 'same',     label: 'Same-Sensor',   desc: 'Match within sensor type'       },
  { id: 'temporal', label: 'Temporal Seq.', desc: 'Same AOI, multi-date'           },
]

const RECENT_QUERIES = [
  { id: 'q1', scene: 'RISAT-2B_SAR_240912', region: 'Brahmaputra Basin', match: '94.2%', ago: '2h',  sensor: 'SAR'     },
  { id: 'q2', scene: 'S2A_MSI_240901',      region: 'Kaziranga Assam',   match: '88.1%', ago: '6h',  sensor: 'Optical' },
  { id: 'q3', scene: 'CART3_PAN_240820',    region: 'Delhi NCR',         match: '91.7%', ago: '1d',  sensor: 'Optical' },
]

const SENSOR_STATS = [
  { name: 'Optical',       count: 1_247_891, pct: 50.2, color: '#22C55E' },
  { name: 'SAR',           count: 891_234,   pct: 35.9, color: '#3B82F6' },
  { name: 'Multispectral', count: 344_787,   pct: 13.9, color: '#F59E0B' },
]

const QUERY_CAPABILITIES = [
  { label: 'Cross-Modal',  desc: 'SAR ↔ Optical ↔ Multi',  color: '#3B82F6' },
  { label: 'Temporal',     desc: 'Multi-year archive',       color: '#14B8A6' },
  { label: 'Semantic',     desc: 'FAISS vector search',      color: '#22C55E' },
  { label: 'Geospatial',   desc: 'WGS84 AOI / polygon',     color: '#F59E0B' },
]

// ── Intelligence panel mock data (derived from SAR of Brahmaputra Basin) ──
const DETECTED_FEATURES = [
  { label: 'Open Water Extent',     value: '342.6 km²',   confidence: 91.4, metric: 'σ⁰ −15.2 to −22.4 dB',    color: '#3B82F6', icon: Waves       },
  { label: 'Flood Inundation Zone', value: '89.3 km above bsl', confidence: 87.2, metric: 'Δ +312% vs 3-yr median', color: '#60A5FA', icon: AlertTriangle },
  { label: 'Riparian Modification', value: 'NDWI 0.62',   confidence: 83.1, metric: '−41% vegetation vs 2023',  color: '#22C55E', icon: Leaf         },
  { label: 'Settlement Exposure',   value: '47 villages', confidence: 76.8, metric: 'within 2 km boundary',     color: '#F59E0B', icon: Building2    },
  { label: 'Infrastructure Risk',   value: '3 segments',  confidence: 69.2, metric: 'road/rail submerged',      color: '#EF4444', icon: FlameKindling },
]

const HISTORICAL_MATCHES = [
  { date: 'Aug 2022', event: 'Brahmaputra Mega-Flood',   similarity: 94.1, satellite: 'RISAT-2B',    type: 'SAR'     },
  { date: 'Jun 2020', event: 'Assam Flood Season',       similarity: 88.7, satellite: 'Sentinel-1A', type: 'SAR'     },
  { date: 'Jul 2019', event: 'NE India Inundation',      similarity: 82.3, satellite: 'ALOS-2',      type: 'SAR'     },
]

const ACQUISITION_HISTORY = [
  { date: '24 Jun 2024', sat: 'RISAT-2B',    mode: 'SAR ScanSAR',  cloud: 0,  current: true  },
  { date: '18 Jun 2024', sat: 'Sentinel-1A', mode: 'IW GRDH',      cloud: 0,  current: false },
  { date: '12 Jun 2024', sat: 'Cartosat-3',  mode: 'PAN Mono',     cloud: 12, current: false },
  { date: '05 Jun 2024', sat: 'Sentinel-2A', mode: 'MSI L2A',      cloud: 34, current: false },
  { date: '28 May 2024', sat: 'Landsat-9',   mode: 'OLI TIRS',     cloud: 67, current: false },
]

const MODEL_STEPS = [
  { step: 1, label: 'SAR Feature Extraction',  detail: 'ResNet-50 backbone · 512-dim embedding space', ms: 180 },
  { step: 2, label: 'Cross-Modal Projection',  detail: 'SAR→Optical alignment via contrastive MLP',    ms: 140 },
  { step: 3, label: 'Archive HNSW Search',     detail: 'k=50 in 2.48M scene FAISS index',             ms: 310 },
  { step: 4, label: 'Geo-Semantic Re-rank',    detail: 'Temporal coherence + spatial overlap weight',  ms: 110 },
]

export default function SearchWorkspace() {
  const pipelineStage  = useAppStore((s) => s.pipelineStage)
  const isSearching    = useAppStore((s) => s.isSearching)
  const searchComplete = useAppStore((s) => s.searchComplete)
  const uploadedImage  = useAppStore((s) => s.uploadedImage)
  const [selModality, setSelModality] = useState('cross')
  const [resultCount, setResultCount] = useState(10)

  const isIdle = pipelineStage === 'idle'
  const showIntelPanel = !!uploadedImage

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left: search configuration ──────────────────────── */}
      <motion.div initial={{ x: -16, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className="w-88 flex-shrink-0 flex flex-col overflow-y-auto scrollbar-hide"
        style={{ background: 'rgba(10,15,26,0.97)', borderRight: '1px solid rgba(45,55,72,0.35)' }}>

        <div className="px-6 pt-6 pb-5" style={{ borderBottom: '1px solid rgba(45,55,72,0.3)' }}>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.22)' }}>
              <Upload className="w-3.5 h-3.5 text-blue-primary" />
            </div>
            <h1 className="text-heading-3 text-text-primary font-semibold">Intelligence Search</h1>
          </div>
          <p className="text-caption text-text-tertiary leading-relaxed">
            Cross-modal retrieval · ISRO Bhuvan · 2.48M indexed scenes
          </p>
        </div>

        <div className="p-5 space-y-6 flex-1">
          <div>
            <div className="overline-label mb-2.5">Query Image</div>
            <UploadZone />
          </div>

          <div>
            <div className="overline-label mb-2.5">Search Modality</div>
            <div>
              {MODALITIES.map((m, i) => (
                <label key={m.id} className="flex items-start gap-3 py-2.5 cursor-pointer group"
                  style={{ borderBottom: i < MODALITIES.length - 1 ? '1px solid rgba(45,55,72,0.22)' : 'none' }}>
                  <input type="radio" name="modality" checked={selModality === m.id}
                    onChange={() => setSelModality(m.id)} className="mt-0.5 accent-blue-primary flex-shrink-0" />
                  <div>
                    <div className="text-body-s text-text-primary font-medium">{m.label}</div>
                    <div className="text-caption text-text-tertiary mt-0.5">{m.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="overline-label mb-2.5">Geographic Scope</div>
            <div className="space-y-2">
              {['Global archive', 'India subcontinent', 'Define AOI on Earth'].map((opt, i) => (
                <label key={opt} className="flex items-center gap-3 cursor-pointer">
                  <input type="radio" name="scope" defaultChecked={i === 0} className="accent-blue-primary" />
                  <span className="text-body-s text-text-secondary">{opt}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2.5">
              <div className="overline-label">Parameters</div>
              <button className="flex items-center gap-1 text-caption text-blue-primary hover:text-blue-dim transition-colors">
                <SlidersHorizontal className="w-3 h-3" />Advanced
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-body-s text-text-secondary">Cloud cover max</span>
                  <span className="font-mono text-caption text-text-secondary">50%</span>
                </div>
                <input type="range" min="0" max="100" defaultValue="50" className="w-full accent-blue-primary" />
              </div>
              <div>
                <div className="overline-label mb-2">Result count</div>
                <div className="flex gap-1.5">
                  {[5, 10, 20, 50].map((n) => (
                    <button key={n} onClick={() => setResultCount(n)}
                      className="flex-1 py-1.5 rounded-md text-body-s transition-all"
                      style={n === resultCount
                        ? { background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)', color: '#3B82F6' }
                        : { background: 'transparent', border: '1px solid rgba(45,55,72,0.5)', color: '#64748B' }}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="overline-label mb-2.5">Recent Queries</div>
            {RECENT_QUERIES.map((q, i) => (
              <div key={q.id} className="flex items-center gap-3 py-2.5 cursor-pointer hover:bg-white-3 -mx-1 px-1 rounded transition-colors"
                style={i < RECENT_QUERIES.length - 1 ? { borderBottom: '1px solid rgba(45,55,72,0.2)' } : {}}>
                <Clock className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-caption text-text-secondary truncate">{q.scene}</div>
                  <div className="text-overline text-text-tertiary mt-0.5 truncate">{q.region} · {q.sensor}</div>
                </div>
                <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                  <span className="font-mono text-caption text-teal-primary">{q.match}</span>
                  <span className="text-overline text-text-tertiary">{q.ago}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ── Center: Earth + pipeline + idle overlays ─────────── */}
      <div className="flex-1 relative overflow-hidden">
        <div className="absolute inset-0 transition-opacity duration-500" style={{ opacity: isSearching ? 0.35 : 1 }}>
          <EarthGlobe />
        </div>

        {/* Mission report overlay (after pipeline complete) */}
        <MissionReportPanel />

        <AnimatePresence>
          {isSearching && (
            <motion.div key="pipeline" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="w-full max-w-xl mx-8 rounded-xl pointer-events-auto"
                style={{ background: 'rgba(8,13,22,0.96)', border: '1px solid rgba(45,55,72,0.45)', boxShadow: '0 24px 80px rgba(0,0,0,0.8)' }}>
                <ProcessingPipeline />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Idle overlays — only when no image loaded */}
        {isIdle && !uploadedImage && (
          <>
            <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }} className="absolute top-4 right-4 z-10" style={{ width: 220 }}>
              <div className="rounded-xl overflow-hidden"
                style={{ background: 'rgba(9,13,22,0.92)', border: '1px solid rgba(45,55,72,0.4)' }}>
                <div className="px-4 py-2.5 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(45,55,72,0.25)' }}>
                  <Database className="w-3.5 h-3.5 text-blue-primary" />
                  <span className="overline-label">Archive Intelligence</span>
                </div>
                <div className="px-4 py-3">
                  <div className="flex items-baseline gap-1.5 mb-1">
                    <span className="font-mono font-bold text-heading-3 text-text-primary">
                      {(archiveStats.totalObservations / 1_000_000).toFixed(2)}M
                    </span>
                    <span className="text-caption text-text-tertiary">indexed</span>
                  </div>
                  <div className="flex items-center gap-1.5 mb-3">
                    <div className="status-live" style={{ width: 5, height: 5 }} />
                    <span className="font-mono text-caption text-teal-primary">127 scenes/hr ingest</span>
                  </div>
                  {SENSOR_STATS.map((s, i) => (
                    <div key={s.name} className="flex items-center justify-between py-1.5"
                      style={i < SENSOR_STATS.length - 1 ? { borderBottom: '1px solid rgba(45,55,72,0.18)' } : {}}>
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
                        <span className="text-caption text-text-secondary">{s.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="h-1 rounded-full" style={{ width: Math.round(s.pct * 0.6), background: s.color, opacity: 0.45 }} />
                        <span className="font-mono text-caption" style={{ color: s.color }}>{s.pct}%</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-2" style={{ borderTop: '1px solid rgba(45,55,72,0.2)', background: 'rgba(17,24,39,0.4)' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-overline text-text-tertiary">Coverage</span>
                    <span className="font-mono text-caption text-text-secondary">510M km² Earth</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-overline text-text-tertiary">Last ingest</span>
                    <span className="font-mono text-caption text-text-secondary">14:32:07 UTC</span>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.55 }} className="absolute bottom-24 right-4 z-10" style={{ width: 220 }}>
              <div className="rounded-xl overflow-hidden"
                style={{ background: 'rgba(9,13,22,0.92)', border: '1px solid rgba(45,55,72,0.4)' }}>
                <div className="px-4 py-2.5 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(45,55,72,0.25)' }}>
                  <Zap className="w-3.5 h-3.5 text-teal-primary" />
                  <span className="overline-label">Search Capabilities</span>
                </div>
                {QUERY_CAPABILITIES.map((cap, i) => (
                  <div key={cap.label} className="px-4 py-2.5 flex items-center gap-3"
                    style={i < QUERY_CAPABILITIES.length - 1 ? { borderBottom: '1px solid rgba(45,55,72,0.18)' } : {}}>
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cap.color }} />
                    <div className="flex-1">
                      <div className="text-caption text-text-secondary font-medium">{cap.label}</div>
                      <div className="text-overline text-text-tertiary mt-0.5">{cap.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.65 }} className="absolute bottom-24 left-4 z-10" style={{ width: 220 }}>
              <div className="rounded-xl overflow-hidden"
                style={{ background: 'rgba(9,13,22,0.92)', border: '1px solid rgba(45,55,72,0.4)' }}>
                <div className="px-4 py-2.5 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(45,55,72,0.25)' }}>
                  <Satellite className="w-3.5 h-3.5 text-yellow-400" />
                  <span className="overline-label">Next Acquisitions</span>
                </div>
                {acquisitionQueue.slice(0, 3).map((aq, i) => (
                  <div key={aq.sceneId} className="px-4 py-2.5 flex items-center gap-2.5"
                    style={i < 2 ? { borderBottom: '1px solid rgba(45,55,72,0.18)' } : {}}>
                    <div className="w-1 h-1 rounded-full flex-shrink-0 mt-0.5"
                      style={{ background: aq.priority === 'HIGH' ? '#EF4444' : '#64748B' }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-caption text-text-secondary font-medium" style={{ fontSize: 10.5 }}>{aq.satellite}</div>
                      <div className="text-overline text-text-tertiary truncate">{aq.region} · {aq.mode}</div>
                    </div>
                    <span className="font-mono text-overline flex-shrink-0"
                      style={{ color: aq.eta === 'NOW' ? '#14B8A6' : aq.priority === 'HIGH' ? '#EF4444' : '#64748B' }}>
                      {aq.eta}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}
              className="absolute bottom-24 left-1/2 -translate-x-1/2 pointer-events-none z-10">
              <div className="px-5 py-2.5 rounded-lg flex items-center gap-2"
                style={{ background: 'rgba(10,15,26,0.9)', border: '1px solid rgba(45,55,72,0.35)' }}>
                <Activity className="w-3.5 h-3.5 text-blue-primary" />
                <p className="text-body-s text-text-tertiary whitespace-nowrap">
                  Upload a scene to begin cross-modal retrieval
                </p>
              </div>
            </motion.div>
          </>
        )}
      </div>

      {/* ── Right: Scene Intelligence Panel (when image loaded) ── */}
      <AnimatePresence>
        {showIntelPanel && isIdle && (
          <motion.div
            initial={{ opacity: 0, x: 272 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 272 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            className="flex-shrink-0 flex flex-col overflow-y-auto scrollbar-thin"
            style={{ width: 272, borderLeft: '1px solid rgba(45,55,72,0.35)', background: 'rgba(8,12,22,0.99)' }}>
            <SceneIntelligencePanel image={uploadedImage!} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Scene Intelligence Panel ─────────────────────────────────────────────────

function SceneIntelligencePanel({ image }: { image: QueryImage }) {
  const totalMs = MODEL_STEPS.reduce((s, x) => s + x.ms, 0)
  const riskScore = 94.1

  return (
    <div>
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(45,55,72,0.35)', background: 'rgba(12,18,32,0.8)' }}>
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Brain className="w-3.5 h-3.5 text-blue-primary" />
            <span className="text-body-s text-text-primary font-semibold">Scene Intelligence</span>
          </div>
          <div className="font-mono text-caption text-text-tertiary">Model v2.4 · AKSHA-SAR</div>
        </div>
        <div className="px-2 py-1 rounded font-mono text-caption font-bold"
          style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#EF4444' }}>
          FLOOD RISK
        </div>
      </div>

      <div className="p-4 space-y-5">

        {/* Image Metadata */}
        <div>
          <div className="overline-label mb-2">Scene Metadata</div>
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(45,55,72,0.28)' }}>
            {[
              { label: 'Scene ID',      value: 'R2B-20240912-18924' },
              { label: 'Sensor',        value: image.sensorType + ' · ' + (image.satellite ?? '—') },
              { label: 'Resolution',    value: image.resolution ?? '3m GSD' },
              { label: 'Incidence',     value: '28.4°' },
              { label: 'Pol mode',      value: 'VV-VH dual-pol' },
              { label: 'Acquired',      value: '2024-09-12 09:45 UTC' },
            ].map(({ label, value }, i, arr) => (
              <div key={label} className="flex items-center justify-between px-3 py-2"
                style={i < arr.length - 1 ? { borderBottom: '1px solid rgba(45,55,72,0.18)' } : {}}>
                <span className="text-caption text-text-tertiary">{label}</span>
                <span className="font-mono text-caption text-text-secondary">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Detected Features */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="overline-label">Detected Features</div>
            <span className="font-mono text-overline" style={{ color: '#14B8A6' }}>5 / 5</span>
          </div>
          <div className="space-y-3">
            {DETECTED_FEATURES.map((feat, i) => {
              const Icon = feat.icon
              return (
                <motion.div key={feat.label}
                  initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.07 }}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Icon className="w-3 h-3 flex-shrink-0" style={{ color: feat.color }} />
                      <span className="text-caption text-text-secondary truncate">{feat.label}</span>
                    </div>
                    <span className="font-mono text-caption font-bold ml-2 flex-shrink-0" style={{ color: feat.color }}>
                      {feat.confidence.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1 rounded-full mb-1" style={{ background: 'rgba(45,55,72,0.4)', overflow: 'hidden' }}>
                    <motion.div className="h-full rounded-full"
                      initial={{ width: 0 }} animate={{ width: `${feat.confidence}%` }}
                      transition={{ duration: 0.7, delay: i * 0.07 + 0.1, ease: 'easeOut' }}
                      style={{ background: feat.color }} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-overline" style={{ color: feat.color, opacity: 0.85 }}>{feat.value}</span>
                    <span className="text-overline text-text-tertiary">{feat.metric}</span>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>

        {/* Flood Risk Assessment */}
        <div>
          <div className="overline-label mb-2">Flood Risk Assessment</div>
          <div className="rounded-xl p-4" style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-mono text-3xl font-bold" style={{ color: '#EF4444', lineHeight: 1 }}>
                  {riskScore.toFixed(0)}
                </div>
                <div className="text-overline text-text-tertiary mt-0.5">/ 100</div>
              </div>
              <div className="text-right">
                <div className="text-caption font-bold" style={{ color: '#EF4444' }}>CRITICAL</div>
                <div className="text-overline text-text-tertiary mt-0.5">Confidence 91.4%</div>
              </div>
            </div>
            {/* Risk gauge bar */}
            <div className="h-2 rounded-full mb-3" style={{ background: 'rgba(45,55,72,0.5)', overflow: 'hidden' }}>
              <motion.div className="h-full rounded-full"
                initial={{ width: 0 }} animate={{ width: `${riskScore}%` }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
                style={{ background: 'linear-gradient(to right, #F59E0B, #EF4444)' }} />
            </div>
            <div className="space-y-1.5">
              {[
                'SAR backscatter anomaly exceeds 3σ threshold',
                'NDWI 0.62 classified as INUNDATION',
                '94.1% match to 2022 Brahmaputra event',
              ].map((reason, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <AlertTriangle className="w-3 h-3 text-red-400 flex-shrink-0 mt-0.5" />
                  <span className="text-overline text-text-secondary leading-relaxed">{reason}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Historical Event Analogues */}
        <div>
          <div className="overline-label mb-2">Historical Analogues</div>
          <div className="space-y-1">
            {HISTORICAL_MATCHES.map((evt, i) => (
              <div key={i} className="flex items-center gap-3 py-2"
                style={i < HISTORICAL_MATCHES.length - 1 ? { borderBottom: '1px solid rgba(45,55,72,0.2)' } : {}}>
                <div className="flex-1 min-w-0">
                  <div className="text-caption text-text-secondary font-medium truncate">{evt.event}</div>
                  <div className="font-mono text-overline text-text-tertiary">{evt.date} · {evt.satellite}</div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(45,55,72,0.4)', overflow: 'hidden' }}>
                    <div className="h-full rounded-full" style={{ width: `${evt.similarity}%`, background: '#3B82F6' }} />
                  </div>
                  <span className="font-mono text-caption font-semibold text-blue-primary">{evt.similarity.toFixed(1)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AOI Acquisition Timeline */}
        <div>
          <div className="overline-label mb-2">Acquisition Timeline</div>
          <div className="space-y-1">
            {ACQUISITION_HISTORY.map((acq, i) => (
              <div key={i} className="flex items-center gap-2.5 py-1.5"
                style={i < ACQUISITION_HISTORY.length - 1 ? { borderBottom: '1px solid rgba(45,55,72,0.15)' } : {}}>
                <div className="flex-shrink-0 flex items-center gap-1">
                  {acq.current
                    ? <div className="status-live" style={{ width: 6, height: 6 }} />
                    : <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(45,55,72,0.6)' }} />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-caption" style={{ color: acq.current ? '#14B8A6' : '#64748B' }}>{acq.date}</span>
                    {acq.current && <span className="text-overline" style={{ color: '#14B8A6' }}>← current</span>}
                  </div>
                  <div className="text-overline text-text-tertiary">{acq.sat} · {acq.mode}</div>
                </div>
                <div className="flex-shrink-0 font-mono text-overline"
                  style={{ color: acq.cloud === 0 ? '#22C55E' : acq.cloud > 30 ? '#EF4444' : '#F59E0B' }}>
                  {acq.cloud}% ☁
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Model Reasoning */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="overline-label">Model Reasoning</div>
            <div className="flex items-center gap-1">
              <Timer className="w-3 h-3 text-text-tertiary" />
              <span className="font-mono text-overline text-text-secondary">{totalMs}ms total</span>
            </div>
          </div>
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(45,55,72,0.28)' }}>
            {MODEL_STEPS.map((step, i) => (
              <div key={step.step} className="flex items-start gap-3 px-3 py-2.5"
                style={i < MODEL_STEPS.length - 1 ? { borderBottom: '1px solid rgba(45,55,72,0.18)' } : {}}>
                <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.22)' }}>
                  <span className="font-mono text-overline text-blue-primary">{step.step}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-caption text-text-secondary font-medium">{step.label}</div>
                  <div className="text-overline text-text-tertiary leading-relaxed mt-0.5">{step.detail}</div>
                </div>
                <span className="font-mono text-overline text-text-tertiary flex-shrink-0">{step.ms}ms</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-2 px-1">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-teal-primary" />
              <span className="text-overline text-text-secondary">All stages complete</span>
            </div>
            <div className="flex items-center gap-1">
              <BarChart3 className="w-3 h-3 text-text-tertiary" />
              <span className="font-mono text-overline" style={{ color: '#14B8A6' }}>p95: 1.2s</span>
            </div>
          </div>
        </div>

        {/* Begin search CTA hint */}
        <div className="flex items-start gap-2 p-3 rounded-lg"
          style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)' }}>
          <ChevronRight className="w-3.5 h-3.5 text-blue-primary flex-shrink-0 mt-0.5" />
          <p className="text-caption text-text-secondary leading-relaxed">
            Click <span className="text-blue-primary font-medium">Begin Intelligence Search</span> to retrieve cross-modal matches from 2.48M archive scenes.
          </p>
        </div>

        <div className="h-4" />
      </div>
    </div>
  )
}
