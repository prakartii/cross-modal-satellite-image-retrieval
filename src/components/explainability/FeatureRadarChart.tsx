import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip } from 'recharts'
import type { FeatureSimilarity } from '@/types'

interface FeatureRadarChartProps {
  features: FeatureSimilarity
  color?: string
}

export default function FeatureRadarChart({ features, color = '#3B82F6' }: FeatureRadarChartProps) {
  const data = [
    { subject: 'Vegetation', value: features.vegetation },
    { subject: 'Water',      value: features.water },
    { subject: 'Texture',    value: features.texture },
    { subject: 'Urban',      value: features.urban },
    { subject: 'Cloud',      value: features.cloud },
  ]

  return (
    <ResponsiveContainer width="100%" height={200}>
      <RadarChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
        <PolarGrid stroke="#2D3748" strokeDasharray="3 3" />
        <PolarAngleAxis
          dataKey="subject"
          tick={{ fill: '#64748B', fontSize: 11, fontFamily: 'Inter' }}
        />
        <Radar
          name="Similarity"
          dataKey="value"
          stroke={color}
          fill={color}
          fillOpacity={0.2}
          strokeWidth={1.5}
          dot={{ fill: color, strokeWidth: 0, r: 3 }}
        />
        <Tooltip
          contentStyle={{
            background: '#1A2333', border: '1px solid #2D3748',
            borderRadius: '8px', fontSize: '12px', color: '#F8FAFC',
          }}
          formatter={(val: number) => [`${val}%`, 'Similarity']}
        />
      </RadarChart>
    </ResponsiveContainer>
  )
}
