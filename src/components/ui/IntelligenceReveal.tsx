import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useAppStore } from '@/store/useAppStore'

// Nine pipeline stages mapped to rays — angles spread around 360°
const RAYS = [
  { angle: -90,  len: 155, color: '#8B5CF6', label: 'METADATA',   branchAngle:  45, branchLen: 62, delay: 0.00 },
  { angle: -50,  len: 130, color: '#6366F1', label: 'PREPROCESS', branchAngle: -45, branchLen: 52, delay: 0.04 },
  { angle: -10,  len: 168, color: '#3B82F6', label: 'FEATURES',   branchAngle:  45, branchLen: 68, delay: 0.08 },
  { angle:  30,  len: 142, color: '#0EA5E9', label: 'EMBEDDINGS', branchAngle: -45, branchLen: 56, delay: 0.12 },
  { angle:  70,  len: 158, color: '#14B8A6', label: 'SEARCH',     branchAngle:  45, branchLen: 62, delay: 0.16 },
  { angle: 110,  len: 136, color: '#10B981', label: 'GRAPH',      branchAngle: -45, branchLen: 54, delay: 0.20 },
  { angle: 150,  len: 148, color: '#F59E0B', label: 'EVENTS',     branchAngle:  45, branchLen: 58, delay: 0.24 },
  { angle: 190,  len: 126, color: '#EF4444', label: 'CONFIDENCE', branchAngle: -45, branchLen: 50, delay: 0.28 },
  { angle: 230,  len: 144, color: '#EC4899', label: 'REPORT',     branchAngle:  45, branchLen: 57, delay: 0.32 },
]

const CX = 400
const CY = 300

function toRad(deg: number) { return (deg * Math.PI) / 180 }

interface RayProps {
  ray: typeof RAYS[0]
  drawIn: boolean
  collapseIn: boolean
}

function CrystalRay({ ray, drawIn, collapseIn }: RayProps) {
  const rad  = toRad(ray.angle)
  const ex   = CX + ray.len * Math.cos(rad)
  const ey   = CY + ray.len * Math.sin(rad)

  const bx   = CX + ray.len * 0.65 * Math.cos(rad)
  const by   = CY + ray.len * 0.65 * Math.sin(rad)
  const brad = toRad(ray.angle + ray.branchAngle)
  const bex  = bx + ray.branchLen * Math.cos(brad)
  const bey  = by + ray.branchLen * Math.sin(brad)

  const lx = CX + (ray.len + 24) * Math.cos(rad)
  const ly = CY + (ray.len + 24) * Math.sin(rad)

  const active = drawIn && !collapseIn

  return (
    <g>
      <motion.path
        d={`M ${CX},${CY} L ${ex},${ey}`}
        stroke={ray.color} strokeWidth={1.4} strokeLinecap="round" fill="none"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{
          pathLength: collapseIn ? 0 : (active ? 1 : 0),
          opacity:    collapseIn ? 0 : (active ? 0.82 : 0),
        }}
        transition={collapseIn
          ? { duration: 0.22, delay: ray.delay * 0.25, ease: [0.55, 0, 1, 0.45] }
          : { duration: 0.42, delay: ray.delay, ease: [0.25, 0.46, 0.45, 0.94] }
        }
      />
      <motion.path
        d={`M ${bx},${by} L ${bex},${bey}`}
        stroke={ray.color} strokeWidth={0.8} strokeLinecap="round" fill="none"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{
          pathLength: collapseIn ? 0 : (active ? 1 : 0),
          opacity:    collapseIn ? 0 : (active ? 0.48 : 0),
        }}
        transition={collapseIn
          ? { duration: 0.18, delay: ray.delay * 0.15 }
          : { duration: 0.3, delay: ray.delay + 0.24, ease: [0.25, 0.46, 0.45, 0.94] }
        }
      />
      <motion.circle
        cx={ex} cy={ey} r={2.8}
        fill={ray.color}
        initial={{ scale: 0, opacity: 0 }}
        animate={{
          scale:   collapseIn ? 0 : (active ? 1 : 0),
          opacity: collapseIn ? 0 : (active ? 0.95 : 0),
        }}
        style={{ transformOrigin: `${ex}px ${ey}px` }}
        transition={{ delay: collapseIn ? 0 : ray.delay + 0.4, duration: 0.15 }}
      />
      {active && (
        <motion.text
          x={lx} y={ly}
          textAnchor="middle" dominantBaseline="central"
          fontSize={7} fontFamily="ui-monospace, monospace" fontWeight="700"
          fill={ray.color} fillOpacity={0}
          animate={{ fillOpacity: 0.55 }}
          transition={{ delay: ray.delay + 0.52, duration: 0.2 }}
        >
          {ray.label}
        </motion.text>
      )}
    </g>
  )
}

function useCountUp(target: number, active: boolean, durationMs = 650) {
  const [value, setValue] = useState(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (!active) { setValue(0); return }
    const start = performance.now()
    const tick = (now: number) => {
      const elapsed  = now - start
      const progress = Math.min(elapsed / durationMs, 1)
      const eased    = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(target * eased * 10) / 10)
      if (progress < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, active, durationMs])

  return value
}

type Phase = 'idle' | 'draw' | 'read' | 'collapse' | 'dissolve'

