import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, SlidersHorizontal, Database, Activity,
  Satellite, Zap, AlertTriangle, Search, Info,
  FileImage, Cpu,
} from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import EarthGlobe from '@/components/earth/EarthGlobe'
import UploadZone from '@/components/search/UploadZone'
import ProcessingPipeline from '@/components/search/ProcessingPipeline'
import MissionReportPanel from '@/components/intelligence/MissionReport'
import { acquisitionQueue } from '@/data/satellites'
import type { QueryImage } from '@/types'

// Search modalities (describes query types, not fake results)
const MODALITIES = [
  { id: 'cross',    label: 'Cross-Modal',   desc: 'SAR ↔ Optical ↔ Multispectral' },
  { id: 'same',     label: 'Same-Sensor',   desc: 'Match within sensor type'       },
  { id: 'temporal', label: 'Temporal Seq.', desc: 'Same AOI, multi-date'           },
]

// Archive sensor distribution (system description, not retrieval results)
const SENSOR_STATS = [
  { name: 'Optical',       pct: 36, color: '#22C55E' },
  { name: 'SAR',           pct: 40, color: '#3B82F6' },
  { name: 'Multispectral', pct: 24, color: '#F59E0B' },
]

// System capability descriptions (informational, not results)
const QUERY_CAPABILITIES = [
  { label: 'Feature-based',  desc: '14-dim embedding search',    color: '#3B82F6' },
  { label: 'Cosine Search',  desc: 'Exact similarity from math', color: '#14B8A6' },
  { label: 'Multi-type',     desc: 'Flood, forest, urban, agri', color: '#22C55E' },
  { label: 'Re-ranked',      desc: 'Temporal + sensor context',  color: '#F59E0B' },
]

// Pipeline stage descriptions (for the "how it works" display)
const PIPELINE_STEPS = [
  { step: 1, label: 'Load & Validate',   detail: 'Open image, verify format and size',             ms: 12  },
  { step: 2, label: 'Resize + Normalize', detail: 'Resize to 512×512, pixels → [0,1] float',       ms: 18  },
  { step: 3, label: 'Feature Extraction', detail: 'Color stats, GLCM texture, Sobel edges, NDWI',  ms: 45  },
  { step: 4, label: 'Embedding',          detail: 'Weighted L2-normalize → 14-dim unit vector',     ms: 8   },
  { step: 5, label: 'Cosine Search',      detail: 'Dot product vs 50 archive embeddings',           ms: 2   },
  { step: 6, label: 'Re-ranking',         detail: 'Temporal decay + sensor compatibility',          ms: 3   },
]

