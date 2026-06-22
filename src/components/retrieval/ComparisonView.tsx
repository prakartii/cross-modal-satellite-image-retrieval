import { useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import SensorChip from '@/components/ui/SensorChip'
import SimilarityBadge from '@/components/ui/SimilarityBadge'
import CoordinateDisplay from '@/components/ui/CoordinateDisplay'
import { mockQueryImage } from '@/data/mockResults'

const MODES = ['side-by-side', 'blend', 'difference', 'swipe'] as const
type Mode = typeof MODES[number]

export default function ComparisonView() {
  const results        = useAppStore((s) => s.results)
  const selectedResult = useAppStore((s) => s.selectedResult) ?? results[0]
  const [opacity, setOpacity] = useState(50)
  const [mode, setMode]       = useState<Mode>('side-by-side')

  if (!selectedResult) {
    return (
      <div className="flex items-center justify-center h-full text-text-tertiary text-body-m">
        Select a result to compare
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div
        className="px-6 py-4 flex items-center gap-4 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(45,55,72,0.28)' }}
      >
        <div>
          <h2 className="text-heading-3 text-text-primary font-semibold">Split Comparison</h2>
          <p className="text-caption text-text-tertiary mt-0.5 font-mono">
            Query vs. Result #{selectedResult.rank} · {selectedResult.similarityScore.toFixed(1)}% similarity
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
      <div className="flex-1 flex gap-0 overflow-hidden min-h-0">
        {/* Left — query */}
        <div className="flex-1 flex flex-col min-w-0" style={{ borderRight: '1px solid rgba(45,55,72,0.28)' }}>
          <div
            className="px-5 py-3 flex items-center justify-between flex-shrink-0"
            style={{ borderBottom: '1px solid rgba(45,55,72,0.22)' }}
          >
            <div className="flex items-center gap-2.5">
              <SensorChip type={mockQueryImage.sensorType} size="sm" />
              <span className="text-body-s text-text-secondary">Query Image</span>
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

        {/* Right — result */}
        <div className="flex-1 flex flex-col min-w-0">
          <div
            className="px-5 py-3 flex items-center justify-between flex-shrink-0"
            style={{ borderBottom: '1px solid rgba(45,55,72,0.22)' }}
          >
            <div className="flex items-center gap-2.5">
              <SensorChip type={selectedResult.sensorType} size="sm" />
              <span className="text-body-s text-text-secondary">Result #{selectedResult.rank}</span>
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

      {/* Controls + feature alignment */}
      <div
        className="px-6 py-4 flex-shrink-0 space-y-4"
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

        <div>
          <div className="overline-label mb-2.5">Feature Alignment</div>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Vegetation zones',   value: selectedResult.featureSimilarity.vegetation, color: '#22C55E' },
              { label: 'Water boundaries',   value: selectedResult.featureSimilarity.water,       color: '#3B82F6' },
              { label: 'Cross-modal confidence', value: selectedResult.embeddingDistance ? (1 - selectedResult.embeddingDistance) * 100 : 89.3, color: '#14B8A6' },
            ].map(({ label, value, color }) => (
              <div key={label}>
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
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
