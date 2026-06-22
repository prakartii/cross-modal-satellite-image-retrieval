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
  { key: 'vegetation', label: 'Vegetation Structure', color: '#22C55E' },
  { key: 'water',      label: 'Water Body Pattern',   color: '#3B82F6' },
  { key: 'texture',    label: 'Surface Texture',       color: '#14B8A6' },
  { key: 'urban',      label: 'Urban Density',         color: '#F59E0B' },
  { key: 'cloud',      label: 'Cloud Coverage',        color: '#94A3B8' },
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
            {explanation}
          </p>
        </div>
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
          <ProgressRing value={result.featureSimilarity.vegetation} size={60} strokeWidth={4} color="#22C55E" label="Veg." />
          <ProgressRing value={result.featureSimilarity.water}      size={60} strokeWidth={4} color="#3B82F6" label="Water" />
          <ProgressRing value={result.featureSimilarity.texture}    size={60} strokeWidth={4} color="#14B8A6" label="Texture" />
          <ProgressRing value={result.featureSimilarity.urban}      size={60} strokeWidth={4} color="#F59E0B" label="Urban" />
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
    vegetation: 'vegetation structure',
    water: 'water body patterns',
    texture: 'surface texture distribution',
    urban: 'urban density patterns',
    cloud: 'atmospheric conditions',
  }
  const score = result.featureSimilarity[primaryKey]
  const sensorMap: Record<string, string> = {
    SAR: 'radar backscatter signatures',
    Optical: 'spectral reflectance profile',
    Multispectral: 'multi-band spectral signature',
  }
  return `Retrieved primarily due to high ${featureNames[primaryKey]} similarity (${score}%). The ${sensorMap[result.sensorType]} of this ${result.sensorType} observation from ${result.satellite} closely matches the spatial geometry of the SAR query in the shared embedding space.`
}