export default function SearchWorkspace() {
  const pipelineStage  = useAppStore((s) => s.pipelineStage)
  const isSearching    = useAppStore((s) => s.isSearching)
  const searchComplete = useAppStore((s) => s.searchComplete)
  const uploadedImage  = useAppStore((s) => s.uploadedImage)
  const [selModality, setSelModality] = useState('cross')
  const [resultCount, setResultCount] = useState(10)

  const isIdle = pipelineStage === 'idle'
  const showIntelPanel = !!uploadedImage && isIdle

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
            Upload a satellite image to retrieve similar scenes by cosine similarity
          </p>
        </div>

        <div className="p-5 space-y-6 flex-1">
          {/* Upload zone — MUST upload before search runs */}
          <div>
            <div className="overline-label mb-2.5">Query Image</div>
            <UploadZone />
            {!uploadedImage && (
              <div className="mt-2 flex items-center gap-1.5 px-1">
                <Info className="w-3 h-3 text-text-tertiary flex-shrink-0" />
                <span className="text-overline text-text-tertiary">
                  Search is disabled until an image is uploaded
                </span>
              </div>
            )}
          </div>

          {/* Search modality */}
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

          {/* Geographic scope */}
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

          {/* Result count */}
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

        {/* Idle overlays — shown when no image is uploaded yet */}
        {isIdle && !uploadedImage && (
          <>
            {/* Archive info panel */}
            <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }} className="absolute top-4 right-4 z-10" style={{ width: 220 }}>
              <div className="rounded-xl overflow-hidden"
                style={{ background: 'rgba(9,13,22,0.92)', border: '1px solid rgba(45,55,72,0.4)' }}>
                <div className="px-4 py-2.5 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(45,55,72,0.25)' }}>
                  <Database className="w-3.5 h-3.5 text-blue-primary" />
                  <span className="overline-label">Archive Database</span>
                </div>
                <div className="px-4 py-3">
                  <div className="flex items-baseline gap-1.5 mb-1">
                    <span className="font-mono font-bold text-heading-3 text-text-primary">50</span>
                    <span className="text-caption text-text-tertiary">indexed scenes</span>
                  </div>
                  <div className="flex items-center gap-1.5 mb-3">
                    <div className="status-live" style={{ width: 5, height: 5 }} />
                    <span className="font-mono text-caption text-teal-primary">14-dim embeddings</span>
                  </div>
                  {SENSOR_STATS.map((s, i) => (
                    <div key={s.name} className="flex items-center justify-between py-1.5"
                      style={i < SENSOR_STATS.length - 1 ? { borderBottom: '1px solid rgba(45,55,72,0.18)' } : {}}>
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
                        <span className="text-caption text-text-secondary">{s.name}</span>
                      </div>
                      <span className="font-mono text-caption" style={{ color: s.color }}>{s.pct}%</span>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-2" style={{ borderTop: '1px solid rgba(45,55,72,0.2)', background: 'rgba(17,24,39,0.4)' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-overline text-text-tertiary">Regions</span>
                    <span className="font-mono text-caption text-text-secondary">India, Bangladesh</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-overline text-text-tertiary">Date range</span>
                    <span className="font-mono text-caption text-text-secondary">2018–2024</span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Pipeline method panel */}
            <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.55 }} className="absolute bottom-24 right-4 z-10" style={{ width: 220 }}>
              <div className="rounded-xl overflow-hidden"
                style={{ background: 'rgba(9,13,22,0.92)', border: '1px solid rgba(45,55,72,0.4)' }}>
                <div className="px-4 py-2.5 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(45,55,72,0.25)' }}>
                  <Zap className="w-3.5 h-3.5 text-teal-primary" />
                  <span className="overline-label">Pipeline Method</span>
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

            {/* Next acquisitions panel */}
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

            {/* Upload prompt */}
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

      {/* ── Right: Scene Ready Panel (when image loaded, before search) ── */}
      <AnimatePresence>
        {showIntelPanel && (
          <motion.div
            initial={{ opacity: 0, x: 272 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 272 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            className="flex-shrink-0 flex flex-col overflow-y-auto scrollbar-thin"
            style={{ width: 272, borderLeft: '1px solid rgba(45,55,72,0.35)', background: 'rgba(8,12,22,0.99)' }}>
            <SceneReadyPanel image={uploadedImage!} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Scene Ready Panel ─────────────────────────────────────────────────────────
// Shows after the user uploads an image, before they run the search.
// Displays only information that can be determined from the file itself
// (filename, size, inferred sensor type) — no mock intelligence data.

function SceneReadyPanel({ image }: { image: QueryImage }) {
  const totalPipelineMs = PIPELINE_STEPS.reduce((s, x) => s + x.ms, 0)

  return (
    <div>
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(45,55,72,0.35)', background: 'rgba(12,18,32,0.8)' }}>
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <FileImage className="w-3.5 h-3.5 text-blue-primary" />
            <span className="text-body-s text-text-primary font-semibold">Scene Ready</span>
          </div>
          <div className="font-mono text-caption text-text-tertiary">Awaiting search trigger</div>
        </div>
        <div className="px-2 py-1 rounded font-mono text-caption font-bold"
          style={{ background: 'rgba(20,184,166,0.12)', border: '1px solid rgba(20,184,166,0.3)', color: '#14B8A6' }}>
          READY
        </div>
      </div>

      <div className="p-4 space-y-5">

        {/* Image info — derived from the actual uploaded file, not mock data */}
        <div>
          <div className="overline-label mb-2">Uploaded File</div>
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(45,55,72,0.28)' }}>
            {[
              { label: 'Filename',    value: image.name },
              { label: 'Sensor',      value: image.sensorType },
              { label: 'File size',   value: image.fileSize ?? '—' },
              { label: 'Status',      value: 'Validated ✓' },
            ].map(({ label, value }, i, arr) => (
              <div key={label} className="flex items-center justify-between px-3 py-2"
                style={i < arr.length - 1 ? { borderBottom: '1px solid rgba(45,55,72,0.18)' } : {}}>
                <span className="text-caption text-text-tertiary">{label}</span>
                <span className="font-mono text-caption text-text-secondary truncate max-w-[140px]" title={value}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Thumbnail preview (only if browser can show it) */}
        {image.thumbnailUrl && (
          <div>
            <div className="overline-label mb-2">Preview</div>
            <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(45,55,72,0.28)', height: 120 }}>
              <img src={image.thumbnailUrl} alt="Uploaded scene" className="w-full h-full object-cover" />
            </div>
          </div>
        )}

        {/* What will happen when search runs */}
        <div>
          <div className="overline-label mb-2">Pipeline Preview</div>
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(45,55,72,0.28)' }}>
            {PIPELINE_STEPS.map((step, i) => (
              <div key={step.step} className="flex items-start gap-3 px-3 py-2.5"
                style={i < PIPELINE_STEPS.length - 1 ? { borderBottom: '1px solid rgba(45,55,72,0.18)' } : {}}>
                <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.22)' }}>
                  <span className="font-mono text-overline text-blue-primary">{step.step}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-caption text-text-secondary font-medium">{step.label}</div>
                  <div className="text-overline text-text-tertiary leading-relaxed mt-0.5">{step.detail}</div>
                </div>
                <span className="font-mono text-overline text-text-tertiary flex-shrink-0">~{step.ms}ms</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-2 px-1">
            <div className="flex items-center gap-1.5">
              <Cpu className="w-3 h-3 text-teal-primary" />
              <span className="text-overline text-text-secondary">Est. total</span>
            </div>
            <span className="font-mono text-overline" style={{ color: '#14B8A6' }}>~{totalPipelineMs}ms</span>
          </div>
        </div>

        {/* CTA reminder */}
        <div className="flex items-start gap-2 p-3 rounded-lg"
          style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)' }}>
          <Search className="w-3.5 h-3.5 text-blue-primary flex-shrink-0 mt-0.5" />
          <p className="text-caption text-text-secondary leading-relaxed">
            Click <span className="text-blue-primary font-medium">Begin Intelligence Search</span> to run
            the cosine similarity pipeline against the archive of {50} satellite scenes.
          </p>
        </div>

        {/* Non-negotiable disclaimer */}
        <div className="flex items-start gap-2 p-3 rounded-lg"
          style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <AlertTriangle className="w-3 h-3 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-overline text-text-tertiary leading-relaxed">
            All similarity scores are computed from real cosine similarity between embeddings.
            No results are hardcoded or randomly assigned.
          </p>
        </div>

        <div className="h-4" />
      </div>
    </div>
  )
}
