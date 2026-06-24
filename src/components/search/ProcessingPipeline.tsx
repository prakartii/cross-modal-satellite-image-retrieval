/**
 * AKSHA — Processing Pipeline Visualizer (10-Stage)
 *
 * Shows the full AI pipeline progress with per-stage status indicators,
 * timing estimates, and live data from each completed stage.
 * Connects to the Zustand store for real-time stage updates.
 */

import { motion, AnimatePresence } from 'framer-motion'
import { Check, Loader2, ChevronRight } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/utils'
import type { FullPipelineStage } from '@/types'

interface StageDefinition {
  id: FullPipelineStage
  label:       string
  description: string
  duration:    string
  color:       string
}

const STAGES: StageDefinition[] = [
  {
    id: 'metadata_extraction',
    label: 'Metadata Extraction',
    description: 'Parsing satellite, sensor, date, coordinates from scene headers',
    duration: '0.7s',
    color: '#8B5CF6',
  },
  {
    id: 'preprocessing',
    label: 'Preprocessing',
    description: 'Normalizing to 512×512 RGB, auto-enhancing contrast',
    duration: '0.9s',
    color: '#6366F1',
  },
  {
    id: 'feature_extraction',
    label: 'Feature Extraction',
    description: 'Computing 32 texture + spectral + spatial features from pixels',
    duration: '1.4s',
    color: '#3B82F6',
  },
  {
    id: 'embedding_generation',
    label: 'Embedding Generation',
    description: 'Generating 32-dim unit embedding via weighted L2-normalization',
    duration: '0.8s',
    color: '#0EA5E9',
  },
  {
    id: 'semantic_search',
    label: 'Semantic Search',
    description: 'Cosine similarity vs 50-scene archive — top-K retrieval',
    duration: '1.0s',
    color: '#14B8A6',
  },
  {
    id: 'graph_reranking',
    label: 'Graph Re-ranking',
    description: 'Geo-semantic graph + PageRank re-ranking for spatial context',
    duration: '1.1s',
    color: '#10B981',
  },
  {
    id: 'event_detection',
    label: 'Event Detection',
    description: 'Rule-based flood, fire, deforestation and anomaly detectors',
    duration: '0.8s',
    color: '#F59E0B',
  },
  {
    id: 'confidence_estimation',
    label: 'Confidence Estimation',
    description: '4-signal weighted confidence: similarity + coherence + history + metadata',
    duration: '0.7s',
    color: '#EF4444',
  },
  {
    id: 'report_generation',
    label: 'Report Generation',
    description: 'Assembling Mission Intelligence Report with recommendations',
    duration: '0.9s',
    color: '#EC4899',
  },
  {
    id: 'complete',
    label: 'Intelligence Ready',
    description: 'Mission Intelligence Report delivered — dashboard updated',
    duration: '',
    color: '#14B8A6',
  },
]

function getStageStatus(
  stageId: FullPipelineStage,
  currentStage: FullPipelineStage,
): 'complete' | 'active' | 'pending' {
  const order = STAGES.map((s) => s.id)
  const si = order.indexOf(stageId)
  const ci = order.indexOf(currentStage)
  if (ci === -1 || currentStage === 'idle') return 'pending'
  if (si < ci) return 'complete'
  if (si === ci) return 'active'
  return 'pending'
}

