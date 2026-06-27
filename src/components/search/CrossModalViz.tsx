import { motion } from 'framer-motion'
import { CROSS_MODAL_CONF, EMBEDDING_DIM, FOUNDATION_MODEL } from '@/data/mockResults'

const MODALITIES = [
  { label: 'SAR',           sub: 'RISAT-2B · C-band',  color: '#3B82F6', symbol: '◉' },
  { label: 'Optical',       sub: 'Sentinel-2A · MSI',   color: '#22C55E', symbol: '◎' },
  { label: 'Multispectral', sub: 'ResourceSat-2A',       color: '#F59E0B', symbol: '◈' },
]

const SHARED_COLOR = '#8B5CF6'

export default function CrossModalViz({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {!compact && (
        <div className="flex items-center justify-between">
          <div>
            <div className="overline-label">Cross-Modal Embedding Space</div>
            <div className="text-caption text-text-tertiary mt-0.5">
              {FOUNDATION_MODEL} · {EMBEDDING_DIM}-dim shared latent space
            </div>
          </div>
          <span className="font-mono text-caption font-semibold" style={{ color: SHARED_COLOR }}>
            {CROSS_MODAL_CONF}% aligned
          </span>
        </div>
      )}

      {/* Flow diagram */}
      <div className="flex items-center gap-0" style={{ minHeight: compact ? 52 : 72 }}>

        {/* Input modality — SAR */}
        <ModalityNode
          label={MODALITIES[0].label}
          sub={compact ? undefined : MODALITIES[0].sub}
          color={MODALITIES[0].color}
          symbol={MODALITIES[0].symbol}
          compact={compact}
          delay={0}
        />

        {/* Arrow + label → shared space */}
        <FlowArrow label={compact ? undefined : 'encode'} color={MODALITIES[0].color} delay={0.1} />

        {/* Shared embedding node */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          className="flex flex-col items-center flex-shrink-0"
          style={{ minWidth: compact ? 60 : 80 }}>
          <div
            className="rounded-lg flex flex-col items-center justify-center"
            style={{
              width:   compact ? 56 : 72,
              height:  compact ? 40 : 52,
              background: `${SHARED_COLOR}14`,
              border:  `1.5px solid ${SHARED_COLOR}45`,
              boxShadow: `0 0 14px ${SHARED_COLOR}18`,
            }}>
            <div className="font-mono leading-none font-bold" style={{ fontSize: compact ? 9 : 10, color: SHARED_COLOR }}>
              {EMBEDDING_DIM}D
            </div>
            {!compact && (
              <div className="font-mono mt-0.5" style={{ fontSize: 7, color: `${SHARED_COLOR}99` }}>LATENT</div>
            )}
          </div>
          {!compact && (
            <div className="text-overline mt-1 text-center" style={{ color: SHARED_COLOR, maxWidth: 72, fontSize: 8 }}>
              Shared Space
            </div>
          )}
        </motion.div>

        {/* Arrow → optical */}
        <FlowArrow label={compact ? undefined : 'retrieve'} color={MODALITIES[1].color} delay={0.3} />

        {/* Optical result */}
        <ModalityNode
          label={MODALITIES[1].label}
          sub={compact ? undefined : MODALITIES[1].sub}
          color={MODALITIES[1].color}
          symbol={MODALITIES[1].symbol}
          compact={compact}
          delay={0.4}
        />

        {/* Slash separator */}
        <div className="text-text-tertiary mx-1" style={{ fontSize: compact ? 10 : 12 }}>·</div>

        {/* Multispectral result */}
        <ModalityNode
          label={MODALITIES[2].label}
          sub={compact ? undefined : MODALITIES[2].sub}
          color={MODALITIES[2].color}
          symbol={MODALITIES[2].symbol}
          compact={compact}
          delay={0.5}
        />
      </div>

      {/* Similarity confirmation bar */}
      {!compact && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(45,55,72,0.3)' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${CROSS_MODAL_CONF}%` }}
              transition={{ delay: 0.6, duration: 0.8, ease: 'easeOut' }}
              className="h-full rounded-full"
              style={{ background: `linear-gradient(to right, #3B82F6, ${SHARED_COLOR}, #22C55E)` }}
            />
          </div>
          <span className="font-mono text-overline flex-shrink-0" style={{ color: SHARED_COLOR }}>
            {CROSS_MODAL_CONF}%
          </span>
        </div>
      )}
    </div>
  )
}

function ModalityNode({ label, sub, color, symbol, compact, delay }: {
  label: string; sub?: string; color: string; symbol: string; compact: boolean; delay: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.25 }}
      className="flex flex-col items-center flex-shrink-0"
      style={{ minWidth: compact ? 44 : 60 }}>
      <div
        className="rounded-md flex flex-col items-center justify-center"
        style={{
          width:   compact ? 40 : 52,
          height:  compact ? 36 : 44,
          background: `${color}12`,
          border:  `1px solid ${color}35`,
        }}>
        <span style={{ fontSize: compact ? 10 : 13, color }}>{symbol}</span>
      </div>
      <div className="text-overline mt-1 text-center font-mono" style={{ color, fontSize: compact ? 7.5 : 8 }}>
        {label}
      </div>
      {sub && (
        <div className="text-overline text-center text-text-tertiary" style={{ fontSize: 7, maxWidth: 56 }}>
          {sub}
        </div>
      )}
    </motion.div>
  )
}

function FlowArrow({ label, color, delay }: { label?: string; color: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay, duration: 0.2 }}
      className="flex flex-col items-center flex-shrink-0"
      style={{ minWidth: label ? 36 : 22 }}>
      <div className="flex items-center gap-0">
        <div style={{ height: 1, background: `${color}50`, width: label ? 22 : 16 }} />
        <div style={{
          width: 0, height: 0,
          borderTop: '3px solid transparent', borderBottom: '3px solid transparent',
          borderLeft: `5px solid ${color}70`,
        }} />
      </div>
      {label && (
        <div className="font-mono text-center" style={{ fontSize: 6.5, color: `${color}80`, marginTop: 2 }}>
          {label}
        </div>
      )}
    </motion.div>
  )
}
