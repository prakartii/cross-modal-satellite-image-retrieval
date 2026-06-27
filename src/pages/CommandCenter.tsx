import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Layers, Satellite, AlertTriangle, Waves, TreeDeciduous,
  Building2, Radio, Wind, FlameKindling, CloudRain,
} from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import EarthGlobe from '@/components/earth/EarthGlobe'
import { archiveStats } from '@/data/mockResults'
import {
  satelliteHealth, acquisitionQueue, activeDownlinks,
  floodWatchRegions, globeHotspots,
} from '@/data/satellites'
import { cn } from '@/lib/utils'

type EarthLayer = 'optical' | 'sar' | 'multispectral' | 'flood' | 'vegetation' | 'urban'

// Seconds-ago at app load — tick increments these so timestamps tick forward
const FEED_BASE_OFFSETS = [120, 720, 3600, 7200, 10800, 14400, 18000]

const MISSION_FEED_STATIC = [
  { text: 'Flood signature detected',         sub: 'Brahmaputra Basin · 26.12°N 91.74°E', color: '#EF4444', status: 'ALERT'      },
  { text: 'SAR acquisition — 847 scenes',     sub: 'RISAT-2B · Orbit 18924 · ISTRAC',     color: '#3B82F6', status: 'PROCESSING' },
  { text: 'Retrieval complete · 94.2% match', sub: 'Scene R2B-24062402 · 1.8s latency',   color: '#14B8A6', status: 'ACTIVE'     },
  { text: 'Sentinel-1A overpass commenced',   sub: 'NE India corridor · Pass S1A-49312',   color: '#22C55E', status: 'ACTIVE'     },
  { text: 'Cloud cover alert · 78%',          sub: 'Tamil Nadu coast · Cycle BOB-04',      color: '#F59E0B', status: 'ALERT'      },
  { text: 'Cartosat-3 PAN acquired',          sub: 'Mumbai MMR · Scene CS3-23441',         color: '#3B82F6', status: 'ARCHIVED'   },
  { text: 'NDVI anomaly — −0.42 NDWI',        sub: 'Rajasthan Plains · Drought zone',      color: '#F59E0B', status: 'ALERT'      },
]

function fmtAgo(seconds: number): string {
  if (seconds < 60)   return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  return `${Math.floor(seconds / 3600)}h`
}

const EARTH_LAYERS: { id: EarthLayer; label: string; color: string }[] = [
  { id: 'optical',       label: 'Optical',    color: '#22C55E' },
  { id: 'sar',           label: 'SAR',        color: '#3B82F6' },
  { id: 'multispectral', label: 'Multi',      color: '#F59E0B' },
  { id: 'flood',         label: 'Flood',      color: '#60A5FA' },
  { id: 'vegetation',    label: 'NDVI',       color: '#4ADE80' },
  { id: 'urban',         label: 'Urban',      color: '#FB923C' },
]

const HOTSPOT_COLORS: Record<string, string> = {
  flood: '#3B82F6', agriculture: '#22C55E',
  urban: '#F59E0B', disaster: '#EF4444', monitoring: '#14B8A6',
}

const STATUS_BADGE: Record<string, string> = {
  ALERT:      'mission-badge mission-badge-alert',
  ACTIVE:     'mission-badge mission-badge-active',
  PROCESSING: 'mission-badge mission-badge-processing',
  ARCHIVED:   'mission-badge mission-badge-archived',
}

const SAT_STATUS_COLOR: Record<string, string> = {
  NOMINAL:  '#14B8A6',
  ACTIVE:   '#22C55E',
  STANDBY:  '#64748B',
  DEGRADED: '#EF4444',
}

const FLOOD_LEVEL_COLOR: Record<string, string> = {
  ALERT:  '#EF4444',
  MEDIUM: '#F59E0B',
  WATCH:  '#64748B',
}

const fadeL = { initial: { opacity: 0, x: -16 }, animate: { opacity: 1, x: 0 }, transition: { duration: 0.45, ease: [0.4, 0, 0.2, 1] as [number,number,number,number] } }
const fadeR = { initial: { opacity: 0, x: 16  }, animate: { opacity: 1, x: 0 }, transition: { duration: 0.45, ease: [0.4, 0, 0.2, 1] as [number,number,number,number] } }