export default function ProcessingPipeline() {
  const pipelineStage    = useAppStore((s) => s.pipelineStage)
  const pipelineProgress = useAppStore((s) => s.pipelineProgress)
  const uploadedImage    = useAppStore((s) => s.uploadedImage)
  const pipelineEvents   = useAppStore((s) => s.pipelineEvents)
  const backendAvailable = useAppStore((s) => s.backendAvailable)

  if (pipelineStage === 'idle') return null

  const currentDef = STAGES.find((s) => s.id === pipelineStage)
  const currentColor = currentDef?.color ?? '#3B82F6'
  const stageNum = Math.max(1, STAGES.findIndex((s) => s.id === pipelineStage) + 1)

  // Get the latest pipeline event for the current stage
  const latestEvent = pipelineEvents
    .filter((e) => e.stage === pipelineStage)
    .at(-1)

  return (
    <div className="px-8 py-7">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="flex items-center justify-between mb-1.5">
          <div className="overline-label">AKSHA Intelligence Pipeline</div>
          {backendAvailable === true && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(20,184,166,0.1)', border: '1px solid rgba(20,184,166,0.3)' }}>
              <div className="w-1.5 h-1.5 rounded-full bg-teal-primary animate-pulse" />
              <span className="text-overline" style={{ color: '#14B8A6' }}>Live AI Backend</span>
            </div>
          )}
          {backendAvailable === false && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#F59E0B' }} />
              <span className="text-overline" style={{ color: '#F59E0B' }}>Simulation Mode</span>
            </div>
          )}
        </div>
        <div className="text-heading-3 text-text-primary font-semibold">
          {uploadedImage?.name ?? 'Query Image'}
        </div>
        <div className="text-body-s text-text-tertiary mt-1">
          {currentDef?.description ?? 'Processing…'}
        </div>
      </motion.div>

      {/* ── Stage list ───────────────────────────────────────────────────── */}
      <div className="space-y-0.5 mb-6">
        {STAGES.map((stage, i) => {
          const status = getStageStatus(stage.id, pipelineStage)
          const stageEvent = pipelineEvents.find((e) => e.stage === stage.id && e.result)
          return (
            <motion.div
              key={stage.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className="flex items-center gap-3 py-1.5"
            >
              {/* Stage indicator */}
              <div
                className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
                style={{
                  background:
                    status === 'complete' ? `rgba(20,184,166,0.12)` :
                    status === 'active'   ? `${stage.color}18` :
                    'rgba(45,55,72,0.15)',
                  border:
                    status === 'complete' ? '1px solid rgba(20,184,166,0.3)' :
                    status === 'active'   ? `1px solid ${stage.color}55` :
                    '1px solid rgba(45,55,72,0.25)',
                }}
              >
                {status === 'complete' ? (
                  <Check className="w-2.5 h-2.5 text-teal-primary" />
                ) : status === 'active' ? (
                  <Loader2 className="w-2.5 h-2.5 animate-spin" style={{ color: stage.color }} />
                ) : (
                  <span className="text-overline text-text-tertiary font-mono"
                    style={{ fontSize: 9 }}>{i + 1}</span>
                )}
              </div>

              {/* Stage label + live data */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={cn('text-caption font-medium')}
                    style={{
                      color:
                        status === 'complete' ? '#14B8A6' :
                        status === 'active'   ? stage.color :
                        '#4A5568',
                    }}
                  >
                    {stage.label}
                  </span>
                  {/* Show key result snippet when stage is complete */}
                  {status === 'complete' && stageEvent?.result && (
                    <span className="text-overline text-text-tertiary truncate max-w-32">
                      {_stageResultSnippet(stage.id, stageEvent.result)}
                    </span>
                  )}
                </div>
              </div>

              {/* Duration / status */}
              <span
                className="font-mono text-overline flex-shrink-0"
                style={{
                  color:
                    status === 'complete' ? 'rgba(20,184,166,0.7)' :
                    status === 'active'   ? stage.color :
                    '#2D3748',
                }}
              >
                {status === 'complete' ? '✓' :
                 status === 'active'   ? stage.duration :
                 '—'}
              </span>
            </motion.div>
          )
        })}
      </div>

      {/* ── Progress bar ─────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="h-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(45,55,72,0.35)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: `linear-gradient(to right, #3B82F6, ${currentColor})` }}
            initial={{ width: '0%' }}
            animate={{ width: `${pipelineProgress}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-caption text-text-tertiary">
            Stage {stageNum} of {STAGES.length}
          </span>
          <span className="font-mono text-caption text-text-secondary">
            {Math.round(pipelineProgress)}%
          </span>
        </div>
      </div>

      {/* ── Live stage data display ───────────────────────────────────────── */}
      <AnimatePresence>
        {latestEvent?.result && (
          <motion.div
            key={pipelineStage}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 rounded-lg p-3"
            style={{ background: `${currentColor}0A`, border: `1px solid ${currentColor}22` }}
          >
            <div className="text-overline mb-1.5" style={{ color: currentColor }}>
              {STAGES.find((s) => s.id === pipelineStage)?.label} — Live Output
            </div>
            {_renderStageData(pipelineStage, latestEvent.result)}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Status bar ───────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="mt-5 pt-4 flex items-center gap-4 flex-wrap"
        style={{ borderTop: '1px solid rgba(45,55,72,0.25)' }}
      >
        {[
          { label: 'ISRO Bhuvan archive', color: '#3B82F6' },
          { label: '50 indexed scenes',   color: '#14B8A6' },
          { label: '32-dim embeddings',   color: '#22C55E' },
        ].map(({ label, color }, i) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-1 h-1 rounded-full animate-pulse"
              style={{ background: color, animationDelay: `${i * 200}ms` }} />
            <span className="text-caption text-text-tertiary">{label}</span>
          </div>
        ))}
      </motion.div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function _stageResultSnippet(
  stage: FullPipelineStage,
  result: Record<string, unknown>,
): string {
  switch (stage) {
    case 'metadata_extraction': {
      const sat = result.satellite as string
      return sat ? `· ${sat}` : ''
    }
    case 'preprocessing': {
      const sz = result.original_size as string
      return sz ? `· ${sz}` : ''
    }
    case 'feature_extraction': {
      const n = result.feature_count as number
      return n ? `· ${n} features` : ''
    }
    case 'embedding_generation': {
      const d = result.embedding_dim as number
      return d ? `· ${d}D` : ''
    }
    case 'semantic_search': {
      const m = result.matches_found as number
      const s = result.top_similarity as number
      return m ? `· ${m} matches · ${s}%` : ''
    }
    case 'graph_reranking': {
      const n = result.graph_nodes as number
      const e = result.graph_edges as number
      return n ? `· ${n}N ${e}E` : ''
    }
    case 'event_detection': {
      const ev = result.primary_event as string
      return ev ? `· ${ev}` : '· none'
    }
    case 'confidence_estimation': {
      const l = result.level as string
      const o = result.overall as number
      return l ? `· ${l} ${o}%` : ''
    }
    default:
      return ''
  }
}

function _renderStageData(
  stage: FullPipelineStage,
  result: Record<string, unknown>,
): JSX.Element {
  const Row = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-overline text-text-tertiary">{label}</span>
      <span className="font-mono text-caption text-text-secondary">{value}</span>
    </div>
  )

  switch (stage) {
    case 'metadata_extraction': {
      const r = result as Record<string, string>
      return (
        <div className="space-y-0.5">
          <Row label="Satellite"    value={r.satellite ?? '—'} />
          <Row label="Sensor"       value={r.sensor_type ?? '—'} />
          <Row label="Date"         value={r.acquisition_date ?? '—'} />
          <Row label="Region"       value={r.region ?? '—'} />
        </div>
      )
    }
    case 'preprocessing': {
      const r = result as Record<string, unknown>
      return (
        <div className="space-y-0.5">
          <Row label="Original"   value={String(r.original_size ?? '—')} />
          <Row label="Normalized" value={String(r.normalized_size ?? '512×512')} />
          <Row label="File size"  value={`${r.file_size_kb ?? 0} KB`} />
        </div>
      )
    }
    case 'feature_extraction': {
      const kf = result.key_features as Record<string, number> ?? {}
      return (
        <div className="space-y-0.5">
          <Row label="Water index"      value={String(kf.water_index?.toFixed(3) ?? '—')} />
          <Row label="Vegetation index" value={String(kf.vegetation_index?.toFixed(3) ?? '—')} />
          <Row label="Edge density"     value={String(kf.edge_density?.toFixed(3) ?? '—')} />
          <Row label="Brightness"       value={String(kf.brightness?.toFixed(3) ?? '—')} />
        </div>
      )
    }
    case 'semantic_search': {
      const r = result as Record<string, unknown>
      return (
        <div className="space-y-0.5">
          <Row label="Archive size"   value={`${r.archive_size ?? 50} scenes`} />
          <Row label="Matches found"  value={String(r.matches_found ?? 0)} />
          <Row label="Top similarity" value={`${r.top_similarity ?? 0}%`} />
          <Row label="Latency"        value={`${r.search_latency_ms ?? 0}ms`} />
        </div>
      )
    }
    case 'event_detection': {
      const r = result as Record<string, unknown>
      return (
        <div className="space-y-0.5">
          <Row label="Events"     value={`${r.events_detected ?? 0} detected`} />
          <Row label="Primary"    value={String(r.primary_event ?? 'none')} />
          <Row label="Severity"   value={String(r.primary_severity ?? '—')} />
          <Row label="Confidence" value={`${r.primary_confidence ?? 0}%`} />
        </div>
      )
    }
    case 'confidence_estimation': {
      const r = result as Record<string, unknown>
      const comp = r.components as Record<string, number> ?? {}
      return (
        <div className="space-y-0.5">
          <Row label="Overall"     value={`${r.level} (${r.overall}%)`} />
          <Row label="Similarity"  value={`${comp.similarity ?? 0}%`} />
          <Row label="Coherence"   value={`${comp.feature_consistency ?? 0}%`} />
          <Row label="Historical"  value={`${comp.historical_agreement ?? 0}%`} />
        </div>
      )
    }
    default: {
      return <div className="text-caption text-text-tertiary">{JSON.stringify(result).slice(0, 80)}…</div>
    }
  }
}
