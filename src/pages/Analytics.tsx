import { motion } from 'framer-motion'
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { TrendingUp, TrendingDown, Activity, Clock, Target, Layers } from 'lucide-react'
import { analyticsMetrics, crossModalMatrix, queryVolumeData, sensorDistribution } from '@/data/analytics'
import { mockResults } from '@/data/mockResults'
import { cn } from '@/lib/utils'

const CHART_COLORS = {
  primary:   '#3B82F6',
  secondary: '#14B8A6',
  success:   '#22C55E',
  warning:   '#F59E0B',
  danger:    '#EF4444',
  muted:     '#4A5568',
}

const TOOLTIP = {
  contentStyle: {
    background: 'rgba(10, 15, 26, 0.97)',
    border: '1px solid rgba(45, 55, 72, 0.45)',
    borderRadius: '6px',
    fontSize: '11px',
    color: '#F8FAFC',
    boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
  },
  labelStyle: { color: '#64748B', marginBottom: 4 },
  cursor: { stroke: 'rgba(45,55,72,0.4)', strokeWidth: 1 },
}

const GRID_STYLE = { stroke: 'rgba(45,55,72,0.2)', strokeDasharray: 'none' }
const AXIS_TICK  = { fill: '#4A5568', fontSize: 10 }

// Semantic similarity histogram derived from mockResults
const SIM_BINS = [
  { range: '65–70', min: 65, max: 70, label: '65' },
  { range: '70–75', min: 70, max: 75, label: '70' },
  { range: '75–80', min: 75, max: 80, label: '75' },
  { range: '80–85', min: 80, max: 85, label: '80' },
  { range: '85–90', min: 85, max: 90, label: '85' },
  { range: '90–95', min: 90, max: 95, label: '90' },
]
const similarityDistribution = SIM_BINS.map((bin) => ({
  range: bin.range,
  label: bin.label,
  count: mockResults.filter((r) => r.similarityScore >= bin.min && r.similarityScore < bin.max).length,
}))

// Sensor correlation matrix
const SENSORS = ['SAR', 'Optical', 'Multi']
const CORR_VALUES: Record<string, number> = {
  'SAR→SAR':           100,
  'SAR→Optical':       91.2,
  'SAR→Multi':         88.7,
  'Optical→SAR':       84.7,
  'Optical→Optical':   100,
  'Optical→Multi':     93.1,
  'Multi→SAR':         82.3,
  'Multi→Optical':     90.4,
  'Multi→Multi':       100,
}

