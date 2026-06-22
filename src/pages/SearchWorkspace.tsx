import { motion, AnimatePresence } from 'framer-motion'
import { Upload, SlidersHorizontal } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import EarthGlobe from '@/components/earth/EarthGlobe'
import UploadZone from '@/components/search/UploadZone'
import ProcessingPipeline from '@/components/search/ProcessingPipeline'

const MODALITIES = [
  { id: 'cross',    label: 'Cross-Modal',   description: 'SAR ↔ Optical ↔ Multispectral' },
  { id: 'same',     label: 'Same-Sensor',   description: 'Match within sensor type' },
  { id: 'temporal', label: 'Temporal Seq.', description: 'Same location, different dates' },
]

export default function SearchWorkspace() {
  const pipelineStage  = useAppStore((s) => s.pipelineStage)
  const isSearching    = useAppStore((s) => s.isSearching)
  const searchComplete = useAppStore((s) => s.searchComplete)

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: search configuration */}
      <motion.div
        initial={{ x: -16, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className="w-88 flex-shrink-0 flex flex-col overflow-y-auto scrollbar-hide"
        style={{
          background: 'rgba(10, 15, 26, 0.97)',
          borderRight: '1px solid rgba(45, 55, 72, 0.35)',
        }}
      >
        {/* Panel header */}
        <div className="px-6 pt-7 pb-5" style={{ borderBottom: '1px solid rgba(45,55,72,0.3)' }}>
          <div className="flex items-center gap-2.5 mb-2">
            <div
              className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.22)' }}
            >
              <Upload className="w-3.5 h-3.5 text-blue-primary" />
            </div>
            <h1 className="text-heading-3 text-text-primary font-semibold">Intelligence Search</h1>
          </div>
          <p className="text-body-s text-text-tertiary leading-relaxed">
            Upload imagery to retrieve cross-modal observations from the ISRO Bhuvan archive
          </p>
        </div>

        <div className="p-6 space-y-7 flex-1">
          {/* Upload zone */}
          <div>
            <div className="overline-label mb-3">Query Image</div>
            <UploadZone />
          </div>

          {/* Search modality */}
          <div>
            <div className="overline-label mb-3">Search Modality</div>
            <div>
              {MODALITIES.map((m, i) => (
                <label
                  key={m.id}
                  className="flex items-start gap-3 py-3 cursor-pointer group"
                  style={{ borderBottom: i < MODALITIES.length - 1 ? '1px solid rgba(45,55,72,0.25)' : 'none' }}
                >
                  <input
                    type="radio"
                    name="modality"
                    defaultChecked={i === 0}
                    className="mt-0.5 accent-blue-primary flex-shrink-0"
                  />
                  <div>
                    <div className="text-body-s text-text-primary font-medium group-hover:text-text-primary">{m.label}</div>
                    <div className="text-caption text-text-tertiary mt-0.5">{m.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Geographic scope */}
          <div>
            <div className="overline-label mb-3">Geographic Scope</div>
            <div className="space-y-2.5">
              {['Global archive', 'Define region on Earth', 'India subcontinent'].map((opt, i) => (
                <label key={opt} className="flex items-center gap-3 cursor-pointer">
                  <input type="radio" name="scope" defaultChecked={i === 0} className="accent-blue-primary" />
                  <span className="text-body-s text-text-secondary">{opt}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="overline-label">Parameters</div>
              <button className="flex items-center gap-1 text-caption text-blue-primary hover:text-blue-dim transition-colors">
                <SlidersHorizontal className="w-3 h-3" />
                Advanced
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-body-s text-text-secondary">Cloud cover max</span>
                  <span className="mono-value">50%</span>
                </div>
                <input type="range" min="0" max="100" defaultValue="50" className="w-full accent-blue-primary" />
              </div>
              <div>
                <div className="overline-label mb-2.5">Result count</div>
                <div className="flex gap-1.5">
                  {[5, 10, 20, 50].map((n) => (
                    <button
                      key={n}
                      className="flex-1 py-1.5 rounded-md text-body-s transition-all"
                      style={
                        n === 10
                          ? { background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)', color: '#3B82F6' }
                          : { background: 'transparent', border: '1px solid rgba(45,55,72,0.5)', color: '#64748B' }
                      }
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Center: Earth + pipeline */}
      <div className="flex-1 relative overflow-hidden">
        <div
          className="absolute inset-0 transition-opacity duration-500"
          style={{ opacity: isSearching ? 0.4 : 1 }}
        >
          <EarthGlobe />
        </div>

        {/* Pipeline overlay */}
        <AnimatePresence>
          {(isSearching || (searchComplete && pipelineStage === 'complete')) && (
            <motion.div
              key="pipeline"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <div
                className="w-full max-w-xl mx-8 rounded-xl pointer-events-auto"
                style={{
                  background: 'rgba(8, 13, 22, 0.94)',
                  border: '1px solid rgba(45, 55, 72, 0.45)',
                  boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
                }}
              >
                <ProcessingPipeline />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Idle state — minimal hint */}
        {pipelineStage === 'idle' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="absolute bottom-24 left-1/2 -translate-x-1/2 pointer-events-none"
          >
            <div
              className="px-5 py-2.5 rounded-lg"
              style={{
                background: 'rgba(10, 15, 26, 0.85)',
                border: '1px solid rgba(45, 55, 72, 0.3)',
              }}
            >
              <p className="text-body-s text-text-tertiary whitespace-nowrap">
                Upload an image to begin cross-modal retrieval
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
