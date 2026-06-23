import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Layers, Satellite, AlertTriangle, TrendingDown, Waves, TreeDeciduous, Building2, Thermometer } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import EarthGlobe from '@/components/earth/EarthGlobe'
import { archiveStats } from '@/data/mockResults'
import { globeHotspots } from '@/data/satellites'
import { cn } from '@/lib/utils'

type EarthLayer = 'optical' | 'sar' | 'multispectral' | 'flood' | 'vegetation' | 'urban'

const MISSION_FEED = [
  { text: 'Flood signature detected',         sub: 'Brahmaputra Basin, Assam',    ago: '2m',  color: '#EF4444', status: 'ALERT'      },
  { text: 'SAR batch ingested — 847 scenes',  sub: 'RISAT-2B · ISTRAC Bangalore', ago: '12m', color: '#3B82F6', status: 'PROCESSING' },
  { text: 'Retrieval complete · 94.2% match', sub: 'Query RISAT-2B_SAR_240912',   ago: '1h',  color: '#14B8A6', status: 'ACTIVE'     },
  { text: 'Sentinel-1A overpass commenced',   sub: 'NE India corridor',            ago: '2h',  color: '#22C55E', status: 'ACTIVE'     },
  { text: 'Cloud cover alert · 78%',          sub: 'Tamil Nadu coast',             ago: '3h',  color: '#F59E0B', status: 'ALERT'      },
  { text: 'Cartosat-3 optical acquired',      sub: 'Mumbai Metropolitan Region',   ago: '4h',  color: '#3B82F6', status: 'ARCHIVED'   },
]

const ACTIVE_SENSORS = [
  { name: 'RISAT-2B',        agency: 'ISRO', mode: 'FRS-1',   pass: '4m',    live: true  },
  { name: 'Sentinel-1A',     agency: 'ESA',  mode: 'IW',      pass: '14:32', live: true  },
  { name: 'Cartosat-3',      agency: 'ISRO', mode: 'PAN',     pass: 'NOW',   live: true  },
  { name: 'ALOS-2 PALSAR-2', agency: 'JAXA', mode: 'SM',      pass: '42m',   live: false },
  { name: 'Sentinel-2A',     agency: 'ESA',  mode: 'MSI L2A', pass: '1h 8m', live: true  },
]

const EARTH_LAYERS: { id: EarthLayer; label: string; icon: React.ElementType; color: string }[] = [
  { id: 'optical',       label: 'Optical',       icon: Satellite,   color: '#22C55E' },
  { id: 'sar',           label: 'SAR',           icon: Layers,      color: '#3B82F6' },
  { id: 'multispectral', label: 'Multispectral', icon: Layers,      color: '#F59E0B' },
  { id: 'flood',         label: 'Flood',         icon: Waves,       color: '#60A5FA' },
  { id: 'vegetation',    label: 'Vegetation',    icon: TreeDeciduous, color: '#22C55E' },
  { id: 'urban',         label: 'Urban Growth',  icon: Building2,   color: '#F59E0B' },
]

