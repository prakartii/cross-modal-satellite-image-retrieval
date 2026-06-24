/**
 * AKSHA — Mission Intelligence Report Component
 *
 * Displays the full AI-generated mission report after the pipeline completes.
 * Organized into sections: Executive Summary, Detected Events, Search Results,
 * Confidence Analysis, Feature Analysis, Historical Context, and Recommended Actions.
 */

import { motion, AnimatePresence } from 'framer-motion'
import {
  X, FileText, AlertTriangle, Waves, Leaf, Building2,
  Target, Shield, Activity, Clock, ChevronRight,
  Satellite, BarChart3, CheckCircle2, AlertCircle,
  TrendingUp, MapPin,
} from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import type { MissionReport, DetectedEvent } from '@/types'

export default function MissionReportPanel() {
  const report           = useAppStore((s) => s.missionReport)
  const showMissionReport= useAppStore((s) => s.showMissionReport)
  const setShow          = useAppStore((s) => s.setShowMissionReport)

  if (!report || !showMissionReport) return null

  return (
    <AnimatePresence>
      <motion.div
        key="mission-report"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        className="absolute inset-0 flex items-start justify-center pt-4 px-4 z-20 overflow-y-auto pointer-events-none"
      >
        <div
          className="w-full max-w-2xl rounded-2xl overflow-hidden pointer-events-auto"
          style={{
            background: 'rgba(8,12,22,0.98)',
            border: '1px solid rgba(45,55,72,0.5)',
            boxShadow: '0 32px 80px rgba(0,0,0,0.85)',
            maxHeight: 'calc(100vh - 160px)',
            overflowY: 'auto',
          }}
        >
          {/* ── Header ─────────────────────────────────────────────────── */}
          <div className="px-6 py-4 flex items-center justify-between sticky top-0 z-10"
            style={{ background: 'rgba(8,12,22,0.99)', borderBottom: '1px solid rgba(45,55,72,0.4)' }}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)' }}>
                <FileText className="w-4 h-4 text-blue-primary" />
              </div>
              <div>
                <div className="text-body-s font-bold text-text-primary">Mission Intelligence Report</div>
                <div className="font-mono text-caption text-text-tertiary">{report.mission_id}</div>
              </div>
            </div>
            <button
              onClick={() => setShow(false)}
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white-5 transition-colors"
            >
              <X className="w-4 h-4 text-text-tertiary" />
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* ── Primary Event Alert ─────────────────────────────────── */}
            {report.detected_events.length > 0 && (
              <PrimaryEventAlert event={report.detected_events[0]} />
            )}

            {/* ── Executive Summary ───────────────────────────────────── */}
            <Section title="Executive Summary" icon={<FileText className="w-3.5 h-3.5" />}>
              <p className="text-body-s text-text-secondary leading-relaxed">
                {report.executive_summary}
              </p>
            </Section>

            {/* ── Confidence Score ─────────────────────────────────────── */}
            <ConfidenceSection confidence={report.confidence} />

            {/* ── Feature Analysis ─────────────────────────────────────── */}
            <FeatureSection analysis={report.feature_analysis} />

            {/* ── Top Search Matches ───────────────────────────────────── */}
            <SearchMatchesSection summary={report.search_summary} />

            {/* ── Historical Context ───────────────────────────────────── */}
            {report.historical_context.notable_analogues.length > 0 && (
              <HistoricalSection context={report.historical_context} />
            )}

            {/* ── Recommended Actions ──────────────────────────────────── */}
            <ActionsSection actions={report.recommended_actions} />

            {/* ── Pipeline Timeline ────────────────────────────────────── */}
            <TimelineSection timeline={report.pipeline_timeline} />

            {/* ── Footer ──────────────────────────────────────────────── */}
            <div className="pt-4 flex items-center justify-between text-overline text-text-tertiary"
              style={{ borderTop: '1px solid rgba(45,55,72,0.25)' }}>
              <span>{report.analyst_version}</span>
              <span>{report.generated_at}</span>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Section({
  title, icon, children,
}: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="text-blue-primary">{icon}</div>
        <span className="overline-label">{title}</span>
      </div>
      {children}
    </div>
  )
}

