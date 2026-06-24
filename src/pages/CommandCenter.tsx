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

const MISSION_FEED = [
  { text: 'Flood signature detected',         sub: 'Brahmaputra Basin · 26.12°N 91.74°E', ago: '2m',   color: '#EF4444', status: 'ALERT'      },
  { text: 'SAR acquisition — 847 scenes',     sub: 'RISAT-2B · Orbit 18924 · ISTRAC',     ago: '12m',  color: '#3B82F6', status: 'PROCESSING' },
  { text: 'Retrieval complete · 94.2% match', sub: 'Scene R2B-24062402 · 1.8s latency',   ago: '1h',   color: '#14B8A6', status: 'ACTIVE'     },
  { text: 'Sentinel-1A overpass commenced',   sub: 'NE India corridor · Pass S1A-49312',  ago: '2h',   color: '#22C55E', status: 'ACTIVE'     },
  { text: 'Cloud cover alert · 78%',          sub: 'Tamil Nadu coast · Cycle BOB-04',     ago: '3h',   color: '#F59E0B', status: 'ALERT'      },
  { text: 'Cartosat-3 PAN acquired',          sub: 'Mumbai MMR · Scene CS3-23441',        ago: '4h',   color: '#3B82F6', status: 'ARCHIVED'   },
  { text: 'NDVI anomaly — −0.42 NDWI',        sub: 'Rajasthan Plains · Drought zone',     ago: '5h',   color: '#F59E0B', status: 'ALERT'      },
]

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

