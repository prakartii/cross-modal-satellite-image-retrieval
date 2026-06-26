import { motion } from 'framer-motion'
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { TrendingUp, TrendingDown, Activity, Clock, Target, Layers, AlertTriangle, Satellite, Zap, Globe, Waves, Leaf } from 'lucide-react'
import {
  analyticsMetrics, crossModalMatrix, queryVolumeData, sensorDistribution,
  acquisitionThroughput, activeRegions, disasterTimeline, latencyBreakdown,
  sensorUtilization, missionKPIs,
} from '@/data/analytics'
import { mockResults } from '@/data/mockResults'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/utils'

const TOOLTIP_STYLE = {
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

const GRID = { stroke: 'rgba(45,55,72,0.2)', strokeDasharray: 'none' as const }
const TICK = { fill: '#4A5568', fontSize: 10 }

const SENSOR_COLORS = { sar: '#3B82F6', optical: '#22C55E', multi: '#F59E0B' }

const SEVERITY_CONFIG: Record<string, { color: string; bg: string }> = {
  HIGH:   { color: '#EF4444', bg: 'rgba(239,68,68,0.1)'   },
  MEDIUM: { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)'  },
  LOW:    { color: '#22C55E', bg: 'rgba(34,197,94,0.1)'   },
}

const EVENT_COLORS: Record<string, string> = {
  flood: '#3B82F6', fire: '#EF4444', cyclone: '#8B5CF6',
}

const SIM_BINS = [
  { range: '65–70', label: '65', min: 65, max: 70 },
  { range: '70–75', label: '70', min: 70, max: 75 },
  { range: '75–80', label: '75', min: 75, max: 80 },
  { range: '80–85', label: '80', min: 80, max: 85 },
  { range: '85–90', label: '85', min: 85, max: 90 },
  { range: '90–95', label: '90', min: 90, max: 95 },
]

const SENSORS_MATRIX = ['SAR', 'Optical', 'Multi']
const CORR: Record<string, number> = {
  'SAR→SAR': 100, 'SAR→Optical': 91.2, 'SAR→Multi': 88.7,
  'Optical→SAR': 84.7, 'Optical→Optical': 100, 'Optical→Multi': 93.1,
  'Multi→SAR': 82.3, 'Multi→Optical': 90.4, 'Multi→Multi': 100,
}

export default function Analytics() {
  const missionAnalytics = useAppStore((s) => s.missionAnalytics)
  const currentMission   = useAppStore((s) => s.currentMission)
  const activeMission    = useAppStore((s) => s.activeMission)
  const backendAvailable = useAppStore((s) => s.backendAvailable)
  const results          = useAppStore((s) => s.results)

  const hasMission = !!missionAnalytics && !!currentMission

  // Derive similarity distribution from mission results or fallback to mockResults
  const scoreSource = results.length > 0 ? results : mockResults
  const similarityDistribution = SIM_BINS.map((bin) => ({
    ...bin,
    count: scoreSource.filter((r) => r.similarityScore >= bin.min && r.similarityScore < bin.max).length,
  }))

  const totalScenesToday = acquisitionThroughput[acquisitionThroughput.length - 1]
  const totalToday = totalScenesToday.sar + totalScenesToday.optical + totalScenesToday.multi

  // Mission-derived KPI cards (shown instead of global KPIs when a mission is active)
  const missionKpiCards = hasMission ? [
    {
      label: 'Mission Confidence',
      value: `${missionAnalytics.confidence.overall}%`,
      sub:   `${missionAnalytics.confidence.level} · ${currentMission.events[0]?.event_type ?? 'Flood'} signature confirmed`,
      color: '#3B82F6',
      up:    true,
      Icon:  Target,
    },
    {
      label: 'Water / Inundation',
      value: `${missionAnalytics.coverage.water_pct}%`,
      sub:   'Active inundation extent · Brahmaputra corridor',
      color: '#60A5FA',
      up:    true,
      Icon:  Waves,
    },
    {
      label: 'Vegetation Cover',
      value: `${missionAnalytics.coverage.vegetation_pct}%`,
      sub:   'NDVI-derived · flood-impacted reduction',
      color: '#22C55E',
      up:    false,
      Icon:  Leaf,
    },
    {
      label: 'Archive Matches',
      value: `${missionAnalytics.retrieval.total_results}`,
      sub:   `Top: ${missionAnalytics.retrieval.top_similarity.toFixed(1)}% · mean: ${missionAnalytics.retrieval.mean_similarity.toFixed(1)}%`,
      color: '#14B8A6',
      up:    true,
      Icon:  Satellite,
    },
  ] : null

  return (
    <div className="h-full overflow-y-auto scrollbar-hide">
      {/* Header */}
      <div className="px-8 py-5 flex items-end justify-between" style={{ borderBottom: '1px solid rgba(45,55,72,0.25)' }}>
        <div>
          <div className="overline-label mb-1.5">
            ISRO AKSHA · {hasMission ? 'Active Mission Analytics' : 'Mission Control Analytics'}
          </div>
          <h1 className="text-heading-1 text-text-primary font-semibold">
            {hasMission ? 'Mission Intelligence Report' : 'Mission Dashboard'}
          </h1>
          {hasMission ? (
            <p className="text-body-s text-text-tertiary mt-0.5">
              {activeMission?.name ?? 'Active Mission'} · {String(missionAnalytics.scene_info.region ?? '')} · {String(missionAnalytics.scene_info.sensor ?? '')}
            </p>
          ) : (
            <p className="text-body-s text-text-tertiary mt-0.5">
              DOY 175 · 2024 · Reporting period: 7 days · 06 platforms active
            </p>
          )}
        </div>
        <div className="flex items-center gap-4 pb-1">
          {hasMission ? (
            <>
              <div className="text-right">
                <div className="font-mono text-heading-2 font-bold text-text-primary">{missionAnalytics.retrieval.total_results}</div>
                <div className="text-overline text-text-tertiary">archive matches</div>
              </div>
              <div className="w-px h-8 mx-1" style={{ background: 'rgba(45,55,72,0.35)' }} />
              <div className="text-right">
                <div className="font-mono text-heading-2 font-bold" style={{ color: '#3B82F6' }}>{missionAnalytics.confidence.overall}%</div>
                <div className="text-overline text-text-tertiary">mission confidence</div>
              </div>
              <div className="w-px h-8 mx-1" style={{ background: 'rgba(45,55,72,0.35)' }} />
              <div className="flex items-center gap-2">
                <div className={backendAvailable === false ? 'w-1.5 h-1.5 rounded-full bg-warning flex-shrink-0' : 'status-live'} />
                <span className="text-caption text-text-tertiary">
                  {backendAvailable === false ? 'Demo Mode' : 'Live AI Backend'}
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="text-right">
                <div className="font-mono text-heading-2 font-bold text-text-primary">{totalToday}</div>
                <div className="text-overline text-text-tertiary">scenes today</div>
              </div>
              <div className="w-px h-8 mx-1" style={{ background: 'rgba(45,55,72,0.35)' }} />
              <div className="flex items-center gap-2">
                <div className="status-live" />
                <span className="text-caption text-text-tertiary">Live · UTC 14:27:09</span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="px-8 py-6 space-y-7">

        {/* ── Mission KPI Hero Row ─────────────────────────────────────────── */}
        <div>
          <div className="overline-label mb-3">
            {hasMission ? 'Mission KPIs · Active Intelligence Run' : 'Mission KPIs · Last 24 hours'}
          </div>
          <div className="grid grid-cols-4 gap-4">
            {(missionKpiCards ?? missionKPIs.map((kpi, i) => {
              const icons = [Globe, AlertTriangle, Zap, Satellite]
              return { ...kpi, Icon: icons[i] }
            })).map((kpi, i) => {
              const Icon = (kpi as { Icon: typeof Globe }).Icon
              return (
                <motion.div key={kpi.label}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  whileHover={{ y: -2, boxShadow: `0 8px 24px ${kpi.color}18` }}
                  transition={{ delay: i * 0.06, duration: 0.2 }}
                  className="px-5 py-4 rounded-xl relative overflow-hidden cursor-default"
                  style={{ background: `${kpi.color}08`, border: `1px solid ${kpi.color}22` }}>
                  <div className="absolute top-0 right-0 w-16 h-16 rounded-full blur-2xl pointer-events-none"
                    style={{ background: kpi.color, opacity: 0.06, transform: 'translate(25%, -25%)' }} />
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-7 h-7 rounded-md flex items-center justify-center"
                      style={{ background: `${kpi.color}18` }}>
                      <Icon className="w-3.5 h-3.5" style={{ color: kpi.color }} />
                    </div>
                    <div className="flex items-center gap-1 text-caption font-mono"
                      style={{ color: kpi.up ? '#22C55E' : '#F59E0B' }}>
                      {kpi.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    </div>
                  </div>
                  <div className="font-mono leading-none mb-1.5" style={{ fontSize: 28, fontWeight: 700, color: kpi.color }}>
                    {kpi.value}
                  </div>
                  <div className="text-body-s font-medium text-text-secondary">{kpi.label}</div>
                  <div className="text-caption text-text-tertiary mt-0.5">{kpi.sub}</div>
                </motion.div>
              )
            })}
          </div>
        </div>

        {/* ── Mission Land Cover (only when mission is active) ──────────────── */}
        {hasMission && (
          <div className="grid grid-cols-2 gap-5">
            <Panel label="Mission Land Cover Composition" sub="Scene analysis from uploaded image · derived from feature extraction">
              <div className="space-y-4 mt-1">
                {[
                  { label: 'Water / Inundated', pct: missionAnalytics.coverage.water_pct, color: '#3B82F6' },
                  { label: 'Vegetation',        pct: missionAnalytics.coverage.vegetation_pct, color: '#22C55E' },
                  { label: 'Urban / Built-up',  pct: missionAnalytics.coverage.urban_pct, color: '#F59E0B' },
                  { label: 'Bare Soil / Other', pct: missionAnalytics.coverage.bare_soil_pct, color: '#94A3B8' },
                  { label: 'Cloud Cover',       pct: missionAnalytics.coverage.cloud_pct, color: '#475569' },
                ].map((row, i) => (
                  <div key={row.label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-body-s text-text-secondary">{row.label}</span>
                      <span className="font-mono text-body-s font-semibold" style={{ color: row.color }}>{row.pct.toFixed(0)}%</span>
                    </div>
                    <div className="w-full rounded-full overflow-hidden" style={{ height: 5, background: 'rgba(45,55,72,0.35)' }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${row.pct}%` }}
                        transition={{ duration: 0.7, delay: i * 0.1, ease: 'easeOut' }}
                        style={{ height: '100%', background: row.color, borderRadius: 4, opacity: 0.85 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel label="Mission Processing Breakdown" sub="Pipeline stage durations · AKSHA v3.0 intelligence run">
              <div className="space-y-4 mt-1">
                {Object.entries(missionAnalytics.processing.stage_breakdown).map(([stage, ms], i) => {
                  const maxMs = Math.max(...Object.values(missionAnalytics.processing.stage_breakdown))
                  const colors = ['#3B82F6', '#14B8A6', '#22C55E', '#8B5CF6', '#F59E0B', '#3B82F6', '#EF4444', '#14B8A6', '#22C55E']
                  const color = colors[i % colors.length]
                  const label = stage.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                  return (
                    <div key={stage}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-caption text-text-secondary">{label}</span>
                        <span className="font-mono text-caption" style={{ color }}>{ms}ms</span>
                      </div>
                      <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: 'rgba(45,55,72,0.35)' }}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(ms / maxMs) * 100}%` }}
                          transition={{ duration: 0.6, delay: i * 0.07, ease: 'easeOut' }}
                          style={{ height: '100%', background: color, borderRadius: 4, opacity: 0.82 }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: '1px solid rgba(45,55,72,0.2)' }}>
                <div>
                  <div className="font-mono text-heading-3 font-bold text-text-primary">{missionAnalytics.processing.total_seconds.toFixed(1)}s</div>
                  <div className="text-overline text-text-tertiary mt-0.5">Total pipeline</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-heading-3 font-bold" style={{ color: '#F59E0B' }}>{missionAnalytics.processing.slowest_stage.replace(/_/g, ' ')}</div>
                  <div className="text-overline text-text-tertiary mt-0.5">Slowest stage</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-heading-3 font-bold" style={{ color: '#22C55E' }}>{missionAnalytics.processing.embedding_dim}D</div>
                  <div className="text-overline text-text-tertiary mt-0.5">Embedding</div>
                </div>
              </div>
            </Panel>
          </div>
        )}

        {/* ── Acquisition Throughput + Disaster Timeline ───────────────────── */}
        <div className="grid grid-cols-5 gap-5">
          <Panel className="col-span-3" label="Acquisition Throughput" sub="Scenes per day by sensor type · rolling 7 days">
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={acquisitionThroughput} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <CartesianGrid {...GRID} vertical={false} />
                <XAxis dataKey="day" tick={TICK} axisLine={false} tickLine={false} />
                <YAxis tick={TICK} axisLine={false} tickLine={false} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: '10px', color: '#64748B', paddingTop: 8 }} />
                <Bar dataKey="sar"     name="SAR"          stackId="a" fill={SENSOR_COLORS.sar}     radius={[0,0,0,0]} />
                <Bar dataKey="optical" name="Optical"      stackId="a" fill={SENSOR_COLORS.optical}  radius={[0,0,0,0]} />
                <Bar dataKey="multi"   name="Multispectral" stackId="a" fill={SENSOR_COLORS.multi}   radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          <Panel className="col-span-2" label="Disaster Detection Timeline" sub="Event types detected per day">
            <ResponsiveContainer width="100%" height={190}>
              <AreaChart data={disasterTimeline} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  {Object.entries(EVENT_COLORS).map(([type, color]) => (
                    <linearGradient key={type} id={`grad-${type}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={color} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={color} stopOpacity={0}    />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid {...GRID} vertical={false} />
                <XAxis dataKey="date" tick={TICK} axisLine={false} tickLine={false} />
                <YAxis tick={TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Area type="monotone" dataKey="flood"   name="Flood"   stroke={EVENT_COLORS.flood}   strokeWidth={1.5} fill={`url(#grad-flood)`}   dot={false} />
                <Area type="monotone" dataKey="fire"    name="Fire"    stroke={EVENT_COLORS.fire}    strokeWidth={1.5} fill={`url(#grad-fire)`}    dot={false} />
                <Area type="monotone" dataKey="cyclone" name="Cyclone" stroke={EVENT_COLORS.cyclone} strokeWidth={1.5} fill={`url(#grad-cyclone)`} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-3 mt-2 pt-2" style={{ borderTop: '1px solid rgba(45,55,72,0.2)' }}>
              {Object.entries(EVENT_COLORS).map(([type, color]) => (
                <div key={type} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                  <span className="text-caption text-text-secondary capitalize">{type}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* ── Active Monitoring Regions ─────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="overline-label">Active Monitoring Regions</div>
              <div className="text-caption text-text-tertiary mt-0.5">6 regions · sorted by alert priority</div>
            </div>
            <div className="flex items-center gap-2">
              {['HIGH', 'MEDIUM', 'LOW'].map((s) => (
                <div key={s} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-caption"
                  style={{ background: SEVERITY_CONFIG[s].bg, color: SEVERITY_CONFIG[s].color, border: `1px solid ${SEVERITY_CONFIG[s].color}28` }}>
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: SEVERITY_CONFIG[s].color }} />
                  {s}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(45,55,72,0.28)' }}>
            <table className="w-full">
              <thead>
                <tr style={{ background: 'rgba(17,24,39,0.8)', borderBottom: '1px solid rgba(45,55,72,0.25)' }}>
                  {['Region', 'Type', 'Country', 'Scenes', 'Alerts', 'Last Sat', 'Severity'].map((h) => (
                    <th key={h} className={cn('py-2.5 overline-label font-medium', h === 'Region' ? 'px-5 text-left' : 'px-4 text-right last:text-left')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeRegions.map((row, i) => {
                  const sev = SEVERITY_CONFIG[row.severity]
                  const typeColors: Record<string, string> = {
                    flood: '#3B82F6', forest: '#22C55E', drought: '#F59E0B', cyclone: '#8B5CF6', fire: '#EF4444',
                  }
                  return (
                    <tr key={row.region}
                      style={{
                        background: i % 2 === 0 ? 'transparent' : 'rgba(17,24,39,0.3)',
                        borderBottom: '1px solid rgba(45,55,72,0.12)',
                      }}>
                      <td className="py-3 px-5 text-text-primary text-body-s font-medium">{row.region}</td>
                      <td className="py-3 px-4 text-right">
                        <span className="font-mono text-caption capitalize px-2 py-0.5 rounded"
                          style={{ background: `${typeColors[row.type] ?? '#64748B'}14`, color: typeColors[row.type] ?? '#64748B' }}>
                          {row.type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-caption text-text-secondary">{row.country}</td>
                      <td className="py-3 px-4 text-right font-mono text-caption text-text-primary">{row.scenes}</td>
                      <td className="py-3 px-4 text-right">
                        <span className="font-mono text-caption" style={{ color: row.alerts >= 3 ? '#EF4444' : row.alerts >= 2 ? '#F59E0B' : '#94A3B8' }}>
                          {row.alerts}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-caption text-text-secondary">{row.lastSat}</td>
                      <td className="py-3 px-5">
                        <span className="text-caption font-semibold px-2 py-0.5 rounded"
                          style={{ background: sev.bg, color: sev.color, border: `1px solid ${sev.color}28` }}>
                          {row.severity}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Sensor Utilization + Pipeline Latency ────────────────────────── */}
        <div className="grid grid-cols-2 gap-5">
          <Panel label="Sensor Utilization" sub="Payload uptime % by platform · rolling 7 days">
            <div className="space-y-4 mt-1">
              {sensorUtilization.map((sat) => (
                <div key={sat.name}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-body-s text-text-primary font-medium">{sat.name}</span>
                      <span className="text-overline px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(45,55,72,0.4)', color: '#94A3B8' }}>
                        {sat.agency}
                      </span>
                    </div>
                    <span className="font-mono text-body-s font-semibold" style={{ color: sat.color }}>
                      {sat.util}%
                    </span>
                  </div>
                  <div className="w-full rounded-full overflow-hidden" style={{ height: 5, background: 'rgba(45,55,72,0.35)' }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${sat.util}%` }}
                      transition={{ duration: 0.7, delay: 0.1, ease: 'easeOut' }}
                      style={{ height: '100%', background: sat.color, borderRadius: 4, opacity: 0.82 }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: '1px solid rgba(45,55,72,0.2)' }}>
              <div>
                <div className="font-mono text-heading-3 font-bold text-text-primary">
                  {Math.round(sensorUtilization.reduce((s, x) => s + x.util, 0) / sensorUtilization.length)}%
                </div>
                <div className="text-overline text-text-tertiary mt-0.5">Fleet avg</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-heading-3 font-bold" style={{ color: '#EF4444' }}>
                  {Math.max(...sensorUtilization.map(s => s.util))}%
                </div>
                <div className="text-overline text-text-tertiary mt-0.5">Peak utilization</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-heading-3 font-bold" style={{ color: '#22C55E' }}>
                  {sensorUtilization.filter(s => s.util > 60).length}
                </div>
                <div className="text-overline text-text-tertiary mt-0.5">Platforms &gt;60%</div>
              </div>
            </div>
          </Panel>

          <Panel label="Pipeline Latency Breakdown" sub="Median and P95 per processing stage">
            <div className="space-y-4 mt-1">
              {latencyBreakdown.map((stage, i) => {
                const maxP95 = Math.max(...latencyBreakdown.map(s => s.p95))
                return (
                  <div key={stage.stage}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-body-s text-text-secondary">{stage.stage}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-caption text-text-tertiary">p50 {stage.p50}s</span>
                        <span className="font-mono text-caption font-semibold" style={{ color: stage.color }}>
                          p95 {stage.p95}s
                        </span>
                      </div>
                    </div>
                    <div className="relative w-full rounded-full overflow-hidden" style={{ height: 5, background: 'rgba(45,55,72,0.35)' }}>
                      {/* P95 bar (background) */}
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(stage.p95 / maxP95) * 100}%` }}
                        transition={{ duration: 0.7, delay: i * 0.08 }}
                        style={{ position: 'absolute', height: '100%', background: stage.color, opacity: 0.25, borderRadius: 4 }}
                      />
                      {/* P50 bar (foreground) */}
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(stage.p50 / maxP95) * 100}%` }}
                        transition={{ duration: 0.7, delay: i * 0.08 + 0.05 }}
                        style={{ position: 'absolute', height: '100%', background: stage.color, opacity: 0.85, borderRadius: 4 }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex items-center justify-between mt-5 pt-3" style={{ borderTop: '1px solid rgba(45,55,72,0.2)' }}>
              <div>
                <div className="font-mono text-heading-3 font-bold text-text-primary">
                  {latencyBreakdown.reduce((s, x) => s + x.p50, 0).toFixed(2)}s
                </div>
                <div className="text-overline text-text-tertiary mt-0.5">Total p50</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-heading-3 font-bold" style={{ color: '#F59E0B' }}>
                  {latencyBreakdown.reduce((s, x) => s + x.p95, 0).toFixed(2)}s
                </div>
                <div className="text-overline text-text-tertiary mt-0.5">Total p95</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-heading-3 font-bold" style={{ color: '#22C55E' }}>
                  {latencyBreakdown.reduce((s, x) => s + x.p95, 0) < 2.5 ? 'On Target' : 'Over SLA'}
                </div>
                <div className="text-overline text-text-tertiary mt-0.5">SLA status</div>
              </div>
            </div>
          </Panel>
        </div>

        {/* ── Retrieval Performance Section ────────────────────────────────── */}
        <div style={{ borderTop: '1px solid rgba(45,55,72,0.25)', paddingTop: 24 }}>
          <div className="overline-label mb-4">Cross-Modal Retrieval Performance</div>
          <div className="grid grid-cols-4 gap-4 mb-6">
            {analyticsMetrics.map((metric, i) => (
              <MetricCard key={metric.label} metric={metric} index={i} />
            ))}
          </div>
        </div>

        {/* ── Query Volume + Sensor Dist ────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-5">
          <Panel className="col-span-2" label="Query Volume" sub="Hourly distribution · last 24 hours">
            <ResponsiveContainer width="100%" height={175}>
              <AreaChart data={queryVolumeData}>
                <defs>
                  <linearGradient id="qGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#3B82F6" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <CartesianGrid {...GRID} vertical={false} />
                <XAxis dataKey="time" tick={TICK} axisLine={false} tickLine={false} />
                <YAxis tick={TICK} axisLine={false} tickLine={false} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Area type="monotone" dataKey="queries" stroke="#3B82F6" strokeWidth={1.5} fill="url(#qGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>

          <Panel label="Archive Distribution" sub="By sensor type">
            <ResponsiveContainer width="100%" height={125}>
              <PieChart>
                <Pie data={sensorDistribution} cx="50%" cy="50%" innerRadius={36} outerRadius={54}
                  dataKey="value" paddingAngle={4}>
                  {sensorDistribution.map((e) => <Cell key={e.name} fill={e.color} opacity={0.82} />)}
                </Pie>
                <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [`${v}%`, 'Share']} />
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
          </Panel>
        </div>

        {/* ── Precision Trends + Latency Trends ────────────────────────────── */}
        <div className="grid grid-cols-2 gap-5">
          <Panel label="Retrieval Precision Trends" sub="Precision@5 and F1@10 · 6 months">
            <ResponsiveContainer width="100%" height={175}>
              <LineChart data={analyticsMetrics[0].history.map((h, i) => ({
                time: h.time, 'Precision@5': h.value, 'F1@10': analyticsMetrics[1].history[i]?.value ?? 0,
              }))}>
                <CartesianGrid {...GRID} vertical={false} />
                <XAxis dataKey="time" tick={TICK} axisLine={false} tickLine={false} />
                <YAxis domain={[70, 100]} tick={TICK} axisLine={false} tickLine={false} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: '10px', color: '#64748B', paddingTop: 8 }} />
                <Line type="monotone" dataKey="Precision@5" stroke="#3B82F6" strokeWidth={1.5} dot={{ r: 2.5, fill: '#3B82F6' }} />
                <Line type="monotone" dataKey="F1@10" stroke="#14B8A6" strokeWidth={1.5} dot={{ r: 2.5, fill: '#14B8A6' }} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>

          <Panel label="Query Latency (P95)" sub="Response time trend · seconds">
            <ResponsiveContainer width="100%" height={175}>
              <AreaChart data={analyticsMetrics[2].history}>
                <defs>
                  <linearGradient id="lGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#22C55E" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#22C55E" stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <CartesianGrid {...GRID} vertical={false} />
                <XAxis dataKey="time" tick={TICK} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 4]} tick={TICK} axisLine={false} tickLine={false} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [`${v}s`, 'Latency']} />
                <Area type="monotone" dataKey="value" stroke="#22C55E" strokeWidth={1.5} fill="url(#lGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>
        </div>

        {/* ── Cross-Modal Performance Matrix ────────────────────────────────── */}
        <div>
          <div className="overline-label mb-3">Cross-Modal Performance Matrix</div>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(45,55,72,0.28)' }}>
            <table className="w-full text-body-s">
              <thead>
                <tr style={{ background: 'rgba(17,24,39,0.7)', borderBottom: '1px solid rgba(45,55,72,0.25)' }}>
                  {['Modality Pair', 'Precision@5', 'Recall@10', 'F1 Score', 'Quality'].map((h, i) => (
                    <th key={h} className={cn('py-3 overline-label font-medium', i === 0 ? 'px-5 text-left' : i === 4 ? 'px-5 text-left' : 'px-4 text-right')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {crossModalMatrix.map((row, i) => (
                  <tr key={row.from} style={{
                    background: i % 2 === 0 ? 'transparent' : 'rgba(17,24,39,0.3)',
                    borderBottom: '1px solid rgba(45,55,72,0.15)',
                  }}>
                    <td className="py-3 px-5 text-text-primary font-medium">{row.from}</td>
                    <td className="text-right py-3 px-4"><HeatCell value={row.precision5} /></td>
                    <td className="text-right py-3 px-4"><HeatCell value={row.recall10} /></td>
                    <td className="text-right py-3 px-4"><HeatCell value={row.f1} /></td>
                    <td className="py-3 px-5"><QualityBadge score={row.f1} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Sensor Correlation + Similarity Dist ─────────────────────────── */}
        <div className="grid grid-cols-2 gap-5">
          <Panel label="Sensor Correlation Matrix" sub="Cross-modal retrieval accuracy between sensor types">
            <SensorCorrelationMatrix />
          </Panel>
          <Panel label="Semantic Similarity Distribution" sub="Score distribution across retrieved observations">
            <SimilarityHistogram
              data={similarityDistribution}
              scores={scoreSource.map(r => r.similarityScore * 100)}
              missionAnalytics={missionAnalytics}
            />
          </Panel>
        </div>

        <div className="h-10" />
      </div>
    </div>
  )
}

// ── Helper components ─────────────────────────────────────────────────────────

function Panel({ label, sub, children, className }: {
  label: string; sub: string; children: React.ReactNode; className?: string
}) {
  return (
    <div className={cn('p-5 rounded-xl', className)}
      style={{ background: 'rgba(17,24,39,0.45)', border: '1px solid rgba(45,55,72,0.25)' }}>
      <div className="mb-4">
        <div className="overline-label mb-0.5">{label}</div>
        <div className="text-caption text-text-tertiary">{sub}</div>
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
  const colors  = ['#3B82F6', '#14B8A6', '#F59E0B', '#22C55E']
  const color   = colors[index]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }}
      className="p-4 rounded-xl"
      style={{ background: 'rgba(17,24,39,0.45)', border: '1px solid rgba(45,55,72,0.25)' }}>
      <div className="flex items-start justify-between mb-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}12` }}>
          <Icon className="w-3.5 h-3.5" style={{ color }} />
        </div>
        <div className={cn('flex items-center gap-1 text-caption font-mono', isPositive ? 'text-success' : 'text-danger')}>
          {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {Math.abs(metric.trend).toFixed(1)}{metric.unit}
        </div>
      </div>
      <div className="font-mono text-2xl font-bold leading-none mb-1" style={{ color }}>
        {metric.value.toFixed(1)}{metric.unit}
      </div>
      <div className="text-body-s text-text-secondary">{metric.label}</div>
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

function HeatCell({ value }: { value: number }) {
  const color = value >= 90 ? '#22C55E' : value >= 85 ? '#3B82F6' : value >= 80 ? '#14B8A6' : '#F59E0B'
  return <span className="font-mono text-body-s font-semibold" style={{ color }}>{value.toFixed(1)}%</span>
}

function QualityBadge({ score }: { score: number }) {
  const [label, color] =
    score >= 90 ? ['Excellent', '#22C55E'] :
    score >= 80 ? ['Good',      '#3B82F6'] :
    score >= 70 ? ['Fair',      '#F59E0B'] :
                  ['Low',       '#EF4444']
  return (
    <span className="px-2 py-0.5 rounded text-caption font-medium"
      style={{ background: `${color}10`, border: `1px solid ${color}28`, color }}>
      {label}
    </span>
  )
}

function SensorCorrelationMatrix() {
  return (
    <div>
      <div className="flex mb-1.5 pl-14">
        {SENSORS_MATRIX.map((s) => (
          <div key={s} className="flex-1 text-center text-overline text-text-tertiary">{s}</div>
        ))}
      </div>
      <div className="space-y-1.5">
        {SENSORS_MATRIX.map((row) => (
          <div key={row} className="flex items-center gap-1.5">
            <div className="w-12 text-overline text-text-tertiary text-right flex-shrink-0">{row}</div>
            {SENSORS_MATRIX.map((col) => {
              const key = `${row}→${col}`
              const val = CORR[key] ?? 0
              const same = row === col
              const hue = same ? 180 : val >= 90 ? 145 : val >= 85 ? 217 : 38
              const alpha = same ? 0.2 : (val - 70) / 30 * 0.35
              return (
                <div key={col} className="flex-1 rounded-md flex flex-col items-center justify-center"
                  style={{
                    background: same ? 'rgba(20,184,166,0.12)' : `hsla(${hue}, 80%, 60%, ${alpha})`,
                    border: `1px solid hsla(${hue}, 60%, 55%, ${same ? 0.3 : alpha * 1.5})`,
                    minHeight: 52,
                  }}>
                  <div className="font-mono font-semibold" style={{
                    fontSize: 13,
                    color: same ? '#14B8A6' : val >= 90 ? '#22C55E' : val >= 85 ? '#3B82F6' : '#F59E0B',
                  }}>
                    {same ? '—' : `${val.toFixed(0)}%`}
                  </div>
                  {!same && <div className="text-overline text-text-tertiary mt-0.5">{row[0]}→{col[0]}</div>}
                </div>
              )
            })}
          </div>
        ))}
      </div>
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

function SimilarityHistogram({
  data,
  scores,
  missionAnalytics,
}: {
  data: { range: string; label: string; count: number }[]
  scores: number[]
  missionAnalytics: import('@/types').MissionAnalytics | null
}) {
  const max = Math.max(...data.map((d) => d.count), 1)
  const meanSim  = scores.length ? (scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(1) : '—'
  const above85  = scores.filter(v => v >= 85).length
  const topMatch = scores.length ? Math.max(...scores).toFixed(1) : '—'

  return (
    <div>
      <ResponsiveContainer width="100%" height={155}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid {...GRID} vertical={false} />
          <XAxis dataKey="label" tick={TICK} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
          <YAxis tick={TICK} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [v, 'Observations']} labelFormatter={(l) => `${l}–${Number(l) + 5}% similarity`} />
          <Bar dataKey="count" radius={[3, 3, 0, 0]}>
            {data.map((entry, i) => {
              const intensity = entry.count / max
              const color = entry.label >= '90' ? '#22C55E' : entry.label >= '85' ? '#3B82F6' : entry.label >= '80' ? '#14B8A6' : '#F59E0B'
              return <Cell key={i} fill={color} opacity={0.6 + intensity * 0.35} />
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px solid rgba(45,55,72,0.25)' }}>
        <div>
          <div className="font-mono text-heading-3 font-bold text-text-primary">{meanSim}%</div>
          <div className="text-overline text-text-tertiary mt-0.5">Mean similarity</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-heading-3 font-bold" style={{ color: '#22C55E' }}>{above85}</div>
          <div className="text-overline text-text-tertiary mt-0.5">Above 85%</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-heading-3 font-bold" style={{ color: '#3B82F6' }}>{topMatch}%</div>
          <div className="text-overline text-text-tertiary mt-0.5">Top match</div>
        </div>
      </div>
      {missionAnalytics && (
        <div className="mt-3 pt-2 grid grid-cols-3 gap-2" style={{ borderTop: '1px solid rgba(45,55,72,0.18)' }}>
          {[
            { label: 'Water', value: `${missionAnalytics.coverage.water_pct.toFixed(0)}%`, color: '#3B82F6' },
            { label: 'Veg',   value: `${missionAnalytics.coverage.vegetation_pct.toFixed(0)}%`, color: '#22C55E' },
            { label: 'Urban', value: `${missionAnalytics.coverage.urban_pct.toFixed(0)}%`, color: '#F59E0B' },
          ].map(({ label, value, color }) => (
            <div key={label} className="text-center">
              <div className="font-mono text-body-s font-bold" style={{ color }}>{value}</div>
              <div className="text-overline text-text-tertiary">{label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
