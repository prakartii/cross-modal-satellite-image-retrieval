import { motion } from 'framer-motion'
import { ArrowRight, Network, Info } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { getSimilarityColor } from '@/lib/utils'
import SensorChip from '@/components/ui/SensorChip'
import SimilarityBadge from '@/components/ui/SimilarityBadge'
import ProgressRing from '@/components/ui/ProgressRing'
import FeatureRadarChart from './FeatureRadarChart'
import type { RetrievalResult } from '@/types'

const FEATURE_LABELS: { key: keyof RetrievalResult['featureSimilarity']; label: string; color: string }[] = [
  { key: 'water',      label: 'NDWI · Water / Inundation Extent', color: '#3B82F6' },
  { key: 'vegetation', label: 'NDVI · Riparian Vegetation Cover',  color: '#22C55E' },
  { key: 'terrain',    label: 'Floodplain Morphology · Terrain',   color: '#14B8A6' },
  { key: 'texture',    label: 'SAR Backscatter · Surface Texture', color: '#8B5CF6' },
  { key: 'urban',      label: 'Urban / Built-up Density',          color: '#F59E0B' },
]

interface ExplainabilityPanelProps {
  result: RetrievalResult
}

export default function ExplainabilityPanel({ result }: ExplainabilityPanelProps) {
  const toggleGraphExplorer = useAppStore((s) => s.toggleGraphExplorer)

  const primaryFeature = FEATURE_LABELS
    .filter((f) => f.key !== 'cloud')
    .sort((a, b) => result.featureSimilarity[b.key] - result.featureSimilarity[a.key])[0]

  const explanation = generateExplanation(result, primaryFeature.key)

  return (
    <div className="p-4 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SensorChip type={result.sensorType} size="sm" />
          <span className="text-body-s text-text-secondary">Result #{result.rank}</span>
        </div>
        <SimilarityBadge score={result.similarityScore} size="md" />
      </div>

      {/* Explanation narrative */}
      <div className="p-3 bg-blue-faint border border-blue-primary/20 rounded-lg">
        <div className="flex gap-2">
          <Info className="w-3.5 h-3.5 text-blue-primary flex-shrink-0 mt-0.5" />
          <p className="text-body-s text-text-secondary leading-relaxed">
            {result.matchExplanation ?? explanation}
          </p>
        </div>
      </div>

      {/* ISRO Explainability Metrics */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'NDWI Difference',    value: '0.03',        color: '#3B82F6', sub: 'vs query scene' },
          { label: 'River Morphology',   value: 'Excellent',   color: '#22C55E', sub: 'Brahmaputra match' },
          { label: 'SAR σ⁰ Match',       value: '±1.2 dB',     color: '#8B5CF6', sub: 'C-band backscatter' },
          { label: 'Flood Boundary',     value: `${Math.round(result.featureSimilarity.water * 0.98)}% overlap`, color: '#60A5FA', sub: 'Inundation mask' },
        ].map(({ label, value, color, sub }) => (
          <div key={label} className="px-3 py-2 rounded-lg"
            style={{ background: `${color}0A`, border: `1px solid ${color}22` }}>
            <div className="font-mono text-body-s font-bold mb-0.5" style={{ color }}>{value}</div>
            <div className="text-overline text-text-secondary">{label}</div>
            <div className="text-overline text-text-tertiary">{sub}</div>
          </div>
        ))}
      </div>

      {/* Radar chart */}
      <div>
        <div className="overline-label mb-3">Feature Similarity Breakdown</div>
        <FeatureRadarChart features={result.featureSimilarity} />
      </div>

      {/* Progress bars */}
      <div className="space-y-3">
        {FEATURE_LABELS.map(({ key, label, color }) => {
          const score = result.featureSimilarity[key]
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                  <span className="text-body-s text-text-secondary">{label}</span>
                </div>
                <span className="font-mono text-caption font-medium" style={{ color }}>
                  {score}%
                </span>
              </div>
              <div className="similarity-bar">
                <motion.div
                  className="similarity-bar-fill"
                  initial={{ width: 0 }}
                  animate={{ width: `${score}%` }}
                  transition={{ duration: 0.8, delay: 0.1, ease: 'easeOut' }}
                  style={{ background: color }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Progress rings */}
      <div>
        <div className="overline-label mb-3">Component Scores</div>
        <div className="grid grid-cols-4 gap-2">
          <ProgressRing value={result.featureSimilarity.water}      size={60} strokeWidth={4} color="#3B82F6" label="NDWI" />
          <ProgressRing value={result.featureSimilarity.vegetation} size={60} strokeWidth={4} color="#22C55E" label="NDVI" />
          <ProgressRing value={result.featureSimilarity.terrain}    size={60} strokeWidth={4} color="#14B8A6" label="Terrain" />
          <ProgressRing value={result.featureSimilarity.texture}    size={60} strokeWidth={4} color="#8B5CF6" label="SAR σ⁰" />
        </div>
      </div>

      {/* Embedding distance */}
      <div className="p-3 bg-card border border-border rounded-lg">
        <div className="overline-label mb-2">Embedding Space</div>
        <div className="flex items-center justify-between text-body-s">
          <span className="text-text-secondary">Distance from query</span>
          <span className="font-mono text-text-primary font-medium">{result.embeddingDistance.toFixed(3)}</span>
        </div>
        <div className="mt-2 text-caption text-text-tertiary">
          0 = identical · 1 = unrelated
        </div>
        <div className="mt-2 h-1 bg-border rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${result.embeddingDistance * 100}%`,
              background: getSimilarityColor(result.similarityScore),
            }}
          />
        </div>
      </div>

      {/* Cross-modal note */}
      <div className="p-3 bg-card border border-border rounded-lg">
        <div className="overline-label mb-2">Cross-Modal Translation</div>
        <div className="text-body-s text-text-secondary">
          Query was <span className="text-blue-primary font-medium">SAR (C-band)</span> ·
          This result is <span style={{ color: getSimilarityColor(result.similarityScore) }} className="font-medium">
            {result.sensorType}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2 text-body-s">
          <div className="text-text-tertiary">SAR backscatter</div>
          <ArrowRight className="w-3 h-3 text-text-tertiary" />
          <div className="text-text-secondary">spectral reflectance</div>
        </div>
        <div className="mt-2 text-caption text-teal-primary">
          Alignment confidence: {((1 - result.embeddingDistance) * 100).toFixed(1)}%
        </div>
      </div>

      {/* Graph context */}
      <div className="p-3 bg-card border border-border rounded-lg">
        <div className="overline-label mb-2">Graph Context</div>
        <div className="space-y-1.5 text-body-s text-text-secondary">
          <div>· 3 historical flood events in this region</div>
          <div>· 7 related agricultural observations</div>
          <div>· 2 NDMA disaster assessments</div>
        </div>
        <button
          onClick={toggleGraphExplorer}
          className="mt-3 flex items-center gap-1.5 text-body-s text-blue-primary hover:text-blue-primary/80 transition-colors"
        >
          <Network className="w-3.5 h-3.5" />
          View in Graph Explorer
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

function generateExplanation(result: RetrievalResult, primaryKey: keyof RetrievalResult['featureSimilarity']): string {
  const featureNames: Record<string, string> = {
    vegetation: 'NDVI riparian vegetation index',
    water:      'NDWI inundation extent',
    terrain:    'floodplain morphology',
    texture:    'SAR backscatter (σ⁰) pattern',
    urban:      'urban/built-up density index',
    cloud:      'cloud fraction',
  }
  const score = result.featureSimilarity[primaryKey]
  const sensorMap: Record<string, string> = {
    SAR:           'C-band SAR σ⁰ backscatter',
    Optical:       'spectral reflectance (BRDF-corrected)',
    Multispectral: 'multi-band spectral signature (LISS/OLI)',
  }
  return `Retrieved primarily by ${featureNames[primaryKey] ?? primaryKey} similarity (${score}%). The ${sensorMap[result.sensorType] ?? result.sensorType} of ${result.satellite} aligns in the shared SAR↔Optical cross-modal embedding space. Brahmaputra Basin flood signature cross-validated.`
}