function PrimaryEventAlert({ event }: { event: DetectedEvent }) {
  const colorMap: Record<string, string> = {
    Critical: '#EF4444',
    High:     '#F59E0B',
    Moderate: '#3B82F6',
    Low:      '#22C55E',
  }
  const color = colorMap[event.severity] ?? '#EF4444'
  const eventLabel = event.event_type.replace('_', ' ').toUpperCase()

  return (
    <motion.div
      initial={{ scale: 0.97, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="rounded-xl p-4"
      style={{ background: `${color}0A`, border: `1px solid ${color}30` }}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color }} />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-body-s font-bold" style={{ color }}>{eventLabel} DETECTED</span>
            <span className="px-2 py-0.5 rounded font-mono text-caption font-bold"
              style={{ background: `${color}18`, color }}>
              {event.severity.toUpperCase()}
            </span>
            <span className="font-mono text-caption text-text-secondary">
              {event.confidence}% confidence
            </span>
          </div>
          <p className="text-body-s text-text-secondary leading-relaxed mb-3">
            {event.explanation}
          </p>
          <div className="flex items-start gap-1.5">
            <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color }} />
            <span className="text-caption text-text-secondary">{event.recommended_action}</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function ConfidenceSection({ confidence }: { confidence: MissionReport['confidence'] }) {
  const levelColor: Record<string, string> = {
    High:   '#22C55E',
    Medium: '#F59E0B',
    Low:    '#EF4444',
  }
  const color = levelColor[confidence.level] ?? '#3B82F6'

  return (
    <Section title="Confidence Analysis" icon={<Shield className="w-3.5 h-3.5" />}>
      <div className="rounded-lg p-4" style={{ border: '1px solid rgba(45,55,72,0.28)' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-mono text-3xl font-bold leading-none" style={{ color }}>
              {confidence.overall}%
            </div>
            <div className="text-overline text-text-tertiary mt-1">Overall confidence</div>
          </div>
          <div className="px-3 py-1.5 rounded-lg font-mono text-body-s font-bold"
            style={{ background: `${color}12`, border: `1px solid ${color}30`, color }}>
            {confidence.level}
          </div>
        </div>

        {/* Component bars */}
        <div className="space-y-2">
          {Object.entries(confidence.components).map(([key, val]) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-caption text-text-secondary capitalize">
                  {key.replace('_', ' ')}
                </span>
                <span className="font-mono text-caption font-semibold" style={{ color }}>
                  {val}%
                </span>
              </div>
              <div className="h-1 rounded-full" style={{ background: 'rgba(45,55,72,0.4)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: color, opacity: 0.7 }}
                  initial={{ width: 0 }}
                  animate={{ width: `${val}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              </div>
            </div>
          ))}
        </div>

        {confidence.limitations.length > 0 && confidence.limitations[0] !== 'No significant limitations identified' && (
          <div className="mt-3 pt-3 space-y-1" style={{ borderTop: '1px solid rgba(45,55,72,0.2)' }}>
            {confidence.limitations.map((lim, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <AlertCircle className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" />
                <span className="text-overline text-text-secondary">{lim}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Section>
  )
}

function FeatureSection({ analysis }: { analysis: MissionReport['feature_analysis'] }) {
  const features = [
    { label: 'Water Coverage',   value: analysis.water_coverage_pct,      color: '#3B82F6', icon: <Waves className="w-3 h-3" /> },
    { label: 'Vegetation',       value: analysis.vegetation_coverage_pct,  color: '#22C55E', icon: <Leaf className="w-3 h-3" /> },
    { label: 'Edge Density',     value: analysis.edge_density_pct,         color: '#8B5CF6', icon: <Building2 className="w-3 h-3" /> },
  ]

  return (
    <Section title="Feature Analysis" icon={<Activity className="w-3.5 h-3.5" />}>
      <div className="space-y-3">
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(45,55,72,0.28)' }}>
          {[
            { label: 'Dominant Surface', value: analysis.dominant_surface },
            { label: 'Brightness Level', value: analysis.brightness_level },
            { label: 'Texture Complexity', value: analysis.texture_complexity },
          ].map(({ label, value }, i, arr) => (
            <div key={label}
              className="flex items-center justify-between px-3 py-2"
              style={i < arr.length - 1 ? { borderBottom: '1px solid rgba(45,55,72,0.18)' } : {}}>
              <span className="text-caption text-text-tertiary">{label}</span>
              <span className="font-mono text-caption text-text-secondary">{value}</span>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {features.map(({ label, value, color, icon }) => (
            <div key={label}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5" style={{ color }}>
                  {icon}
                  <span className="text-caption">{label}</span>
                </div>
                <span className="font-mono text-caption font-semibold" style={{ color }}>
                  {value.toFixed(1)}%
                </span>
              </div>
              <div className="h-1 rounded-full" style={{ background: 'rgba(45,55,72,0.4)' }}>
                <motion.div className="h-full rounded-full" style={{ background: color }}
                  initial={{ width: 0 }} animate={{ width: `${value}%` }}
                  transition={{ duration: 0.7, ease: 'easeOut' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}

function SearchMatchesSection({ summary }: { summary: MissionReport['search_summary'] }) {
  return (
    <Section title={`Archive Matches (${summary.total_matches} found)`} icon={<Target className="w-3.5 h-3.5" />}>
      <div className="space-y-1">
        {summary.top_matches.map((m, i) => (
          <div key={i} className="flex items-center gap-3 py-2"
            style={i < summary.top_matches.length - 1 ? { borderBottom: '1px solid rgba(45,55,72,0.18)' } : {}}>
            <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)' }}>
              <span className="font-mono text-overline text-blue-primary">{m.rank}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-caption text-text-secondary font-medium truncate">
                {m.location}
              </div>
              <div className="font-mono text-overline text-text-tertiary">
                {m.satellite} · {m.date}
                {m.event_label && m.event_label !== 'None' && (
                  <span className="ml-1.5 text-amber-400">· {m.event_label}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(45,55,72,0.4)' }}>
                <div className="h-full rounded-full" style={{ width: `${m.similarity}%`, background: '#3B82F6' }} />
              </div>
              <span className="font-mono text-caption font-bold text-blue-primary">
                {m.similarity}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

function HistoricalSection({ context }: { context: MissionReport['historical_context'] }) {
  return (
    <Section title="Historical Analogues" icon={<Clock className="w-3.5 h-3.5" />}>
      <div className="space-y-1">
        {context.notable_analogues.map((a, i) => (
          <div key={i} className="flex items-center gap-3 py-2"
            style={i < context.notable_analogues.length - 1 ? { borderBottom: '1px solid rgba(45,55,72,0.18)' } : {}}>
            <MapPin className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-caption text-text-secondary font-medium truncate">{a.event}</div>
              <div className="font-mono text-overline text-text-tertiary">{a.satellite} · {a.date}</div>
            </div>
            <span className="font-mono text-caption font-bold text-teal-primary flex-shrink-0">
              {a.similarity}%
            </span>
          </div>
        ))}
      </div>
    </Section>
  )
}

function ActionsSection({ actions }: { actions: MissionReport['recommended_actions'] }) {
  const priorityColor: Record<string, string> = {
    IMMEDIATE: '#EF4444',
    HIGH:      '#F59E0B',
    MEDIUM:    '#3B82F6',
    LOW:       '#64748B',
    ROUTINE:   '#64748B',
  }

  return (
    <Section title="Recommended Actions" icon={<TrendingUp className="w-3.5 h-3.5" />}>
      <div className="space-y-2">
        {actions.map((action, i) => {
          const color = priorityColor[action.priority] ?? '#64748B'
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-start gap-3 py-2 px-3 rounded-lg"
              style={{ background: `${color}08`, border: `1px solid ${color}20` }}
            >
              <span className="font-mono text-overline font-bold flex-shrink-0 mt-0.5"
                style={{ color }}>
                {action.priority}
              </span>
              <span className="text-caption text-text-secondary leading-relaxed">
                {action.action}
              </span>
            </motion.div>
          )
        })}
      </div>
    </Section>
  )
}

function TimelineSection({ timeline }: { timeline: MissionReport['pipeline_timeline'] }) {
  return (
    <Section title="Intelligence Pipeline Timeline" icon={<Activity className="w-3.5 h-3.5" />}>
      <div className="relative">
        {/* Vertical connector line */}
        <div className="absolute left-3 top-2 bottom-2 w-px" style={{ background: 'rgba(45,55,72,0.4)' }} />
        <div className="space-y-2">
          {timeline.map(({ stage, description }, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className="flex items-start gap-3 pl-1"
            >
              <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 z-10"
                style={{ background: 'rgba(20,184,166,0.12)', border: '1px solid rgba(20,184,166,0.3)' }}>
                <CheckCircle2 className="w-2.5 h-2.5 text-teal-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-caption text-text-primary font-medium">{stage}</div>
                <div className="text-overline text-text-tertiary mt-0.5">{description}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  )
}