const HOTSPOT_DETECTIONS = [
  { label: 'Active flood zone',    region: 'Brahmaputra Basin',  type: 'flood',         severity: 'HIGH',   change: '+12% extent',  icon: Waves,         color: '#3B82F6' },
  { label: 'Deforestation alert',  region: 'Western Ghats',      type: 'deforestation', severity: 'MEDIUM', change: '-840 km²',     icon: TrendingDown,  color: '#EF4444' },
  { label: 'Urban expansion',      region: 'Delhi NCR corridor', type: 'urban',         severity: 'LOW',    change: '+2.3% YoY',    icon: Building2,     color: '#F59E0B' },
  { label: 'Water stress',         region: 'Rajasthan plains',   type: 'water',         severity: 'HIGH',   change: 'NDWI −0.42',   icon: Waves,         color: '#EF4444' },
  { label: 'Heat anomaly',         region: 'Vidarbha, MH',       type: 'heat',          severity: 'MEDIUM', change: '+3.2°C above', icon: Thermometer,   color: '#F59E0B' },
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

const SEVERITY_COLOR: Record<string, string> = {
  HIGH:   '#EF4444',
  MEDIUM: '#F59E0B',
  LOW:    '#64748B',
}

const fadeSlideLeft = {
  initial: { opacity: 0, x: -18 },
  animate: { opacity: 1, x: 0 },
  transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] },
}
const fadeSlideRight = {
  initial: { opacity: 0, x: 18 },
  animate: { opacity: 1, x: 0 },
  transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] },
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
  const [, setTick]    = useState(0)
  const [hotspotTab, setHotspotTab] = useState<'zones' | 'detections'>('zones')

  useEffect(() => {
    const t = setTimeout(() => setEarthLoaded(true), 5000)
    return () => clearTimeout(t)
  }, [setEarthLoaded])

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const now    = new Date()
  const utcStr = now.toUTCString().slice(17, 25)

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Earth — fills viewport */}
      <div className="absolute inset-0">
        <EarthGlobe />
      </div>

      {/* Loading screen */}
      <AnimatePresence>
        {!isLoaded && (
          <motion.div
            key="loader"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, delay: 0.4 }}
            className="absolute inset-0 flex flex-col items-center justify-center z-50"
            style={{ background: '#080D16' }}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.75, ease: [0, 0, 0.2, 1] }}
              className="flex flex-col items-center gap-7"
            >
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center relative"
                style={{ border: '1px solid rgba(59,130,246,0.18)', background: 'rgba(59,130,246,0.05)' }}
              >
                <div
                  className="absolute inset-1 rounded-full border animate-spin"
                  style={{ borderColor: 'rgba(59,130,246,0.12)', borderTopColor: '#3B82F6' }}
                />
                <Satellite className="w-6 h-6 text-blue-primary opacity-60" />
              </div>
              <div className="text-center">
                <div className="font-display text-display-xl font-bold text-text-primary tracking-tight">
                  AKSHA
                </div>
                <div className="text-body-m text-text-tertiary mt-2 tracking-wide">
                  Earth Intelligence Beyond Imagery
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-teal-primary animate-pulse" />
                <span className="text-caption text-text-tertiary">Initializing ISRO Bhuvan connection…</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Globe overlays */}
      <AnimatePresence>
        {isLoaded && (
          <>
            {/* ── Left: Archive Status + Mission Feed ──────────── */}
            <motion.div
              {...fadeSlideLeft}
              transition={{ ...fadeSlideLeft.transition, delay: 0.3 }}
              className="absolute top-3 left-16 w-58 flex flex-col gap-2 z-10"
              style={{ width: 230 }}
            >
              {/* Archive stats */}
              <div className="glass-panel rounded-xl px-4 py-3.5">
                <div className="overline-label mb-3">Archive Status</div>
                <div className="flex items-baseline gap-1.5 mb-3">
                  <span className="font-mono font-bold text-heading-2 text-text-primary">
                    {(archiveStats.totalObservations / 1_000_000).toFixed(2)}M
                  </span>
                  <span className="text-caption text-text-tertiary">observations</span>
                </div>
                <div className="space-y-2">
                  {[
                    { label: 'SAR',          count: archiveStats.sarCount,           color: '#3B82F6' },
                    { label: 'Optical',       count: archiveStats.opticalCount,       color: '#22C55E' },
                    { label: 'Multispectral', count: archiveStats.multispectralCount, color: '#F59E0B' },
                  ].map(({ label, count, color }) => (
                    <div key={label} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                        <span className="text-caption text-text-tertiary">{label}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div
                          className="h-1 rounded-full"
                          style={{
                            width: Math.round((count / archiveStats.totalObservations) * 40),
                            background: color,
                            opacity: 0.5,
                          }}
                        />
                        <span className="font-mono text-caption" style={{ color }}>
                          {(count / 1000).toFixed(0)}K
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mission feed */}
              <div className="glass-panel rounded-xl overflow-hidden">
                <div
                  className="px-4 py-2.5 flex items-center justify-between"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <div className="overline-label">Mission Feed</div>
                  <div className="status-live" />
                </div>
                {MISSION_FEED.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2.5 px-4 py-2.5 transition-colors hover:bg-white-3 cursor-pointer"
                    style={i < MISSION_FEED.length - 1 ? { borderBottom: '1px solid rgba(255,255,255,0.04)' } : {}}
                  >
                    <div
                      className="w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0"
                      style={{ background: item.color, boxShadow: i === 0 ? `0 0 5px ${item.color}88` : 'none' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-caption text-text-secondary leading-snug">{item.text}</div>
                      <div className="text-overline text-text-tertiary mt-0.5 truncate">{item.sub}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <div className="text-overline text-text-tertiary">{item.ago}</div>
                      <span className={STATUS_BADGE[item.status]}>{item.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* ── Right: Live Time + Sensors + Hotspot Detections ─ */}
            <motion.div
              {...fadeSlideRight}
              transition={{ ...fadeSlideRight.transition, delay: 0.45 }}
              className="absolute top-3 right-16 flex flex-col gap-2 z-10"
              style={{ width: 220 }}
            >
              {/* UTC clock */}
              <div className="glass-panel rounded-xl px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="status-live" />
                  <span className="font-mono text-caption text-text-secondary">{utcStr} UTC</span>
                </div>
                <span className="overline-label">LIVE</span>
              </div>

              {/* Active sensor passes */}
              <div className="glass-panel rounded-xl overflow-hidden">
                <div
                  className="px-4 py-2.5"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <div className="overline-label">Active Sensors</div>
                </div>
                {ACTIVE_SENSORS.map((s, i) => (
                  <div
                    key={s.name}
                    className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-white-3 transition-colors"
                    style={i < ACTIVE_SENSORS.length - 1 ? { borderBottom: '1px solid rgba(255,255,255,0.04)' } : {}}
                  >
                    <div
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{
                        background: s.live ? '#14B8A6' : '#4A5568',
                        boxShadow: s.live ? '0 0 5px rgba(20,184,166,0.7)' : 'none',
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-caption text-text-primary font-medium truncate">{s.name}</div>
                      <div className="text-overline text-text-tertiary">{s.agency} · {s.mode}</div>
                    </div>
                    <div
                      className="font-mono text-overline flex-shrink-0"
                      style={{ color: s.pass === 'NOW' ? '#14B8A6' : '#64748B' }}
                    >
                      {s.pass}
                    </div>
                  </div>
                ))}
              </div>

              {/* Hotspot detections */}
              <div className="glass-panel rounded-xl overflow-hidden">
                <div
                  className="px-4 py-2.5 flex items-center justify-between"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <div className="overline-label">Auto-Detected</div>
                  <AlertTriangle className="w-3 h-3 text-warning" />
                </div>
                {/* Tab switcher */}
                <div
                  className="flex"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                >
                  {(['zones', 'detections'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setHotspotTab(tab)}
                      className="flex-1 py-1.5 text-overline capitalize transition-all"
                      style={{
                        color: hotspotTab === tab ? '#F8FAFC' : '#4A5568',
                        borderBottom: hotspotTab === tab ? '1px solid #3B82F6' : '1px solid transparent',
                      }}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                {hotspotTab === 'zones' && globeHotspots.slice(0, 4).map((hs, i) => (
                  <div
                    key={hs.id}
                    className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-white-3 transition-colors"
                    style={i < 3 ? { borderBottom: '1px solid rgba(255,255,255,0.04)' } : {}}
                  >
                    <div
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: HOTSPOT_COLORS[hs.type] ?? '#64748B' }}
                    />
                    <span className="text-caption text-text-secondary truncate">
                      {hs.label.split('—')[0].trim()}
                    </span>
                  </div>
                ))}

                {hotspotTab === 'detections' && HOTSPOT_DETECTIONS.slice(0, 4).map((d, i) => (
                  <div
                    key={d.label}
                    className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-white-3 transition-colors cursor-pointer"
                    style={i < 3 ? { borderBottom: '1px solid rgba(255,255,255,0.04)' } : {}}
                  >
                    <d.icon className="w-3 h-3 flex-shrink-0" style={{ color: d.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-caption text-text-secondary truncate">{d.label}</div>
                      <div className="text-overline text-text-tertiary truncate">{d.region}</div>
                    </div>
                    <div
                      className="text-overline flex-shrink-0 font-semibold"
                      style={{ color: SEVERITY_COLOR[d.severity] }}
                    >
                      {d.severity}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* ── Multi-Layer Earth View toggle ─────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55, duration: 0.4 }}
              className="absolute left-1/2 -translate-x-1/2 top-3 z-10"
            >
              <div
                className="glass-panel rounded-xl px-4 py-2 flex items-center gap-1.5"
              >
                <span className="text-overline text-text-tertiary mr-1">LAYER</span>
                {EARTH_LAYERS.map(({ id, label, color }) => (
                  <button
                    key={id}
                    onClick={() => setEarthLayer(id)}
                    className={cn('layer-btn', earthLayer === id ? 'layer-btn-active' : 'layer-btn-inactive')}
                    style={earthLayer === id ? { borderColor: `${color}60`, color, background: `${color}12` } : {}}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </motion.div>

            {/* ── Globe layer controls ───────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.4 }}
              className="absolute left-16 bottom-20 flex flex-col gap-1.5 z-10"
            >
              <button
                onClick={toggleOrbits}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-body-s transition-all glass-panel"
                style={{ color: showOrbits ? '#14B8A6' : '#64748B' }}
              >
                <Satellite className="w-3.5 h-3.5" />
                Orbits
              </button>
              <button
                onClick={toggleHotspots}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-body-s transition-all glass-panel"
                style={{ color: showHotspots ? '#3B82F6' : '#64748B' }}
              >
                <Layers className="w-3.5 h-3.5" />
                Hotspots
              </button>
            </motion.div>

            {/* ── Bottom coordinate bar ─────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.4 }}
              className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10"
            >
              <div
                className="glass-panel rounded-xl px-6 py-2.5 flex items-center gap-5"
                style={{ whiteSpace: 'nowrap' }}
              >
                <div className="font-mono text-caption text-text-tertiary">26.120°N  91.740°E</div>
                <div className="w-px h-3" style={{ background: 'rgba(45,55,72,0.5)' }} />
                <div className="font-mono text-caption text-text-tertiary">WGS84 · UTM 45R</div>
                <div className="w-px h-3" style={{ background: 'rgba(45,55,72,0.5)' }} />
                <div className="flex items-center gap-1.5">
                  <div className="status-live" />
                  <span className="font-mono text-caption text-teal-primary">LIVE</span>
                </div>
                <div className="w-px h-3" style={{ background: 'rgba(45,55,72,0.5)' }} />
                <div className="font-mono text-caption text-text-tertiary">Alt 512m MSL</div>
                <div className="w-px h-3" style={{ background: 'rgba(45,55,72,0.5)' }} />
                <div className="font-mono text-caption text-text-tertiary uppercase tracking-wider" style={{ color: '#60A5FA' }}>
                  {earthLayer} layer
                </div>
              </div>
            </motion.div>

            {/* ── Quick actions ──────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.85, duration: 0.4 }}
              className="absolute bottom-20 right-16 flex flex-col gap-2 z-10"
            >
              <button
                onClick={() => setActiveView('search')}
                className="btn-primary px-5 py-2.5 text-body-s"
              >
                Upload & Search
              </button>
              <button
                onClick={() => setActiveView('satellite-tracker')}
                className="glass-panel text-text-secondary text-body-s px-5 py-2.5 rounded-lg hover:text-text-primary transition-all"
              >
                Live Sat. Tracker
              </button>
              <button
                onClick={toggleCopilot}
                className="glass-panel text-text-secondary text-body-s px-5 py-2.5 rounded-lg hover:text-text-primary transition-all"
              >
                Ask AKSHA Copilot
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
