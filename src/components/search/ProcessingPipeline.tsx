import { motion } from 'framer-motion'
import { Check, Loader2 } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/utils'
import type { PipelineStage } from '@/types'

const STAGES: { id: PipelineStage; label: string; description: string; duration: string }[] = [
  {
    id: 'feature_extraction',
    label: 'Feature Extraction',
    description: 'Extracting spatial & spectral features from input imagery',
    duration: '1.8s',
  },
  {
    id: 'cross_modal_alignment',
    label: 'Cross-Modal Alignment',
    description: 'Projecting SAR features into shared embedding space',
    duration: '2.2s',
  },
  {
    id: 'archive_search',
    label: 'Archive Search',
    description: 'Querying ISRO Bhuvan + Copernicus (2.48M observations)',
    duration: '1.6s',
  },
  {
    id: 'graph_reranking',
    label: 'Graph Re-ranking',
    description: 'Applying geo-semantic context to refine result order',
    duration: '1.4s',
  },
  {
    id: 'complete',
    label: 'Results Ready',
    description: 'Retrieval complete — rendering spatial results',
    duration: '',
  },
]

function getStageStatus(stage: PipelineStage, current: PipelineStage): 'complete' | 'active' | 'pending' {
  const order = STAGES.map((s) => s.id)
  const stageIdx   = order.indexOf(stage)
  const currentIdx = order.indexOf(current)
  if (currentIdx === -1 || current === 'idle') return 'pending'
  if (stageIdx < currentIdx) return 'complete'
  if (stageIdx === currentIdx) return 'active'
  return 'pending'
}

export default function ProcessingPipeline() {
  const pipelineStage    = useAppStore((s) => s.pipelineStage)
  const pipelineProgress = useAppStore((s) => s.pipelineProgress)
  const uploadedImage    = useAppStore((s) => s.uploadedImage)

  if (pipelineStage === 'idle') return null

  return (
    <div className="px-8 py-7">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-7"
      >
        <div className="overline-label mb-1.5">Processing Pipeline</div>
        <div className="text-heading-3 text-text-primary font-semibold">
          {uploadedImage?.name ?? 'Query Image'}
        </div>
        <div className="text-body-s text-text-tertiary mt-1">
          {STAGES.find(s => s.id === pipelineStage)?.description}
        </div>
      </motion.div>

      {/* Stage list */}
      <div className="space-y-1 mb-6">
        {STAGES.map((stage, i) => {
          const status = getStageStatus(stage.id, pipelineStage)
          return (
            <motion.div
              key={stage.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
              className="flex items-center gap-3 py-2"
            >
              {/* Stage indicator */}
              <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
                style={{
                  background:
                    status === 'complete' ? 'rgba(20,184,166,0.12)' :
                    status === 'active'   ? 'rgba(59,130,246,0.12)' :
                    'rgba(45,55,72,0.2)',
                  border:
                    status === 'complete' ? '1px solid rgba(20,184,166,0.3)' :
                    status === 'active'   ? '1px solid rgba(59,130,246,0.35)' :
                    '1px solid rgba(45,55,72,0.35)',
                }}
              >
                {status === 'complete' ? (
                  <Check className="w-3 h-3 text-teal-primary" />
                ) : status === 'active' ? (
                  <Loader2 className="w-3 h-3 text-blue-primary animate-spin" />
                ) : (
                  <span className="text-caption text-text-tertiary font-mono">{i + 1}</span>
                )}
              </div>

              {/* Stage label */}
              <div className="flex-1 min-w-0">
                <span className={cn(
                  'text-body-s font-medium',
                  status === 'complete' ? 'text-teal-primary' :
                  status === 'active'   ? 'text-text-primary' :
                  'text-text-tertiary'
                )}>
                  {stage.label}
                </span>
              </div>

              {/* Duration / status */}
              <div className="font-mono text-caption flex-shrink-0" style={{ color:
                status === 'complete' ? 'rgba(20,184,166,0.7)' :
                status === 'active'   ? 'rgba(59,130,246,0.8)' :
                '#4A5568'
              }}>
                {status === 'complete' ? '✓' :
                 status === 'active'   ? stage.duration :
                 '—'}
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Progress */}
      <div className="space-y-2">
        <div className="h-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(45,55,72,0.4)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: '#3B82F6' }}
            initial={{ width: '0%' }}
            animate={{ width: `${pipelineProgress}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-caption text-text-tertiary">
            Stage {Math.max(1, STAGES.findIndex(s => s.id === pipelineStage) + 1)} of {STAGES.length}
          </span>
          <span className="font-mono text-caption text-text-secondary">{Math.round(pipelineProgress)}%</span>
        </div>
      </div>

      {/* Live stats */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="mt-5 pt-5 flex items-center gap-5"
        style={{ borderTop: '1px solid rgba(45,55,72,0.25)' }}
      >
        {[
          { label: 'ISRO Bhuvan archive',  color: '#3B82F6' },
          { label: '2,483,912 observations', color: '#14B8A6' },
          { label: 'Cross-modal alignment', color: '#22C55E' },
        ].map(({ label, color }, i) => (
          <div key={label} className="flex items-center gap-1.5">
            <div
              className="w-1 h-1 rounded-full animate-pulse"
              style={{ background: color, animationDelay: `${i * 200}ms` }}
            />
            <span className="text-caption text-text-tertiary">{label}</span>
          </div>
        ))}
      </motion.div>
    </div>
  )
}