// ─── Battery bar (5 segments) ──────────────────────────────────────────────
function BatteryBar({ pct, color }: { pct: number; color: string }) {
  const filled = Math.round((pct / 100) * 5)
  return (
    <span className="inline-flex items-center gap-px ml-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          style={{
            display: 'inline-block',
            width: 4, height: 8,
            borderRadius: 1,
            background: i < filled ? color : 'rgba(45,55,72,0.5)',
          }}
        />
      ))}
    </span>
  )
}

// ─── Progress fill bar ─────────────────────────────────────────────────────
function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ height: 3, borderRadius: 2, background: 'rgba(45,55,72,0.5)', overflow: 'hidden', flex: 1 }}>
      <div style={{ height: '100%', width: `${value * 100}%`, background: color, borderRadius: 2, transition: 'width 1s ease' }} />
    </div>
  )
}

// ─── Live telemetry helpers ──────────────────────────────────────────────────
function formatEta(seconds: number): string {
  if (seconds <= 0) return 'NOW'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`
}

export default function CommandCenter() {
  const isLoaded        = useAppStore((s) => s.isLoaded)
  const setEarthLoaded  = useAppStore((s) => s.setEarthLoaded)
  const setActiveView   = useAppStore((s) => s.setActiveView)
  const toggleCopilot   = useAppStore((s) => s.toggleCopilot)
  const toggleOrbits    = useAppStore((s) => s.toggleOrbits)
  const toggleHotspots  = useAppStore((s) => s.toggleHotspots)
  const showOrbits      = useAppStore((s) => s.showOrbits)
  const showHotspots    = useAppStore((s) => s.showHotspots)
  const earthLayer      = useAppStore((s) => s.earthLayer)
  const setEarthLayer   = useAppStore((s) => s.setEarthLayer)
  const activeMission   = useAppStore((s) => s.activeMission)
  const missionAnalytics= useAppStore((s) => s.missionAnalytics)
  const backendAvailable= useAppStore((s) => s.backendAvailable)
  const [tick, setTick] = useState(0)

  // ── Live telemetry state ────────────────────────────────────────────────────
  const [liveBat,        setLiveBat]        = useState(() => satelliteHealth.map(s => s.bat))
  const [liveProgress,   setLiveProgress]   = useState(() => activeDownlinks.map(d => d.progress))
  const [liveIngestion,  setLiveIngestion]  = useState(127)
  const [liveFloodPct,   setLiveFloodPct]   = useState([12.4, 3.2, 1.8, 0.9])
  const [etaSeconds,     setEtaSeconds]     = useState(4 * 60 + 12)

  const hasMission = !!activeMission && !!missionAnalytics

  // Boot sequence — staged typewriter lines
  const [bootLines, setBootLines] = useState<string[]>([])
  const [bootReady, setBootReady] = useState(false)

  useEffect(() => {
    const SEQ: [number, string][] = [
      [0,    'SYS_INIT · AKSHA v3.2.1 · ISRO BHUVAN'],
      [580,  'BHUVAN GEODATA LINK ············ ESTABLISHED'],
      [1150, 'ISTRAC UPLINK · BANGALORE ······· NOMINAL'],
      [1850, 'ARCHIVE LOADED · 2,410,847 SCENES INDEXED'],
      [2700, 'ORBIT SYNC · 847 ACTIVE PASSES · TLE FRESH'],
      [3600, 'SYSTEM READY'],
    ]
    const timers: ReturnType<typeof setTimeout>[] = []
    SEQ.forEach(([ms, line]) => {
      timers.push(setTimeout(() => setBootLines(prev => [...prev, line]), ms))
    })
    timers.push(setTimeout(() => setBootReady(true), 4000))
    timers.push(setTimeout(() => setEarthLoaded(true), 5000))
    return () => timers.forEach(clearTimeout)
  }, [setEarthLoaded])
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 1000); return () => clearInterval(t) }, [])

  // ── Live telemetry updates ──────────────────────────────────────────────────
  useEffect(() => {
    // ETA countdown — every second
    setEtaSeconds(s => Math.max(0, s - 1))

    // Downlink progress — continuous at data rate
    setLiveProgress(prev => prev.map((p, i) => {
      const rate = i === 0 ? 0.0062 : 0.0056   // RISAT-2B faster than Cartosat-3
      return Math.min(0.9995, p + rate + (Math.random() - 0.5) * 0.001)
    }))

    // Battery drift — every ~12 s
    if (tick % 12 === 0) {
      setLiveBat(prev => prev.map((b, i) => {
        const drift = satelliteHealth[i]?.live ? (Math.random() * 0.4 - 0.2) : 0
        return Math.max(0, Math.min(100, parseFloat((b + drift).toFixed(1))))
      }))
    }

    // Ingestion rate — every ~7 s
    if (tick % 7 === 0) {
      setLiveIngestion(Math.round(119 + Math.random() * 15))
    }

    // Flood level changes — every ~20 s
    if (tick % 20 === 0) {
      setLiveFloodPct(prev => prev.map((v, i) => {
        const scale = i === 0 ? 0.22 : 0.08   // Brahmaputra fluctuates more
        const drift = (Math.random() * scale * 2) - scale
        return parseFloat(Math.max(0.1, v + drift).toFixed(1))
      }))
    }
  }, [tick])

  const now    = new Date()
  const utcStr = now.toUTCString().slice(5, 25)
  const doy    = Math.ceil((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000)

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div className="absolute inset-0"><EarthGlobe /></div>

      {/* Boot screen — staged typewriter sequence */}
      <AnimatePresence>
        {!isLoaded && (
          <motion.div key="loader" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.4, delay: 0.3 }}
            className="absolute inset-0 flex flex-col items-center justify-center z-50"
            style={{ background: '#080D16' }}>

            {/* Scanline overlay */}
            <div className="absolute inset-0 pointer-events-none" style={{
              backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.013) 2px, rgba(255,255,255,0.013) 4px)',
            }} />

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
              className="flex flex-col items-center gap-8" style={{ width: 480 }}>

              {/* Logo mark */}
              <div className="relative">
                <div className="w-16 h-16 rounded-full flex items-center justify-center relative"
                  style={{ border: '1px solid rgba(59,130,246,0.22)', background: 'rgba(59,130,246,0.06)' }}>
                  <div className="absolute inset-1 rounded-full border"
                    style={{ borderColor: 'rgba(59,130,246,0.1)', borderTopColor: '#3B82F6',
                      animation: 'spin 1.8s linear infinite' }} />
                  <div className="absolute inset-3 rounded-full border"
                    style={{ borderColor: 'rgba(20,184,166,0.08)', borderBottomColor: '#14B8A6',
                      animation: 'spin 2.6s linear infinite reverse' }} />
                  <Satellite className="w-5 h-5 relative z-10" style={{ color: '#60A5FA', opacity: 0.85 }} />
                </div>
                {/* Orbit ring */}
                <div className="absolute -inset-3 rounded-full" style={{
                  border: '1px solid rgba(59,130,246,0.06)',
                  boxShadow: '0 0 24px rgba(59,130,246,0.08)',
                }} />
              </div>

              {/* Wordmark */}
              <div className="text-center">
                <div className="font-display font-bold tracking-tight"
                  style={{ fontSize: 52, color: '#F8FAFC', letterSpacing: '-0.02em',
                    textShadow: '0 0 40px rgba(59,130,246,0.25)' }}>
                  AKSHA
                </div>
                <div className="font-mono mt-1" style={{ fontSize: 11, color: '#4A5568', letterSpacing: '0.18em' }}>
                  EARTH INTELLIGENCE BEYOND IMAGERY
                </div>
              </div>

              {/* Boot log terminal */}
              <div className="w-full rounded-lg overflow-hidden"
                style={{ background: 'rgba(9,14,25,0.85)', border: '1px solid rgba(59,130,246,0.12)' }}>
                <div className="px-3 py-1.5 flex items-center gap-1.5"
                  style={{ borderBottom: '1px solid rgba(59,130,246,0.1)', background: 'rgba(59,130,246,0.04)' }}>
                  <div className="w-2 h-2 rounded-full" style={{ background: 'rgba(239,68,68,0.5)' }} />
                  <div className="w-2 h-2 rounded-full" style={{ background: 'rgba(245,158,11,0.5)' }} />
                  <div className="w-2 h-2 rounded-full" style={{ background: 'rgba(34,197,94,0.5)' }} />
                  <span className="font-mono ml-2" style={{ fontSize: 10, color: '#2D3748' }}>AKSHA_BOOT_SEQUENCE</span>
                </div>
                <div className="p-4 space-y-1.5" style={{ minHeight: 160 }}>
                  {bootLines.map((line, i) => {
                    const isReady = line === 'SYSTEM READY'
                    const isLast  = i === bootLines.length - 1
                    return (
                      <motion.div key={i}
                        initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.22 }}
                        className="flex items-center gap-2 font-mono"
                        style={{ fontSize: 11 }}>
                        <span style={{ color: isReady ? '#22C55E' : '#3B82F6', flexShrink: 0 }}>{'>'}</span>
                        <span style={{ color: isReady ? '#4ADE80' : '#64748B' }}>{line}</span>
                        {isLast && !isReady && (
                          <span style={{ color: '#3B82F6', animation: 'pulse 1s ease-in-out infinite' }}>▮</span>
                        )}
                        {isReady && (
                          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            style={{ color: '#22C55E', marginLeft: 4 }}>✓</motion.span>
                        )}
                      </motion.div>
                    )
                  })}
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full" style={{ height: 2, background: 'rgba(45,55,72,0.4)', borderRadius: 1, overflow: 'hidden' }}>
                <motion.div style={{ height: '100%', background: 'linear-gradient(90deg, #3B82F6, #14B8A6)', borderRadius: 1 }}
                  initial={{ width: '0%' }}
                  animate={{ width: bootReady ? '100%' : `${(bootLines.length / 6) * 85}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isLoaded && (
          <>
            {/* ── LEFT PANEL ──────────────────────────────────── */}
            <motion.div {...fadeL} transition={{ ...fadeL.transition, delay: 0.2 }}
              className="absolute top-3 left-16 flex flex-col gap-2 z-10" style={{ width: 236 }}>

              {/* Active Mission Card (only when mission is running) */}
              {hasMission && (
                <div className="glass-panel rounded-xl overflow-hidden" style={{ border: '1px solid rgba(59,130,246,0.25)' }}>
                  <div className="px-4 py-2.5 flex items-center justify-between"
                    style={{ borderBottom: '1px solid rgba(59,130,246,0.15)', background: 'rgba(59,130,246,0.06)' }}>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-primary animate-pulse flex-shrink-0" />
                      <span className="overline-label" style={{ color: '#60A5FA' }}>Mission Active</span>
                    </div>
                    <button
                      onClick={() => setActiveView('results')}
                      className="text-overline font-semibold transition-opacity hover:opacity-80"
                      style={{ color: '#3B82F6' }}
                    >
                      VIEW →
                    </button>
                  </div>
                  <div className="px-4 pt-3 pb-3 space-y-2">
                    <div className="text-caption text-text-primary font-medium leading-snug">
                      {activeMission.name}
                    </div>
                    {[
                      { label: 'Confidence', value: `${missionAnalytics.confidence.overall}%` },
                      { label: 'Matches',    value: `${missionAnalytics.retrieval.total_results} scenes` },
                      { label: 'Mode',       value: backendAvailable === false ? 'Demo' : 'Live AI' },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between">
                        <span className="text-overline text-text-tertiary">{label}</span>
                        <span className="font-mono text-overline text-text-secondary">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Archive Status */}
              <div className="glass-panel rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 flex items-center justify-between"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span className="overline-label">Archive Status</span>
                  <span className="mission-badge mission-badge-active">LIVE</span>
                </div>
                <div className="px-4 pt-3 pb-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-mono font-bold text-heading-2 text-text-primary">
                      {(archiveStats.totalObservations / 1_000_000).toFixed(2)}M
                    </span>
                    <span className="text-caption text-text-tertiary">indexed scenes</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className="status-live" style={{ width: 5, height: 5 }} />
                    <span className="font-mono text-caption text-teal-primary">{liveIngestion} scenes/hr ingestion</span>
                  </div>
                  {/* Demo corpus callout */}
                  <div className="flex items-center gap-1.5 mt-1 mb-2.5 px-2 py-1 rounded"
                    style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
                    <span className="font-mono text-overline font-semibold" style={{ color: '#8B5CF6' }}>
                      {archiveStats.demoCorpusSize} scenes
                    </span>
                    <span className="text-overline text-text-tertiary">— Brahmaputra Basin demo corpus</span>
                  </div>
                </div>
                {[
                  { label: 'SAR',           count: archiveStats.sarCount,           color: '#3B82F6' },
                  { label: 'Optical',        count: archiveStats.opticalCount,       color: '#22C55E' },
                  { label: 'Multispectral',  count: archiveStats.multispectralCount, color: '#F59E0B' },
                ].map(({ label, count, color }, i, arr) => (
                  <div key={label} className="px-4 py-2 flex items-center justify-between"
                    style={i < arr.length - 1 ? { borderBottom: '1px solid rgba(255,255,255,0.04)' } : {}}>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className="text-caption text-text-tertiary">{label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-1 rounded-full" style={{ width: Math.round((count / archiveStats.totalObservations) * 44), background: color, opacity: 0.45 }} />
                      <span className="font-mono text-caption" style={{ color }}>{(count / 1000).toFixed(0)}K</span>
                    </div>
                  </div>
                ))}
                <div className="px-4 py-2 flex items-center justify-between"
                  style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <span className="text-overline text-text-tertiary">Coverage</span>
                  <span className="font-mono text-caption text-text-secondary">510M km²</span>
                </div>
              </div>

              {/* Flood Watch */}
              <div className="glass-panel rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 flex items-center justify-between"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span className="overline-label">Flood Watch</span>
                  <Waves className="w-3 h-3" style={{ color: '#3B82F6' }} />
                </div>
                {floodWatchRegions.map((fw, i) => {
                  const livePct = liveFloodPct[i] ?? parseFloat(fw.change)
                  const changeStr = `${livePct >= 0 ? '+' : ''}${livePct.toFixed(1)}%`
                  return (
                  <div key={fw.region}
                    className="px-4 py-2.5 flex items-center gap-2.5 hover:bg-white-3 transition-colors cursor-pointer"
                    style={i < floodWatchRegions.length - 1 ? { borderBottom: '1px solid rgba(255,255,255,0.04)' } : {}}>
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: FLOOD_LEVEL_COLOR[fw.level], boxShadow: fw.level === 'ALERT' ? `0 0 5px ${FLOOD_LEVEL_COLOR[fw.level]}99` : 'none' }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-caption text-text-secondary truncate">{fw.region}</div>
                      <div className="text-overline text-text-tertiary mt-0.5">{fw.sat}</div>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                      <span className="font-mono text-overline font-semibold" style={{ color: FLOOD_LEVEL_COLOR[fw.level] }}>{fw.level}</span>
                      <span className="font-mono text-overline" style={{ color: livePct >= 0 ? '#EF4444' : '#22C55E' }}>{changeStr}</span>
                    </div>
                  </div>
                )})}
              </div>

              {/* Mission Feed */}
              <div className="glass-panel rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 flex items-center justify-between"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span className="overline-label">Mission Feed</span>
                  <div className="status-live" />
                </div>
                {/* Active mission entry at the top when mission is running */}
                {hasMission && (
                  <div
                    className="flex items-start gap-2 px-4 py-2.5 hover:bg-white-3 transition-colors cursor-pointer"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(59,130,246,0.04)' }}
                    onClick={() => setActiveView('results')}
                  >
                    <div className="w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0 animate-pulse"
                      style={{ background: '#3B82F6', boxShadow: '0 0 5px #3B82F688' }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-caption font-medium leading-snug" style={{ color: '#60A5FA' }}>
                        Intelligence retrieval complete · {missionAnalytics.retrieval.total_results} scenes
                      </div>
                      <div className="text-overline text-text-tertiary mt-0.5 truncate">
                        {activeMission.name.slice(0, 34)}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="text-overline text-text-tertiary">now</span>
                      <span className={STATUS_BADGE['ACTIVE']}>ACTIVE</span>
                    </div>
                  </div>
                )}
                {MISSION_FEED_STATIC.slice(0, hasMission ? 5 : 7).map((item, i) => {
                  const agoSec = FEED_BASE_OFFSETS[i] + tick
                  return (
                    <div key={i}
                      className="flex items-start gap-2 px-4 py-2.5 hover:bg-white-3 transition-colors cursor-pointer"
                      style={i < MISSION_FEED_STATIC.length - 1 ? { borderBottom: '1px solid rgba(255,255,255,0.04)' } : {}}>
                      <div className="w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0"
                        style={{ background: item.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-caption text-text-secondary leading-snug">{item.text}</div>
                        <div className="text-overline text-text-tertiary mt-0.5 truncate">{item.sub}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className="text-overline text-text-tertiary">{fmtAgo(agoSec)}</span>
                        <span className={STATUS_BADGE[item.status]}>{item.status}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>

            {/* ── RIGHT PANEL ─────────────────────────────────── */}
            <motion.div {...fadeR} transition={{ ...fadeR.transition, delay: 0.3 }}
              className="absolute top-3 right-16 flex flex-col gap-2 z-10" style={{ width: 236 }}>

              {/* UTC Clock */}
              <div className="glass-panel rounded-xl px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="status-live" />
                  <span className="font-mono text-caption text-text-secondary">{utcStr}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="overline-label">UTC</span>
                  <span className="font-mono text-overline text-text-tertiary">DOY {doy}</span>
                </div>
              </div>

              {/* Satellite Health */}
              <div className="glass-panel rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 flex items-center justify-between"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span className="overline-label">Satellite Health</span>
                  <span className="font-mono text-overline text-text-tertiary">{satelliteHealth.filter(s => s.live).length}/{satelliteHealth.length} live</span>
                </div>
                {satelliteHealth.map((s, i) => {
                  const bat = liveBat[i] ?? s.bat
                  const batColor = bat > 80 ? '#22C55E' : bat > 50 ? '#F59E0B' : '#EF4444'
                  return (
                  <div key={s.name}
                    className="px-4 py-2 flex items-center gap-2 hover:bg-white-3 transition-colors"
                    style={i < satelliteHealth.length - 1 ? { borderBottom: '1px solid rgba(255,255,255,0.04)' } : {}}>
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: SAT_STATUS_COLOR[s.status] ?? '#64748B', boxShadow: s.live ? `0 0 4px ${SAT_STATUS_COLOR[s.status]}88` : 'none' }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-caption text-text-primary font-medium truncate" style={{ fontSize: 10.5 }}>{s.name}</div>
                      <div className="text-overline text-text-tertiary">{s.agency} · {s.mode}</div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="font-mono text-overline" style={{ color: batColor }}>{bat.toFixed(0)}%</span>
                      <BatteryBar pct={bat} color={batColor} />
                    </div>
                  </div>
                )})}
              </div>

              {/* Acquisition Queue */}
              <div className="glass-panel rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 flex items-center justify-between"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span className="overline-label">Acquisition Queue</span>
                  <span className="mission-badge mission-badge-active">{acquisitionQueue.length} QUEUED</span>
                </div>
                {acquisitionQueue.slice(0, 4).map((aq, i) => {
                  // RISAT-2B (index 1) uses live countdown; Cartosat-3 (index 0) uses NOW
                  const displayEta = aq.satellite === 'RISAT-2B'
                    ? formatEta(etaSeconds)
                    : aq.eta
                  const isLive = displayEta === 'NOW'
                  return (
                  <div key={aq.sceneId}
                    className="px-4 py-2.5 hover:bg-white-3 transition-colors cursor-pointer"
                    style={i < 3 ? { borderBottom: '1px solid rgba(255,255,255,0.04)' } : {}}>
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full flex-shrink-0"
                        style={{ background: aq.priority === 'HIGH' ? '#EF4444' : '#64748B', marginTop: 1 }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-caption text-text-primary font-medium" style={{ fontSize: 10.5 }}>{aq.satellite}</span>
                          <span className="font-mono text-overline"
                            style={{ color: isLive ? '#14B8A6' : aq.priority === 'HIGH' ? '#EF4444' : '#64748B' }}>
                            {displayEta}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-overline text-text-tertiary truncate">{aq.region}</span>
                          <span className="font-mono text-overline" style={{ color: '#4A5568' }}>· {aq.mode}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )})}
              </div>

              {/* Active Downlinks */}
              <div className="glass-panel rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 flex items-center justify-between"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span className="overline-label">Active Downlinks</span>
                  <Radio className="w-3 h-3 text-teal-primary" />
                </div>
                {activeDownlinks.map((dl, i) => {
                  const prog = liveProgress[i] ?? dl.progress
                  const rxGB = (prog * parseFloat(dl.total)).toFixed(1)
                  return (
                  <div key={dl.satellite}
                    className="px-4 py-2.5"
                    style={i < activeDownlinks.length - 1 ? { borderBottom: '1px solid rgba(255,255,255,0.04)' } : {}}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-caption text-text-secondary font-medium" style={{ fontSize: 10.5 }}>
                        {dl.satellite}
                        <span className="text-text-tertiary font-normal"> → {dl.station}</span>
                      </span>
                      <span className="font-mono text-overline text-teal-primary">{dl.rate}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ProgressBar value={prog} color="#14B8A6" />
                      <span className="font-mono text-overline text-text-tertiary flex-shrink-0">{Math.round(prog * 100)}%</span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-overline text-text-tertiary">{rxGB} GB / {dl.total}</span>
                      <span className="font-mono text-overline text-text-tertiary">ORB#{dl.orb}</span>
                    </div>
                  </div>
                )})}
              </div>
            </motion.div>

            {/* ── Earth layer selector ─────────────────────────── */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.35 }}
              className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
              <div className="glass-panel rounded-xl px-3.5 py-2 flex items-center gap-1.5">
                <span className="text-overline text-text-tertiary mr-0.5">LAYER</span>
                {EARTH_LAYERS.map(({ id, label, color }) => (
                  <button key={id} onClick={() => setEarthLayer(id)}
                    className={cn('layer-btn', earthLayer === id ? 'layer-btn-active' : 'layer-btn-inactive')}
                    style={earthLayer === id ? { borderColor: `${color}55`, color, background: `${color}12` } : {}}>
                    {label}
                  </button>
                ))}
              </div>
            </motion.div>

            {/* ── Globe controls (bottom-left) ─────────────────── */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.35 }}
              className="absolute left-16 bottom-20 flex flex-col gap-1.5 z-10">
              <button onClick={toggleOrbits}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-body-s transition-all glass-panel"
                style={{ color: showOrbits ? '#14B8A6' : '#64748B' }}>
                <Satellite className="w-3.5 h-3.5" />
                Orbits
              </button>
              <button onClick={toggleHotspots}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-body-s transition-all glass-panel"
                style={{ color: showHotspots ? '#3B82F6' : '#64748B' }}>
                <Layers className="w-3.5 h-3.5" />
                Hotspots
              </button>
            </motion.div>

            {/* ── Coordinate / telemetry bar ───────────────────── */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65, duration: 0.35 }}
              className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10">
              <div className="glass-panel rounded-xl px-5 py-2 flex items-center gap-4" style={{ whiteSpace: 'nowrap' }}>
                <span className="font-mono text-caption text-text-tertiary">26.120°N  91.740°E</span>
                <div className="w-px h-3" style={{ background: 'rgba(45,55,72,0.5)' }} />
                <span className="font-mono text-caption text-text-tertiary">WGS84 · UTM 45R</span>
                <div className="w-px h-3" style={{ background: 'rgba(45,55,72,0.5)' }} />
                <div className="flex items-center gap-1.5">
                  <div className="status-live" />
                  <span className="font-mono text-caption text-teal-primary">BHUVAN LINK</span>
                </div>
                <div className="w-px h-3" style={{ background: 'rgba(45,55,72,0.5)' }} />
                {hasMission ? (
                  <span className="font-mono text-caption font-semibold" style={{ color: '#60A5FA' }}>
                    {activeMission.id.slice(0, 14)} · MISSION ACTIVE
                  </span>
                ) : (
                  <span className="font-mono text-caption text-text-tertiary">BF2024-RISAT2B-001</span>
                )}
                <div className="w-px h-3" style={{ background: 'rgba(45,55,72,0.5)' }} />
                <span className="font-mono text-caption uppercase tracking-wider" style={{ color: '#60A5FA' }}>{earthLayer} layer</span>
              </div>
            </motion.div>

            {/* ── Quick actions (bottom-right) ─────────────────── */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.75, duration: 0.35 }}
              className="absolute bottom-20 right-16 flex flex-col gap-2 z-10">
              <button onClick={() => setActiveView('search')} className="btn-primary px-5 py-2.5 text-body-s">
                Query Scene
              </button>
              <button onClick={() => setActiveView('satellite-tracker')}
                className="glass-panel text-text-secondary text-body-s px-5 py-2.5 rounded-lg hover:text-text-primary transition-all">
                Live Sat. Tracker
              </button>
              <button onClick={toggleCopilot}
                className="glass-panel text-text-secondary text-body-s px-5 py-2.5 rounded-lg hover:text-text-primary transition-all">
                AKSHA Copilot
              </button>
            </motion.div>

            {/* ── Anomaly alert strip ───────────────────────────── */}
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9, duration: 0.35 }}
              className="absolute top-14 left-1/2 -translate-x-1/2 z-10">
              <div className="flex items-center gap-2 px-4 py-1.5 rounded-lg"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
                <AlertTriangle className="w-3 h-3 text-danger" />
                <span className="font-mono text-caption" style={{ color: '#EF4444' }}>
                  PRIORITY — Flood level crossing detected · Brahmaputra Basin · RISAT-2B ETA {formatEta(etaSeconds)}
                </span>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