export default function Analytics() {
  return (
    <div className="h-full overflow-y-auto scrollbar-hide">
      {/* Page header */}
      <div className="px-8 py-6" style={{ borderBottom: '1px solid rgba(45,55,72,0.25)' }}>
        <div className="flex items-end justify-between">
          <div>
            <div className="overline-label mb-1.5">AKSHA · Earth Intelligence Platform</div>
            <h1 className="text-heading-1 text-text-primary font-semibold">System Analytics</h1>
            <p className="text-body-s text-text-tertiary mt-1">
              Cross-modal retrieval performance · updated {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-2 pb-1">
            <div className="status-live" />
            <span className="text-caption text-text-tertiary">Live</span>
          </div>
        </div>
      </div>

      <div className="px-8 py-7 space-y-8">

        {/* Key metrics */}
        <div>
          <div className="overline-label mb-4">Retrieval Performance</div>
          <div className="grid grid-cols-4 gap-4">
            {analyticsMetrics.map((metric, i) => (
              <MetricCard key={metric.label} metric={metric} index={i} />
            ))}
          </div>
        </div>

        {/* Query volume + sensor split */}
        <div className="grid grid-cols-3 gap-5">
          <ChartContainer
            className="col-span-2"
            label="Query Volume"
            description="Hourly query distribution — last 24 hours"
          >
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={queryVolumeData}>
                <defs>
                  <linearGradient id="qGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={CHART_COLORS.primary} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <CartesianGrid {...GRID_STYLE} vertical={false} />
                <XAxis dataKey="time" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis              tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <Tooltip {...TOOLTIP} />
                <Area type="monotone" dataKey="queries" stroke={CHART_COLORS.primary}
                  strokeWidth={1.5} fill="url(#qGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartContainer>

          <ChartContainer label="Archive Distribution" description="By sensor type">
            <ResponsiveContainer width="100%" height={130}>
              <PieChart>
                <Pie
                  data={sensorDistribution}
                  cx="50%" cy="50%"
                  innerRadius={38} outerRadius={58}
                  dataKey="value" paddingAngle={4}
                >
                  {sensorDistribution.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} opacity={0.82} />
                  ))}
                </Pie>
                <Tooltip {...TOOLTIP} formatter={(v: number) => [`${v}%`, 'Share']} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 mt-1">
              {sensorDistribution.map((s) => (
                <div key={s.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
                    <span className="text-caption text-text-secondary">{s.name}</span>
                  </div>
                  <span className="font-mono text-caption" style={{ color: s.color }}>{s.value}%</span>
                </div>
              ))}
            </div>
          </ChartContainer>
        </div>

        {/* Precision + Latency trends */}
        <div className="grid grid-cols-2 gap-5">
          <ChartContainer label="Retrieval Precision Trends" description="Precision@5 and F1@10 over 6 months">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={analyticsMetrics[0].history.map((h, i) => ({
                time: h.time,
                'Precision@5': h.value,
                'F1@10': analyticsMetrics[1].history[i]?.value ?? 0,
              }))}>
                <CartesianGrid {...GRID_STYLE} vertical={false} />
                <XAxis dataKey="time" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis domain={[70, 100]} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <Tooltip {...TOOLTIP} />
                <Legend wrapperStyle={{ fontSize: '10px', color: '#64748B', paddingTop: 8 }} />
                <Line type="monotone" dataKey="Precision@5" stroke={CHART_COLORS.primary}
                  strokeWidth={1.5} dot={{ r: 2.5, fill: CHART_COLORS.primary }} />
                <Line type="monotone" dataKey="F1@10" stroke={CHART_COLORS.secondary}
                  strokeWidth={1.5} dot={{ r: 2.5, fill: CHART_COLORS.secondary }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>

          <ChartContainer label="Retrieval Latency" description="P95 query response time (seconds)">
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={analyticsMetrics[2].history}>
                <defs>
                  <linearGradient id="lGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={CHART_COLORS.success} stopOpacity={0.15} />
                    <stop offset="100%" stopColor={CHART_COLORS.success} stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <CartesianGrid {...GRID_STYLE} vertical={false} />
                <XAxis dataKey="time" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 4]} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <Tooltip {...TOOLTIP} formatter={(v: number) => [`${v}s`, 'Latency']} />
                <Area type="monotone" dataKey="value" stroke={CHART_COLORS.success}
                  strokeWidth={1.5} fill="url(#lGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartContainer>
        </div>

        {/* Cross-modal matrix */}
        <div>
          <div className="overline-label mb-4">Cross-Modal Performance Matrix</div>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(45,55,72,0.28)' }}>
            <table className="w-full text-body-s">
              <thead>
                <tr style={{ background: 'rgba(17,24,39,0.7)', borderBottom: '1px solid rgba(45,55,72,0.25)' }}>
                  <th className="text-left py-3 px-5 overline-label font-medium">Modality Pair</th>
                  <th className="text-right py-3 px-4 overline-label font-medium">Precision@5</th>
                  <th className="text-right py-3 px-4 overline-label font-medium">Recall@10</th>
                  <th className="text-right py-3 px-4 overline-label font-medium">F1 Score</th>
                  <th className="text-left  py-3 px-5 overline-label font-medium">Quality</th>
                </tr>
              </thead>
              <tbody>
                {crossModalMatrix.map((row, i) => (
                  <tr
                    key={row.from}
                    className="transition-colors"
                    style={{
                      background: i % 2 === 0 ? 'transparent' : 'rgba(17,24,39,0.3)',
                      borderBottom: '1px solid rgba(45,55,72,0.15)',
                    }}
                  >
                    <td className="py-3 px-5 text-text-primary font-medium">{row.from}</td>
                    <td className="text-right py-3 px-4">
                      <HeatCell value={row.precision5} />
                    </td>
                    <td className="text-right py-3 px-4">
                      <HeatCell value={row.recall10} />
                    </td>
                    <td className="text-right py-3 px-4">
                      <HeatCell value={row.f1} />
                    </td>
                    <td className="py-3 px-5">
                      <QualityBadge score={row.f1} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sensor Correlation Matrix + Similarity Distribution */}
        <div className="grid grid-cols-2 gap-5">
          <ChartContainer
            label="Sensor Correlation Matrix"
            description="Cross-modal retrieval accuracy between sensor types"
          >
            <SensorCorrelationMatrix />
          </ChartContainer>

          <ChartContainer
            label="Semantic Similarity Distribution"
            description="Score distribution across retrieved observations"
          >
            <SimilarityHistogram data={similarityDistribution} />
          </ChartContainer>
        </div>

        <div className="h-16" />
      </div>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SensorCorrelationMatrix() {
  return (
    <div>
      {/* Column headers */}
      <div className="flex mb-1.5 pl-14">
        {SENSORS.map((s) => (
          <div key={s} className="flex-1 text-center text-overline text-text-tertiary">{s}</div>
        ))}
      </div>

      {/* Rows */}
      <div className="space-y-1.5">
        {SENSORS.map((row) => (
          <div key={row} className="flex items-center gap-1.5">
            {/* Row label */}
            <div className="w-12 text-overline text-text-tertiary text-right flex-shrink-0">{row}</div>

            {/* Cells */}
            {SENSORS.map((col) => {
              const key = `${row}→${col}`
              const val = CORR_VALUES[key] ?? 0
              const isSame = row === col
              const hue = isSame ? 180 : val >= 90 ? 145 : val >= 85 ? 217 : 38
              const alpha = isSame ? 0.2 : (val - 70) / 30 * 0.35

              return (
                <div
                  key={col}
                  className="flex-1 aspect-square rounded-md flex flex-col items-center justify-center transition-colors"
                  style={{
                    background: isSame
                      ? 'rgba(20,184,166,0.12)'
                      : `hsla(${hue}, 80%, 60%, ${alpha})`,
                    border: `1px solid hsla(${hue}, 60%, 55%, ${isSame ? 0.3 : alpha * 1.5})`,
                    minHeight: 52,
                  }}
                >
                  <div
                    className="font-mono font-semibold"
                    style={{
                      fontSize: 13,
                      color: isSame ? '#14B8A6' : val >= 90 ? '#22C55E' : val >= 85 ? '#3B82F6' : '#F59E0B',
                    }}
                  >
                    {isSame ? '—' : `${val.toFixed(0)}%`}
                  </div>
                  {!isSame && (
                    <div className="text-overline text-text-tertiary mt-0.5">
                      {row[0]}→{col[0]}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Scale legend */}
      <div className="flex items-center gap-2 mt-4">
        <span className="text-overline text-text-tertiary">Low</span>
        <div className="flex-1 h-1 rounded-full" style={{
          background: 'linear-gradient(to right, rgba(245,158,11,0.5), rgba(59,130,246,0.5), rgba(34,197,94,0.5))'
        }} />
        <span className="text-overline text-text-tertiary">High</span>
      </div>
    </div>
  )
}

function SimilarityHistogram({ data }: { data: { range: string; label: string; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1)

  return (
    <div>
      {/* Bar chart */}
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid {...GRID_STYLE} vertical={false} />
          <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false}
            tickFormatter={(v) => `${v}%`} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            {...TOOLTIP}
            formatter={(v: number) => [v, 'Observations']}
            labelFormatter={(l) => `${l}–${Number(l) + 5}% similarity`}
          />
          <Bar dataKey="count" radius={[3, 3, 0, 0]}>
            {data.map((entry, i) => {
              const intensity = entry.count / max
              const color = entry.label >= '90' ? '#22C55E' :
                            entry.label >= '85' ? '#3B82F6' :
                            entry.label >= '80' ? '#14B8A6' : '#F59E0B'
              return <Cell key={i} fill={color} opacity={0.6 + intensity * 0.35} />
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Summary row */}
      <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px solid rgba(45,55,72,0.25)' }}>
        <div>
          <div className="font-mono text-heading-3 font-bold text-text-primary">
            {(mockResults.reduce((s, r) => s + r.similarityScore, 0) / mockResults.length).toFixed(1)}%
          </div>
          <div className="text-overline text-text-tertiary mt-0.5">Mean similarity</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-heading-3 font-bold" style={{ color: '#22C55E' }}>
            {mockResults.filter(r => r.similarityScore >= 85).length}
          </div>
          <div className="text-overline text-text-tertiary mt-0.5">Above 85%</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-heading-3 font-bold" style={{ color: '#3B82F6' }}>
            {mockResults[0].similarityScore.toFixed(1)}%
          </div>
          <div className="text-overline text-text-tertiary mt-0.5">Top match</div>
        </div>
      </div>
    </div>
  )
}

function HeatCell({ value }: { value: number }) {
  const color = value >= 90 ? '#22C55E' : value >= 85 ? '#3B82F6' : value >= 80 ? '#14B8A6' : '#F59E0B'
  return (
    <span className="font-mono text-body-s font-semibold" style={{ color }}>
      {value.toFixed(1)}%
    </span>
  )
}

function ChartContainer({
  label, description, children, className = '',
}: {
  label: string; description: string; children: React.ReactNode; className?: string
}) {
  return (
    <div
      className={cn('p-5 rounded-xl', className)}
      style={{ background: 'rgba(17, 24, 39, 0.45)', border: '1px solid rgba(45, 55, 72, 0.25)' }}
    >
      <div className="mb-4">
        <div className="overline-label mb-0.5">{label}</div>
        <div className="text-caption text-text-tertiary">{description}</div>
      </div>
      {children}
    </div>
  )
}

function MetricCard({ metric, index }: { metric: typeof analyticsMetrics[0]; index: number }) {
  const isLatency  = metric.unit === 's'
  const isPositive = isLatency ? metric.trend < 0 : metric.trend > 0
  const icons   = [Target, Activity, Clock, Layers]
  const Icon    = icons[index]
  const colors  = [CHART_COLORS.primary, CHART_COLORS.secondary, CHART_COLORS.warning, CHART_COLORS.success]
  const color   = colors[index]

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07 }}
      className="p-5 rounded-xl"
      style={{ background: 'rgba(17, 24, 39, 0.45)', border: '1px solid rgba(45, 55, 72, 0.25)' }}
    >
      <div className="flex items-start justify-between mb-4">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${color}12` }}
        >
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        <div className={cn('flex items-center gap-1 text-caption font-mono', isPositive ? 'text-success' : 'text-danger')}>
          {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {Math.abs(metric.trend).toFixed(1)}{metric.unit}
        </div>
      </div>

      <div className="font-mono text-display-l font-bold" style={{ color }}>
        {metric.value.toFixed(1)}{metric.unit}
      </div>
      <div className="text-body-s text-text-secondary mt-1.5">{metric.label}</div>

      <div className="mt-3 h-8">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={metric.history}>
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  )
}

function QualityBadge({ score }: { score: number }) {
  const [label, color] =
    score >= 90 ? ['Excellent', '#22C55E'] :
    score >= 80 ? ['Good',      '#3B82F6'] :
    score >= 70 ? ['Fair',      '#F59E0B'] :
                  ['Low',       '#EF4444']

  return (
    <span
      className="px-2 py-0.5 rounded text-caption font-medium"
      style={{ background: `${color}10`, border: `1px solid ${color}28`, color }}
    >
      {label}
    </span>
  )
}
