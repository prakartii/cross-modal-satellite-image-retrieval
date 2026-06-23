import { useState, useRef, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useAppStore } from '@/store/useAppStore'
import SensorChip from '@/components/ui/SensorChip'
import SimilarityBadge from '@/components/ui/SimilarityBadge'
import CoordinateDisplay from '@/components/ui/CoordinateDisplay'
import { mockQueryImage } from '@/data/mockResults'
import type { RetrievalResult } from '@/types'

const MODES = ['swipe', 'side-by-side', 'blend', 'difference'] as const
type Mode = typeof MODES[number]

const FEATURE_ALIGNMENT = [
  { label: 'Vegetation zones',         key: 'vegetation', color: '#22C55E' },
  { label: 'Water boundaries',         key: 'water',      color: '#3B82F6' },
  { label: 'Cross-modal confidence',   key: 'cross',      color: '#14B8A6' },
]

export default function ComparisonView() {
  const results        = useAppStore((s) => s.results)
  const selectedResult = useAppStore((s) => s.selectedResult) ?? results[0]
  const [opacity, setOpacity] = useState(50)
  const [mode, setMode]       = useState<Mode>('swipe')
  const [swipePos, setSwipePos]   = useState(50)
  const isDragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pct = Math.max(5, Math.min(95, (x / rect.width) * 100))
    setSwipePos(pct)
  }, [])

  const handleMouseUp = useCallback(() => {
    isDragging.current = false
  }, [])

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  // Touch support
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.touches[0].clientX - rect.left
    const pct = Math.max(5, Math.min(95, (x / rect.width) * 100))
    setSwipePos(pct)
  }, [])

  if (!selectedResult) {
    return (
      <div className="flex items-center justify-center h-full text-text-tertiary text-body-m">
        Select a result to compare
      </div>
    )
  }

  const featureValues = {
    vegetation: selectedResult.featureSimilarity.vegetation,
    water:      selectedResult.featureSimilarity.water,
    cross:      selectedResult.embeddingDistance ? (1 - selectedResult.embeddingDistance) * 100 : 89.3,
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div
        className="px-6 py-4 flex items-center gap-4 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(45,55,72,0.28)' }}
      >
        <div>
          <h2 className="text-heading-3 text-text-primary font-semibold">Sensor Fusion Swipe</h2>
          <p className="text-caption text-text-tertiary mt-0.5 font-mono">
            SAR ↔ Optical cross-modal comparison · Result #{selectedResult.rank} · {selectedResult.similarityScore.toFixed(1)}% similarity
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {MODES.map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="px-3 py-1.5 rounded-md text-caption font-medium capitalize transition-all"
              style={
                mode === m
                  ? { background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)', color: '#3B82F6' }
                  : { background: 'transparent', border: '1px solid rgba(45,55,72,0.4)', color: '#64748B' }
              }
            >
              {m.replace('-', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Main comparison */}
      <div className="flex-1 overflow-hidden min-h-0">
        {mode === 'swipe' ? (
          <SwipeView
            leftImage={mockQueryImage.thumbnailUrl}
            rightImage={selectedResult.thumbnailUrl}
            swipePos={swipePos}
            containerRef={containerRef}
            onMouseDown={handleMouseDown}
            onTouchMove={handleTouchMove}
            leftLabel={`SAR · ${mockQueryImage.satellite}`}
            rightLabel={`${selectedResult.sensorType} · ${selectedResult.satellite}`}
          />
        ) : (
          <SideBySideView
            selectedResult={selectedResult}
            opacity={opacity}
            mode={mode}
          />
        )}
      </div>

      {/* Controls + feature alignment */}
      <div
        className="px-6 py-4 flex-shrink-0 space-y-3"
        style={{ borderTop: '1px solid rgba(45,55,72,0.28)' }}
      >
        {mode === 'blend' && (
          <div className="flex items-center gap-4">
            <span className="text-body-s text-text-secondary w-16 flex-shrink-0">Opacity</span>
            <input
              type="range" min="0" max="100" value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              className="flex-1 accent-blue-primary"
            />
            <span className="mono-value w-10 text-right">{opacity}%</span>
          </div>
        )}

        {mode === 'swipe' && (
          <div className="flex items-center gap-4">
            <span className="text-body-s text-text-secondary w-16 flex-shrink-0">Position</span>
            <input
              type="range" min="5" max="95" value={swipePos}
              onChange={(e) => setSwipePos(Number(e.target.value))}
              className="flex-1 accent-blue-primary"
            />
            <span className="mono-value w-10 text-right">{Math.round(swipePos)}%</span>
          </div>
        )}

        <div>
          <div className="overline-label mb-2.5">Feature Alignment</div>
          <div className="grid grid-cols-3 gap-4">
            {FEATURE_ALIGNMENT.map(({ label, key, color }) => {
              const value = featureValues[key as keyof typeof featureValues]
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-caption text-text-tertiary">{label}</span>
                    <span className="font-mono text-caption font-medium" style={{ color }}>
                      {value.toFixed(1)}%
                    </span>
                  </div>
                  <div className="similarity-bar">
                    <div className="similarity-bar-fill" style={{ width: `${value}%`, background: color }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Swipe View ────────────────────────────────────────────────────────────────

interface SwipeViewProps {
  leftImage: string
  rightImage: string
  swipePos: number
  containerRef: React.RefObject<HTMLDivElement>
  onMouseDown: (e: React.MouseEvent) => void
  onTouchMove: (e: React.TouchEvent) => void
  leftLabel: string
  rightLabel: string
}

function SwipeView({ leftImage, rightImage, swipePos, containerRef, onMouseDown, onTouchMove, leftLabel, rightLabel }: SwipeViewProps) {
  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none"
      style={{ cursor: 'col-resize' }}
      onTouchMove={onTouchMove}
    >
      {/* Right image — full width base */}
      <div className="absolute inset-0">
        <img
          src={rightImage}
          alt="Optical result"
          className="w-full h-full object-cover"
          draggable={false}
        />
        {/* Right label */}
        <motion.div
          className="absolute top-4 right-4 flex items-center gap-2"
          animate={{ opacity: swipePos < 85 ? 1 : 0 }}
        >
          <div
            className="px-3 py-1.5 rounded-md text-body-s font-semibold"
            style={{ background: 'rgba(8,13,22,0.9)', border: '1px solid rgba(34,197,94,0.3)', color: '#22C55E' }}
          >
            OPTICAL
          </div>
          <span className="text-caption text-text-tertiary font-mono">{rightLabel}</span>
        </motion.div>
      </div>

      {/* Left image — clipped by swipe position */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${swipePos}%` }}
      >
        <img
          src={leftImage}
          alt="SAR query"
          className="absolute inset-0 h-full object-cover"
          style={{ width: `${100 * (100 / swipePos)}%`, maxWidth: 'none' }}
          draggable={false}
        />
        {/* SAR grayscale overlay */}
        <div
          className="absolute inset-0"
          style={{ background: 'rgba(10,20,40,0.25)', mixBlendMode: 'multiply' }}
        />
      </div>

      {/* Left label */}
      <motion.div
        className="absolute top-4 left-4 flex items-center gap-2"
        animate={{ opacity: swipePos > 15 ? 1 : 0 }}
      >
        <div
          className="px-3 py-1.5 rounded-md text-body-s font-semibold"
          style={{ background: 'rgba(8,13,22,0.9)', border: '1px solid rgba(59,130,246,0.3)', color: '#60A5FA' }}
        >
          SAR
        </div>
        <span className="text-caption text-text-tertiary font-mono">{leftLabel}</span>
      </motion.div>

      {/* Swipe handle */}
      <div
        className="swipe-handle"
        style={{ left: `${swipePos}%`, transform: 'translateX(-50%)' }}
        onMouseDown={onMouseDown}
      >
        {/* Handle grip icon */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 z-20"
          style={{ pointerEvents: 'none' }}
        >
          <div className="w-0.5 h-5 rounded-full" style={{ background: 'rgba(255,255,255,0.5)' }} />
          <div className="w-0.5 h-5 rounded-full" style={{ background: 'rgba(255,255,255,0.5)' }} />
        </div>
      </div>

      {/* Bottom info bar */}
      <div
        className="absolute bottom-0 left-0 right-0 px-5 py-3 flex items-center justify-between"
        style={{ background: 'linear-gradient(to top, rgba(8,13,22,0.9), transparent)' }}
      >
        <div className="flex items-center gap-3">
          <span className="text-caption text-text-tertiary font-mono">RISAT-2B · C-band SAR · σ⁰ VV</span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="text-caption font-semibold font-mono"
            style={{ color: '#14B8A6' }}
          >
            Cross-modal alignment: 89.3%
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Side-by-side / Blend / Difference ────────────────────────────────────────

function SideBySideView({ selectedResult, opacity, mode }: {
  selectedResult: RetrievalResult
  opacity: number
  mode: Mode
}) {
  return (
    <div className="flex-1 flex gap-0 overflow-hidden min-h-0 h-full">
      <div className="flex-1 flex flex-col min-w-0" style={{ borderRight: '1px solid rgba(45,55,72,0.28)' }}>
        <div
          className="px-5 py-3 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(45,55,72,0.22)' }}
        >
          <div className="flex items-center gap-2.5">
            <SensorChip type={mockQueryImage.sensorType} size="sm" />
            <span className="text-body-s text-text-secondary">Query — SAR Image</span>
          </div>
          <span className="mono-value">{mockQueryImage.resolution}</span>
        </div>
        <div className="flex-1 relative overflow-hidden">
          <img
            src={mockQueryImage.thumbnailUrl}
            alt="Query"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div
            className="absolute bottom-3 left-3 px-2.5 py-1 rounded text-caption text-text-secondary"
            style={{ background: 'rgba(8,13,22,0.85)', border: '1px solid rgba(45,55,72,0.3)' }}
          >
            {mockQueryImage.satellite}
          </div>
        </div>
        <div className="px-5 py-3" style={{ borderTop: '1px solid rgba(45,55,72,0.22)' }}>
          <CoordinateDisplay coords={mockQueryImage.coords!} />
          <div className="text-caption text-text-tertiary mt-1">SAR backscatter · σ₀</div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div
          className="px-5 py-3 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(45,55,72,0.22)' }}
        >
          <div className="flex items-center gap-2.5">
            <SensorChip type={selectedResult.sensorType} size="sm" />
            <span className="text-body-s text-text-secondary">Result #{selectedResult.rank} — {selectedResult.sensorType}</span>
          </div>
          <SimilarityBadge score={selectedResult.similarityScore} size="sm" />
        </div>
        <div className="flex-1 relative overflow-hidden">
          <img
            src={selectedResult.thumbnailUrl}
            alt="Result"
            className="absolute inset-0 w-full h-full object-cover"
            style={{ opacity: mode === 'blend' ? opacity / 100 : 1 }}
          />
          <div
            className="absolute bottom-3 left-3 px-2.5 py-1 rounded text-caption text-text-secondary"
            style={{ background: 'rgba(8,13,22,0.85)', border: '1px solid rgba(45,55,72,0.3)' }}
          >
            {selectedResult.satellite}
          </div>
        </div>
        <div className="px-5 py-3" style={{ borderTop: '1px solid rgba(45,55,72,0.22)' }}>
          <CoordinateDisplay coords={selectedResult.location.coords} />
          <div className="text-caption text-text-tertiary mt-1">
            Spectral reflectance · {selectedResult.bands ?? 'Bands auto-selected'}
          </div>
        </div>
      </div>
    </div>
  )
}