export default function IntelligenceReveal() {
  const searchComplete   = useAppStore((s) => s.searchComplete)
  const missionAnalytics = useAppStore((s) => s.missionAnalytics)
  const activeMission    = useAppStore((s) => s.activeMission)
  const results          = useAppStore((s) => s.results)

  const [phase, setPhase] = useState<Phase>('idle')
  const prevComplete      = useRef(false)
  const timers            = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    if (searchComplete && !prevComplete.current) {
      timers.current.forEach(clearTimeout)
      setPhase('draw')
      timers.current = [
        setTimeout(() => setPhase('read'),     560),
        setTimeout(() => setPhase('collapse'), 1380),
        setTimeout(() => setPhase('dissolve'), 1750),
        setTimeout(() => setPhase('idle'),     2200),
      ]
    }
    prevComplete.current = searchComplete
    return () => timers.current.forEach(clearTimeout)
  }, [searchComplete])

  const confidence  = missionAnalytics?.confidence.overall ?? 0
  const resultCount = results.length
  const confValue   = useCountUp(confidence, phase === 'read' || phase === 'collapse', 620)

  if (phase === 'idle') return null

  const drawIn     = phase === 'draw' || phase === 'read'
  const collapseIn = phase === 'collapse' || phase === 'dissolve'
  const dissolving = phase === 'dissolve'

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: 'rgba(7,11,20,0.98)', backdropFilter: 'blur(4px)' }}
      initial={{ opacity: 1 }}
      animate={{ opacity: dissolving ? 0 : 1 }}
      transition={{ duration: 0.48, ease: [0.55, 0, 1, 0.45] }}
    >
      {/* Dot grid */}
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none', opacity: 0.12 }}>
        <defs>
          <pattern id="ir-dots" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="14" cy="14" r="0.75" fill="rgba(59,130,246,0.9)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#ir-dots)" />
      </svg>

      {/* Crystal SVG */}
      <svg
        viewBox="0 0 800 600"
        style={{
          position: 'absolute',
          width: '100%',
          maxWidth: 920,
          height: 'auto',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}
      >
        {/* Radiating pulse on draw start */}
        {phase === 'draw' && (
          <motion.circle
            cx={CX} cy={CY} r={8}
            fill="none" stroke="#3B82F6" strokeWidth={1.5}
            initial={{ r: 8, opacity: 0.9, strokeWidth: 2 }}
            animate={{ r: 90, opacity: 0, strokeWidth: 0.3 }}
            transition={{ duration: 0.75, ease: 'easeOut' }}
          />
        )}

        {/* Second subtler ring */}
        {phase === 'draw' && (
          <motion.circle
            cx={CX} cy={CY} r={4}
            fill="none" stroke="rgba(20,184,166,0.6)" strokeWidth={1}
            initial={{ r: 4, opacity: 0.5 }}
            animate={{ r: 55, opacity: 0 }}
            transition={{ duration: 0.55, delay: 0.18, ease: 'easeOut' }}
          />
        )}

        {RAYS.map((ray, i) => (
          <CrystalRay key={i} ray={ray} drawIn={drawIn} collapseIn={collapseIn} />
        ))}

        {/* Center node */}
        <motion.circle
          cx={CX} cy={CY} r={5}
          fill="#3B82F6"
          style={{ filter: 'drop-shadow(0 0 10px rgba(59,130,246,0.9))' }}
          initial={{ r: 2, opacity: 0 }}
          animate={{ r: collapseIn ? 0 : 5, opacity: collapseIn ? 0 : 1 }}
          transition={{ duration: 0.3 }}
        />
      </svg>

      {/* Central readout */}
      <div className="relative z-10 flex flex-col items-center gap-2 text-center" style={{ userSelect: 'none' }}>
        <motion.div
          className="font-mono tracking-[0.42em] text-text-tertiary"
          style={{ fontSize: 9, letterSpacing: '0.42em' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: phase === 'read' || phase === 'collapse' ? 0.5 : 0 }}
          transition={{ duration: 0.28, delay: 0.05 }}
        >
          AKSHA · INTELLIGENCE COMPLETE
        </motion.div>

        {/* Hero confidence number */}
        <motion.div
          className="font-mono font-bold leading-none"
          style={{ fontSize: 88, color: '#3B82F6' }}
          initial={{ opacity: 0, scale: 0.82 }}
          animate={{
            opacity: phase === 'read' || phase === 'collapse' ? 1 : 0,
            scale:   phase === 'read' || phase === 'collapse' ? 1 : 0.82,
          }}
          transition={{ duration: 0.32, ease: [0.34, 1.56, 0.64, 1] }}
        >
          {confValue.toFixed(1)}
          <span style={{ fontSize: 38, color: 'rgba(59,130,246,0.45)', marginLeft: 2 }}>%</span>
        </motion.div>

        <motion.div
          className="font-mono text-text-secondary"
          style={{ fontSize: 10.5, letterSpacing: '0.18em' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: phase === 'read' ? 0.65 : 0 }}
          transition={{ duration: 0.22, delay: 0.18 }}
        >
          CONFIDENCE · {resultCount} ARCHIVE MATCHES
        </motion.div>

        {activeMission && (
          <motion.div
            className="text-text-tertiary font-mono"
            style={{ fontSize: 9, maxWidth: 300 }}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: phase === 'read' ? 0.45 : 0, y: phase === 'read' ? 0 : 5 }}
            transition={{ duration: 0.22, delay: 0.28 }}
          >
            {activeMission.name.toUpperCase()}
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}