export default function CommandCenter() {
  const isLoaded       = useAppStore((s) => s.isLoaded)
  const setEarthLoaded = useAppStore((s) => s.setEarthLoaded)
  const setActiveView  = useAppStore((s) => s.setActiveView)
  const toggleCopilot  = useAppStore((s) => s.toggleCopilot)
  const toggleOrbits   = useAppStore((s) => s.toggleOrbits)
  const toggleHotspots = useAppStore((s) => s.toggleHotspots)
  const showOrbits     = useAppStore((s) => s.showOrbits)
  const showHotspots   = useAppStore((s) => s.showHotspots)
  const earthLayer     = useAppStore((s) => s.earthLayer)
  const setEarthLayer  = useAppStore((s) => s.setEarthLayer)
  const [tick, setTick] = useState(0)

  useEffect(() => { const t = setTimeout(() => setEarthLoaded(true), 5000); return () => clearTimeout(t) }, [setEarthLoaded])
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 1000); return () => clearInterval(t) }, [])

  const now    = new Date()
  const utcStr = now.toUTCString().slice(5, 25)
  const doy    = Math.ceil((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000)

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div className="absolute inset-0"><EarthGlobe /></div>

      {/* Boot screen */}
      <AnimatePresence>
        {!isLoaded && (
          <motion.div key="loader" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.2, delay: 0.4 }}
            className="absolute inset-0 flex flex-col items-center justify-center z-50" style={{ background: '#080D16' }}>
            <motion.div initial={{ scale: 0.88, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.65 }}
              className="flex flex-col items-center gap-6">
              <div className="w-14 h-14 rounded-full relative flex items-center justify-center"
                style={{ border: '1px solid rgba(59,130,246,0.18)', background: 'rgba(59,130,246,0.05)' }}>
                <div className="absolute inset-1 rounded-full border animate-spin"
                  style={{ borderColor: 'rgba(59,130,246,0.12)', borderTopColor: '#3B82F6' }} />
                <Satellite className="w-5 h-5 text-blue-primary opacity-60" />
              </div>
              <div className="text-center">
                <div className="font-display text-display-xl font-bold text-text-primary tracking-tight">AKSHA</div>
                <div className="text-body-m text-text-tertiary mt-1.5 tracking-wide">Earth Intelligence Beyond Imagery</div>
                <div className="font-mono text-caption text-text-tertiary mt-1 opacity-60">
                  ISRO BHUVAN · MISSION CONTROL INTERFACE · v3.2.1
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-teal-primary animate-pulse" />
                <span className="font-mono text-caption text-text-tertiary">Establishing ISTRAC uplink…</span>
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
                  <div className="flex items-center gap-1.5 mt-1 mb-2.5">
                    <div className="status-live" style={{ width: 5, height: 5 }} />
                    <span className="font-mono text-caption text-teal-primary">127 scenes/hr ingestion</span>
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
                {floodWatchRegions.map((fw, i) => (
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
                      <span className="font-mono text-overline" style={{ color: fw.change.startsWith('+') ? '#EF4444' : '#22C55E' }}>{fw.change}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Mission Feed */}
              <div className="glass-panel rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 flex items-center justify-between"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span className="overline-label">Mission Feed</span>
                  <div className="status-live" />
                </div>
                {MISSION_FEED.map((item, i) => (
                  <div key={i}
                    className="flex items-start gap-2 px-4 py-2.5 hover:bg-white-3 transition-colors cursor-pointer"
                    style={i < MISSION_FEED.length - 1 ? { borderBottom: '1px solid rgba(255,255,255,0.04)' } : {}}>
                    <div className="w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0"
                      style={{ background: item.color, boxShadow: i === 0 ? `0 0 5px ${item.color}88` : 'none' }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-caption text-text-secondary leading-snug">{item.text}</div>
                      <div className="text-overline text-text-tertiary mt-0.5 truncate">{item.sub}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="text-overline text-text-tertiary">{item.ago}</span>
                      <span className={STATUS_BADGE[item.status]}>{item.status}</span>
                    </div>
                  </div>
                ))}
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
                {satelliteHealth.map((s, i) => (
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
                      <span className="font-mono text-overline" style={{ color: s.bat > 80 ? '#22C55E' : s.bat > 50 ? '#F59E0B' : '#EF4444' }}>{s.bat}%</span>
                      <BatteryBar pct={s.bat} color={s.bat > 80 ? '#22C55E' : s.bat > 50 ? '#F59E0B' : '#EF4444'} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Acquisition Queue */}
              <div className="glass-panel rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 flex items-center justify-between"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span className="overline-label">Acquisition Queue</span>
                  <span className="mission-badge mission-badge-active">{acquisitionQueue.length} QUEUED</span>
                </div>
                {acquisitionQueue.slice(0, 4).map((aq, i) => (
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
                            style={{ color: aq.eta === 'NOW' ? '#14B8A6' : aq.priority === 'HIGH' ? '#EF4444' : '#64748B' }}>
                            {aq.eta}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-overline text-text-tertiary truncate">{aq.region}</span>
                          <span className="font-mono text-overline" style={{ color: '#4A5568' }}>· {aq.mode}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Active Downlinks */}
              <div className="glass-panel rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 flex items-center justify-between"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span className="overline-label">Active Downlinks</span>
                  <Radio className="w-3 h-3 text-teal-primary" />
                </div>
                {activeDownlinks.map((dl, i) => (
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
                      <ProgressBar value={dl.progress} color="#14B8A6" />
                      <span className="font-mono text-overline text-text-tertiary flex-shrink-0">{Math.round(dl.progress * 100)}%</span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-overline text-text-tertiary">{dl.rx} / {dl.total}</span>
                      <span className="font-mono text-overline text-text-tertiary">ORB#{dl.orb}</span>
                    </div>
                  </div>
                ))}
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
                <span className="font-mono text-caption text-text-tertiary">MSN-24062</span>
                <div className="w-px h-3" style={{ background: 'rgba(45,55,72,0.5)' }} />
                <span className="font-mono text-caption uppercase tracking-wider" style={{ color: '#60A5FA' }}>{earthLayer} layer</span>
              </div>
            </motion.div>

            {/* ── Quick actions (bottom-right) ─────────────────── */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.75, duration: 0.35 }}
              className="absolute bottom-20 right-16 flex flex-col gap-2 z-10">
              <button onClick={() => setActiveView('search')} className="btn-primary px-5 py-2.5 text-body-s">
                Upload & Search
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
                  PRIORITY — Flood level crossing detected · Brahmaputra Basin · RISAT-2B ETA 4m 12s
                </span>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
